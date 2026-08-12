import assert from "node:assert/strict";
import test from "node:test";

import {
  appendDebugEvents,
  compareState,
  createHmrResult,
  currentOutcome,
  reduceCycles,
  refreshSummary,
  resultShouldFinish
} from "../dist/index.js";

function observation(overrides = {}) {
  return {
    schemaVersion: 1,
    observationId: "rstack-hmr-test",
    status: "armed",
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
    pageUrl: "http://localhost:3000/",
    connectionGeneration: 2,
    sessionId: "cdp-page",
    documentGeneration: 1,
    enabledDebugger: true,
    armedAtSequence: 10,
    latestSequence: 10,
    runtimes: [{
      runtimeId: "rspack-hmr-runtime",
      kind: "rspack-hmr",
      profile: "rspack-hmr-v1",
      connectionGeneration: 2,
      sessionId: "cdp-page",
      documentGeneration: 1,
      scriptId: "script-1",
      scriptInstanceKey: null,
      url: "http://localhost:3000/main.js",
      anchor: { line: 10, column: 2 },
      owner: {
        status: "resolved",
        kind: "remote",
        ownerId: "mf-remote",
        confidence: "high",
        evidence: ["mf.remote-entry-url"],
        candidates: ["mf-remote"]
      }
    }],
    probes: [],
    events: [],
    expectations: {
      outcome: "applied",
      refresh: true,
      noReload: true
    },
    consoleBaseline: [],
    ...overrides
  };
}

function hit(sequence, event, values, runtime = "rspack-hmr-runtime") {
  return {
    sequence,
    timestamp: 1000 + sequence,
    type: "logpoint-hit",
    connectionGeneration: 2,
    sessionId: "cdp-page",
    documentGeneration: 1,
    data: {
      probeId: `probe-${sequence}`,
      location: { line: sequence, column: 1 },
      tags: {
        observation: "rstack-hmr-test",
        runtime,
        event
      },
      values
    }
  };
}

test("reduces a complete status path and compatible Refresh into applied", () => {
  const statuses = ["check", "prepare", "dispose", "apply", "idle"];
  const events = statuses.map((status, index) =>
    hit(11 + index, "hmr.status", [{ expression: "newStatus", value: status }])
  );
  events.push(hit(16, "refresh.boundary-refresh", [
    { expression: "moduleId", value: "./src/App.tsx" }
  ], "react-refresh-runtime"));
  events.push(hit(17, "refresh.completed", [
    { expression: "'completed'", value: "completed" }
  ], "react-refresh-runtime"));
  const reduced = appendDebugEvents(observation(), {
    events,
    latestSequence: 17,
    gap: false,
    bufferGap: false,
    transportGap: false
  });

  assert.equal(currentOutcome(reduced.events), "applied");
  assert.deepEqual(reduceCycles(reduced.events)[0].statusPath, statuses);
  assert.deepEqual(refreshSummary(reduced.events), {
    boundary: "refreshed",
    completed: true,
    moduleIds: ["./src/App.tsx"]
  });

  const result = createHmrResult(reduced, {
    mf: {
      runtime: {
        status: "observed",
        instances: [{ instanceRef: "mf-host", name: "host", role: "consumer" }],
        remoteEntries: [{
          consumerInstanceRef: "mf-host",
          remote: "catalog",
          producerInstanceRef: "mf-remote",
          remoteEntryUrl: "http://localhost:3000/main.js"
        }]
      },
      react: {
        status: "observed",
        package: "react",
        operations: [{
          instanceRef: "mf-remote",
          mfName: "catalog",
          scopes: ["default"],
          selectedVersion: "19.2.0",
          provider: "host"
        }]
      },
      reactDom: {
        status: "observed",
        package: "react-dom",
        operations: [{
          instanceRef: "mf-remote",
          mfName: "catalog",
          scopes: ["default"],
          selectedVersion: "19.2.0",
          provider: "host"
        }]
      }
    },
    consoleEntries: []
  });
  assert.equal(result.verdict, "passed");
  assert.equal(result.runtimes[0].owner.ownerId, "mf-remote");
  assert.equal(result.shared.react.operations[0].provider, "host");
});

test("never concludes success when the debugger event stream has a gap", () => {
  const reduced = appendDebugEvents(observation(), {
    events: [hit(11, "hmr.status", [{ expression: "newStatus", value: "idle" }])],
    latestSequence: 20,
    gap: true,
    bufferGap: true,
    transportGap: false,
    droppedThroughSequence: 18
  });
  assert.equal(currentOutcome(reduced.events), "unknown");
  assert.equal(reduced.events.some((event) => event.type === "evidence.gap"), true);
});

test("does not hide a later incomplete cycle behind an earlier applied cycle", () => {
  const reduced = appendDebugEvents(observation(), {
    events: [
      hit(11, "hmr.status", [{ expression: "newStatus", value: "check" }]),
      hit(12, "hmr.status", [{ expression: "newStatus", value: "apply" }]),
      hit(13, "hmr.status", [{ expression: "newStatus", value: "idle" }]),
      hit(14, "hmr.status", [{ expression: "newStatus", value: "check" }])
    ],
    latestSequence: 14,
    gap: false,
    bufferGap: false,
    transportGap: false
  });
  assert.equal(currentOutcome(reduced.events), "incomplete");
});

test("reports Refresh boundary invalidation separately from the shared provider", () => {
  const reduced = appendDebugEvents(observation(), {
    events: [
      hit(11, "hmr.status", [{ expression: "newStatus", value: "check" }]),
      hit(12, "refresh.boundary-invalidate", [{ expression: "moduleId", value: "./App" }], "refresh"),
      hit(13, "hmr.status", [{ expression: "newStatus", value: "apply" }]),
      hit(14, "hmr.status", [{ expression: "newStatus", value: "idle" }])
    ],
    latestSequence: 14,
    gap: false,
    bufferGap: false,
    transportGap: false
  });
  assert.equal(currentOutcome(reduced.events), "applied");
  assert.equal(refreshSummary(reduced.events).boundary, "invalidated");
});

test("does not claim state preservation when the baseline selector was missing", () => {
  assert.equal(compareState(
    [{ name: "counter", found: false }],
    [{ name: "counter", found: false }]
  ), "not-verified");
  assert.equal(compareState(
    [{ name: "counter", found: true, value: "1" }],
    [{ name: "counter", found: true, value: "1" }]
  ), "verified-preserved");
  assert.equal(compareState(
    [{ name: "counter", found: true, value: "1" }],
    [{ name: "counter", found: false }]
  ), "verified-reset");
});

test("waits for a queued debounced React Refresh before completing", () => {
  const armed = observation({
    events: [{
      sequence: 11,
      timestamp: 1011,
      type: "refresh.boundary-refresh",
      runtimeId: "refresh-runtime",
      moduleId: "./App"
    }]
  });
  assert.equal(resultShouldFinish({
    outcome: "applied",
    refresh: {
      boundary: "queued",
      completed: false,
      moduleIds: ["./App"]
    }
  }, armed), false);
  const completed = {
    ...armed,
    events: [
      ...armed.events,
      {
        sequence: 12,
        timestamp: 1012,
        type: "refresh.completed",
        runtimeId: "refresh-runtime"
      }
    ]
  };
  assert.equal(resultShouldFinish({
    outcome: "applied",
    refresh: {
      boundary: "refreshed",
      completed: true,
      moduleIds: ["./App"]
    }
  }, completed, 1012 + 1000), true);
});

test("does not complete applied HMR before the page reload settle window", () => {
  const terminalAt = 10_000;
  const armed = observation({
    expectations: {
      outcome: "applied",
      refresh: false,
      noReload: true
    },
    events: [{
      sequence: 11,
      timestamp: terminalAt,
      type: "hmr.status",
      runtimeId: "rspack-hmr-runtime",
      status: "idle"
    }]
  });
  const result = {
    outcome: "applied",
    refresh: {
      boundary: "not-observed",
      completed: false,
      moduleIds: []
    }
  };
  assert.equal(resultShouldFinish(result, armed, terminalAt + 999), false);
  assert.equal(resultShouldFinish(result, armed, terminalAt + 1000), true);
});

test("a document commit overrides an earlier applied HMR cycle", () => {
  const statuses = ["check", "prepare", "dispose", "apply", "idle"];
  const reduced = appendDebugEvents(observation(), {
    events: [
      ...statuses.map((status, index) =>
        hit(11 + index, "hmr.status", [{ expression: "newStatus", value: status }])
      ),
      {
        sequence: 16,
        timestamp: 1016,
        type: "document-committed",
        connectionGeneration: 2,
        sessionId: "cdp-page",
        documentGeneration: 2
      }
    ],
    latestSequence: 16,
    gap: false,
    bufferGap: false,
    transportGap: false
  });
  assert.equal(currentOutcome(reduced.events), "reloaded");
});
