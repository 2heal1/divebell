import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runRstackCommand } from "../dist/index.js";

const HMR_SOURCE = `
var currentStatus = "idle";
var registeredStatusHandlers = [];
function setStatus(newStatus) {
  currentStatus = newStatus;
  return Promise.all(registeredStatusHandlers.map(function (handler) {
    return handler(newStatus);
  })).then(function () {});
}
function hotCheck() {
  throw new Error("check() is only allowed in idle status");
}
function createModuleHotObject(moduleId) {
  return { invalidate: function () {
    this._selfInvalidated = true;
    setStatus("ready");
  }};
}
`;

test("runs start, armed, wait, status, and stop in the required order", async () => {
  const home = await mkdtemp(join(tmpdir(), "divebell-rstack-command-"));
  const previousHome = process.env.DIVEBELL_HOME;
  process.env.DIVEBELL_HOME = home;
  try {
    const browser = new FakeBrowser();
    const base = baseOptions(browser);

    const started = await runRstackCommand({
      ...base,
      args: cliArgs(["rstack", "hmr", "start"], {
        expect: "applied",
        "expect-no-reload": "true"
      })
    });
    assert.equal(started.status, "armed");
    assert.match(started.observationId, /^rstack-hmr-/u);
    assert.match(started.nextCommand, new RegExp(started.observationId, "u"));

    browser.releaseAppliedCycle();
    const waited = await runRstackCommand({
      ...base,
      args: cliArgs(["rstack", "hmr", "wait", started.observationId], {
        timeout: "1000"
      })
    });
    assert.equal(waited.status, "completed");
    assert.equal(waited.outcome, "applied");
    assert.equal(waited.verdict, "passed");
    assert.deepEqual(waited.cycles[0].statusPath, [
      "check",
      "prepare",
      "dispose",
      "apply",
      "idle"
    ]);

    const status = await runRstackCommand({
      ...base,
      args: cliArgs(["rstack", "hmr", "status", started.observationId])
    });
    assert.equal(status.observationId, started.observationId);
    assert.equal(status.outcome, "applied");

    const stopped = await runRstackCommand({
      ...base,
      args: cliArgs(["rstack", "hmr", "stop", started.observationId])
    });
    assert.equal(stopped.status, "completed");
    assert.equal(stopped.debuggerDisabled, true);
    assert.equal(browser.probes.size, 0);
  } finally {
    if (previousHome === undefined) delete process.env.DIVEBELL_HOME;
    else process.env.DIVEBELL_HOME = previousHome;
    await rm(home, { recursive: true, force: true });
  }
});

test("refuses to arm across a compilation failure race and cleans up probes", async () => {
  const home = await mkdtemp(join(tmpdir(), "divebell-rstack-arm-race-"));
  const previousHome = process.env.DIVEBELL_HOME;
  process.env.DIVEBELL_HOME = home;
  try {
    const browser = new FakeBrowser({ armCompileError: true });
    await assert.rejects(
      async () => await runRstackCommand({
        ...baseOptions(browser),
        args: cliArgs(["rstack", "hmr", "start"])
      }),
      (error) => error.code === "RSTACK_HMR_ARM_RACED_WITH_UPDATE"
    );
    assert.equal(browser.probes.size, 0);
    assert.equal(browser.enabled, false);
  } finally {
    if (previousHome === undefined) delete process.env.DIVEBELL_HOME;
    else process.env.DIVEBELL_HOME = previousHome;
    await rm(home, { recursive: true, force: true });
  }
});

test("fails Fast Refresh preflight before arming with production ReactDOM", async () => {
  const home = await mkdtemp(join(tmpdir(), "divebell-rstack-refresh-preflight-"));
  const previousHome = process.env.DIVEBELL_HOME;
  process.env.DIVEBELL_HOME = home;
  try {
    const browser = new FakeBrowser({ reactDomBuild: "production" });
    await assert.rejects(
      async () => await runRstackCommand({
        ...baseOptions(browser),
        args: cliArgs(["rstack", "hmr", "start"], {
          expect: "applied",
          "expect-refresh": "true"
        })
      }),
      (error) =>
        error.code === "RSTACK_REFRESH_PRECONDITION_FAILED"
        && error.details?.refreshRenderer?.status === "react-dom-production"
    );
    assert.equal(browser.probes.size, 0);
    assert.equal(browser.enabled, false);
  } finally {
    if (previousHome === undefined) delete process.env.DIVEBELL_HOME;
    else process.env.DIVEBELL_HOME = previousHome;
    await rm(home, { recursive: true, force: true });
  }
});

class FakeBrowser {
  constructor(options = {}) {
    this.enabled = false;
    this.latestSequence = 10;
    this.probeCounter = 0;
    this.probes = new Map();
    this.pendingEvents = [];
    this.observationId = undefined;
    this.runtimeId = undefined;
    this.armCompileError = options.armCompileError === true;
    this.reactDomBuild = options.reactDomBuild;
    this.consoleCalls = 0;
  }

  async run(command, request = {}) {
    assert.equal(command, "debug");
    const args = request.args ?? [];
    if (args[0] === "status") return json(this.status());
    if (args[0] === "enable") {
      this.enabled = true;
      return json({
        enabled: true,
        connectionGeneration: 2,
        sessions: [{ sessionId: "cdp-page", tabId: "t1" }]
      });
    }
    if (args[0] === "disable") {
      this.enabled = false;
      return json({ disabled: true });
    }
    if (args[0] === "events") return json(this.events());
    if (args[0] === "source" && args[1] === "search") {
      return json({
        matches: args[2] === "check() is only allowed in idle status"
          ? [{
              scriptId: "script-1",
              sessionId: "cdp-page",
              url: "http://localhost:3000/main.js",
              line: 12,
              column: 3
            }]
          : args[2] === "rendererPackageName" && this.reactDomBuild !== undefined
            ? [{
                scriptId: "script-react-dom",
                sessionId: "cdp-page",
                url: "http://localhost:3000/react-dom.js",
                line: 1,
                column: 1
              }]
          : []
      });
    }
    if (args[0] === "source") {
      if (args[1] === "script-react-dom") {
        return json({
          script: {
            connectionGeneration: 2,
            sessionId: "cdp-page",
            documentGeneration: 1,
            scriptId: "script-react-dom",
            executionContextId: 7,
            url: "http://localhost:3000/react-dom.js",
            scriptInstanceKey: null
          },
          scriptSource: this.reactDomBuild === "production"
            ? `var renderer={bundleType:0,version:"18.3.1",rendererPackageName:"react-dom"};`
            : `var renderer={bundleType:1,version:"18.3.1",rendererPackageName:"react-dom"};`
        });
      }
      return json({
        script: {
          connectionGeneration: 2,
          sessionId: "cdp-page",
          documentGeneration: 1,
          scriptId: "script-1",
          executionContextId: 7,
          url: "http://localhost:3000/main.js",
          scriptInstanceKey: {
            connectionGeneration: 2,
            sessionId: "cdp-page",
            documentGeneration: 1,
            scriptId: "script-1"
          }
        },
        scriptSource: HMR_SOURCE
      });
    }
    if (args[0] === "logpoint" && args[1] === "set") {
      const probeId = `probe-${++this.probeCounter}`;
      const tags = Object.fromEntries((request.options.tag ?? []).map((tag) => {
        const separator = tag.indexOf("=");
        return [tag.slice(0, separator), tag.slice(separator + 1)];
      }));
      this.probes.set(probeId, tags);
      if (tags.event === "hmr.status") {
        this.observationId = tags.observation;
        this.runtimeId = tags.runtime;
      }
      return json({
        probeId,
        status: "bound",
        bindings: [{ actualLocation: { line: Number(args[3]), column: 3 } }]
      });
    }
    if (args[0] === "logpoint" && args[1] === "remove") {
      this.probes.delete(args[2]);
      return json({ removed: true });
    }
    if (args[0] === "logpoint" && args[1] === "list") {
      return json({ probes: Array.from(this.probes.keys(), (probeId) => ({ probeId })) });
    }
    if (args[0] === "breakpoint" && args[1] === "list") {
      return json({ probes: [] });
    }
    throw new Error(`Unexpected debug request: ${JSON.stringify({ args, options: request.options })}`);
  }

  status() {
    return {
      connectionGeneration: 2,
      enabledSessions: this.enabled ? 1 : 0,
      sessions: [{
        sessionId: "cdp-page",
        documentGeneration: 1,
        enabled: this.enabled,
        tabId: "t1"
      }]
    };
  }

  events() {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return {
      events,
      oldestSequence: 1,
      latestSequence: this.latestSequence,
      gap: false,
      bufferGap: false,
      transportGap: false
    };
  }

  releaseAppliedCycle() {
    assert.equal(typeof this.observationId, "string");
    assert.equal(typeof this.runtimeId, "string");
    for (const status of ["check", "prepare", "dispose", "apply", "idle"]) {
      this.latestSequence += 1;
      this.pendingEvents.push({
        sequence: this.latestSequence,
        timestamp: 1000 + this.latestSequence,
        type: "logpoint-hit",
        connectionGeneration: 2,
        sessionId: "cdp-page",
        documentGeneration: 1,
        data: {
          probeId: "probe-1",
          location: { line: 5, column: 3 },
          tags: {
            observation: this.observationId,
            runtime: this.runtimeId,
            event: "hmr.status",
            profile: "rspack-hmr-v1"
          },
          values: [{ expression: "newStatus", value: status }]
        }
      });
    }
  }

  async console() {
    this.consoleCalls += 1;
    const entries = this.armCompileError && this.consoleCalls >= 2
      ? [{ level: "error", args: "Failed to compile: broken fixture" }]
      : [];
    return {
      entries,
      summary: {
        total: entries.length,
        log: 0,
        info: 0,
        warn: 0,
        error: entries.length
      }
    };
  }

  async eval() {
    if (this.reactDomBuild === "production") {
      return {
        status: "installed",
        supportsFiber: true,
        rendererCount: 1,
        renderers: [{
          id: "1",
          packageName: "react-dom",
          version: "18.3.1",
          build: "production",
          hasScheduleRefresh: false,
          hasSetRefreshHandler: false
        }]
      };
    }
    return {
      status: "missing",
      rendererCount: 0,
      renderers: []
    };
  }
}

function baseOptions(browser) {
  return {
    fetcher: async () => new Response(),
    page: {
      url: "http://localhost:3000/",
      openedUrl: "http://localhost:3000/",
      normalizedUrl: "http://localhost:3000/",
      bridgeUrl: null,
      sessionId: null,
      openedAt: Date.now()
    },
    divebell: { browser },
    runExtension: async () => {
      throw Object.assign(new Error("MF runtime not observed"), {
        code: "MF_PAGE_NOT_FEDERATED"
      });
    },
    withLoading: async (run) => await run()
  };
}

function cliArgs(command, options = {}) {
  return {
    command,
    options: new Map(Object.entries(options).map(([name, value]) => [name, [value]]))
  };
}

function json(value) {
  return JSON.stringify(value);
}
