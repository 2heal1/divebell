import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import {
  classifyRstackEntryFilename,
  createRstackFetchDetectionScript,
  detectRstackStack
} from "../dist/index.js";

test("classifies only index, main, and runtime entry filenames", () => {
  assert.equal(classifyRstackEntryFilename("index.123.js"), "index");
  assert.equal(classifyRstackEntryFilename("app-main.123.js"), "main");
  assert.equal(classifyRstackEntryFilename("runtime~app.js"), "runtime");
  assert.equal(classifyRstackEntryFilename("vmok-remote-entry.js"), undefined);
  assert.equal(classifyRstackEntryFilename("vendor.js"), undefined);
});

test("detectStack recommends rstack only when fetched source has data-rspack", async () => {
  const browser = new DetectBrowser({
    schemaVersion: 1,
    status: "found",
    checked: ["index.js", "main.123.js"],
    failureCount: 0,
    matched: "main.123.js"
  });
  const result = await detectRstackStack({ browser }, "rstack");
  assert.equal(result?.id, "rspack");
  assert.equal(result?.command, "rstack");
  assert.match(result?.evidence[0] ?? "", /data-rspack.*main\.123\.js/u);
  assert.match(browser.script, /performance\.getEntriesByType/u);
  assert.doesNotMatch(browser.script, /MutationObserver|Debugger/u);
});

test("detectStack treats fetch failures and missing markers as no detection", async () => {
  for (const status of ["not-found", "unavailable"]) {
    const browser = new DetectBrowser({
      schemaVersion: 1,
      status,
      checked: ["runtime.js"],
      failureCount: status === "unavailable" ? 1 : 0
    });
    assert.equal(await detectRstackStack({ browser }, "rstack"), undefined);
  }
});

test("fetch detection checks at most one index, main, and runtime resource", async () => {
  const fetched = [];
  const context = vm.createContext({
    AbortController,
    URL,
    clearTimeout,
    decodeURIComponent,
    document: {
      scripts: [
        { src: "https://example.com/vendor.js" },
        { src: "https://example.com/index.123.js" },
        { src: "https://example.com/app-main.123.js" },
        { src: "https://example.com/another-main.js" }
      ]
    },
    fetch: async (url, options) => {
      fetched.push({ url, options });
      return {
        ok: true,
        async text() {
          return url.includes("runtime")
            ? `script.setAttribute("data-rspack", key)`
            : "ordinary source";
        }
      };
    },
    location: { href: "https://example.com/" },
    performance: {
      getEntriesByType() {
        return [
          {
            initiatorType: "script",
            name: "https://example.com/runtime~app.js"
          },
          {
            initiatorType: "script",
            name: "https://example.com/runtime-second.js"
          }
        ];
      }
    },
    setTimeout
  });
  const result = await vm.runInContext(
    createRstackFetchDetectionScript(),
    context
  );

  assert.equal(result.status, "found");
  assert.equal(result.matched, "runtime~app.js");
  assert.deepEqual(Array.from(result.checked), [
    "index.123.js",
    "app-main.123.js",
    "runtime~app.js"
  ]);
  assert.equal(fetched.length, 3);
  assert.equal(fetched.every(({ options }) =>
    options.cache === "force-cache"
    && options.credentials === "same-origin"
  ), true);
});

test("fetch detection absorbs request errors", async () => {
  const context = vm.createContext({
    AbortController,
    URL,
    clearTimeout,
    decodeURIComponent,
    document: { scripts: [{ src: "https://example.com/main.js" }] },
    fetch: async () => {
      throw new Error("CORS blocked");
    },
    location: { href: "https://example.com/" },
    performance: { getEntriesByType: () => [] },
    setTimeout
  });
  const result = await vm.runInContext(
    createRstackFetchDetectionScript(),
    context
  );
  assert.equal(result.status, "unavailable");
  assert.equal(result.failureCount, 1);
});

class DetectBrowser {
  constructor(result) {
    this.result = result;
  }

  async eval(script) {
    this.script = script;
    return this.result;
  }
}
