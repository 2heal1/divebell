import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

import { captureCodeUsageExperience, createPageExperienceInitScript } from "../dist/experience.js";

// Execute the shipped recorder with deterministic browser events and a clock.
// Tests exercise the transition rules rather than matching the script's text.
function createPage() {
  let now = 0;
  let nextTimerId = 1;
  const timers = new Map();
  const listeners = new Map();
  const requests = [];
  const schedule = (callback, delay, repeat) => {
    const id = nextTimerId++;
    timers.set(id, { callback, next: now + delay, repeat });
    return id;
  };
  class PerformanceObserver {
    static supportedEntryTypes = [];
    observe() {}
    disconnect() {}
  }
  class MutationObserver {
    observe() {}
    disconnect() {}
  }
  const context = {
    performance: {
      now: () => now,
      getEntriesByName: () => [],
      getEntriesByType: () => [],
      memory: { usedJSHeapSize: 100, totalJSHeapSize: 200 }
    },
    document: {
      readyState: "loading",
      documentElement: {},
      body: {},
      addEventListener: (name, callback) => listeners.set(name, callback)
    },
    location: { href: "https://example.test/", pathname: "/" },
    PerformanceObserver,
    MutationObserver,
    URL,
    setInterval: (callback, delay) => schedule(callback, delay, delay),
    clearInterval: (id) => timers.delete(id),
    setTimeout: (callback, delay) => schedule(callback, delay, 0),
    clearTimeout: (id) => timers.delete(id),
    fetch: () => new Promise((resolve) => requests.push(resolve))
  };
  runInNewContext(createPageExperienceInitScript(), context);
  const advanceTo = (time) => {
    assert.ok(time >= now, "clock must move forward");
    while (true) {
      const entry = [...timers.entries()]
        .filter(([, timer]) => timer.next <= time)
        .sort(([, left], [, right]) => left.next - right.next)[0];
      if (!entry) break;
      const [id, timer] = entry;
      now = timer.next;
      if (timer.repeat) timer.next += timer.repeat;
      else timers.delete(id);
      timer.callback();
    }
    now = time;
  };
  return {
    advanceTo,
    domContentLoaded(time) {
      advanceTo(time);
      context.document.readyState = "interactive";
      listeners.get("DOMContentLoaded")();
    },
    request(url) {
      const index = requests.length;
      const promise = context.fetch(url);
      return async (time) => {
        advanceTo(time);
        requests[index]({});
        await promise;
      };
    },
    result: () => context.__DIVEBELL_PAGE_EXPERIENCE__.finish()
  };
}

test("initial fetch crossing DOMContentLoaded drains without a ten-second floor", async () => {
  const page = createPage();
  page.advanceTo(50);
  const complete = page.request("https://example.test/api/initial");
  page.domContentLoaded(100);
  await complete(200);
  page.advanceTo(650);
  assert.equal(page.result().pending, true);
  page.advanceTo(700);
  const { ready } = page.result();
  assert.equal(ready.endTimeMs, 700);
  assert.equal(ready.spec.version, 3);
  assert.equal(ready.initialNetworkDrain.fallbackUsed, false);
  assert.equal(ready.initialNetworkDrain.inflightRequests, 0);
});

test("requests started after DOMContentLoaded reset drain and render quiet time", async () => {
  const page = createPage();
  page.domContentLoaded(100);
  page.advanceTo(550);
  const complete = page.request("https://example.test/api/data");
  page.advanceTo(600);
  assert.equal(page.result().pending, true);
  await complete(800);
  page.advanceTo(1250);
  assert.equal(page.result().pending, true);
  page.advanceTo(1300);
  assert.equal(page.result().ready.endTimeMs, 1300);
  assert.equal(page.result().ready.initialNetworkDrain.fallbackUsed, false);
});

test("persistent ordinary requests expose a drain fallback instead of claiming settled", () => {
  const page = createPage();
  page.advanceTo(50);
  page.request("https://example.test/api/long-poll");
  page.domContentLoaded(100);
  page.advanceTo(10050);
  assert.equal(page.result().pending, true);
  page.advanceTo(10100);
  const { ready } = page.result();
  assert.equal(ready.endTimeMs, 10100);
  assert.equal(ready.initialNetworkDrain.fallbackUsed, true);
  assert.equal(ready.initialNetworkDrain.elapsedMs, 10000);
  assert.equal(ready.initialNetworkDrain.inflightRequests, 1);
  assert.match(ready.reason, /not observed settled/);
});

test("drain fallback cannot bypass an outstanding render resource", async () => {
  const page = createPage();
  page.advanceTo(50);
  const complete = page.request("https://example.test/initial.js");
  page.domContentLoaded(100);
  page.advanceTo(10100);
  assert.equal(page.result().pending, true);
  await complete(11000);
  page.advanceTo(11450);
  assert.equal(page.result().pending, true);
  page.advanceTo(11500);
  const { ready } = page.result();
  assert.equal(ready.endTimeMs, 11500);
  assert.equal(ready.initialNetworkDrain.fallbackUsed, false);
});

test("a page without requests becomes ready after its normal quiet window", () => {
  const page = createPage();
  page.domContentLoaded(100);
  page.advanceTo(550);
  assert.equal(page.result().pending, true);
  page.advanceTo(600);
  assert.equal(page.result().ready.endTimeMs, 600);
  assert.equal(page.result().ready.initialNetworkDrain.fallbackUsed, false);
});

test("saved experience preserves the fallback evidence emitted by the recorder", async () => {
  const page = createPage();
  page.request("https://example.test/api/long-poll");
  page.domContentLoaded(100);
  page.advanceTo(10100);
  const directory = await mkdtemp(join(tmpdir(), "code-usage-ready-"));
  const outputPath = join(directory, "experience.json");
  try {
    const result = await captureCodeUsageExperience({
      coverage: { status: async () => ({ active: false }) },
      eval: async () => page.result(),
      memory: { metrics: async () => ({ jsHeapUsedSize: 100, jsHeapTotalSize: 200 }) }
    }, { outputPath, label: "first-screen", settleMs: 0 });
    const saved = JSON.parse(await readFile(outputPath, "utf8"));
    assert.deepEqual(saved.ready.initialNetworkDrain, {
      fallbackUsed: true,
      elapsedMs: 10000,
      inflightRequests: 1
    });
    assert.deepEqual(result.phase.ready.initialNetworkDrain, saved.ready.initialNetworkDrain);
    assert.match(saved.ready.specId, /^page-stable@3:/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
