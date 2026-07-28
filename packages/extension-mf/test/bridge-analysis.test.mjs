import assert from "node:assert/strict";
import test from "node:test";

import {
  collectBridgeOperations,
  createBridgeTraceResult,
  parseBrowserReadResult
} from "../dist/public.js";
import { capability } from "./fixtures.mjs";
import {
  bridgeInfo,
  bridgeInstance,
  bridgeReport,
  bridgeSnapshot,
  bridgeState
} from "./bridge-fixtures.mjs";

function parsedSnapshot(options) {
  const parsed = parseBrowserReadResult(bridgeSnapshot(options));
  assert.equal(parsed.ok, true);
  return parsed.snapshot;
}

test("React and Vue render operations remain distinct and preserve their frameworks", () => {
  const snapshot = parsedSnapshot({
    instances: [
      bridgeInstance({ instanceRef: "mf-1", name: "react-host" }),
      bridgeInstance({ instanceRef: "mf-2", name: "vue-host" })
    ],
    reports: [
      bridgeReport({ instanceRef: "mf-1", bridge: { framework: "react" } }),
      bridgeReport({
        instanceRef: "mf-2",
        bridge: {
          operationId: "bridge-op-vue",
          bridgeId: "bridge-vue",
          framework: "vue"
        }
      })
    ]
  });
  const result = createBridgeTraceResult(snapshot);
  assert.equal(result.selection.kind, "summary");
  assert.equal(result.operations.length, 2);
  assert.deepEqual(
    result.operations.map((operation) => operation.frameworks[0]).sort(),
    ["react", "vue"]
  );
});

test("consumer and producer evidence joins by operationId while retaining each side", () => {
  const snapshot = parsedSnapshot({
    instances: [bridgeInstance({ states: [bridgeState({ commitObserved: true })] })],
    reports: [
      bridgeReport({ invoked: true, commit: true }),
      bridgeReport({
        traceId: "producer-trace",
        invoked: true,
        commit: true,
        bridge: { side: "producer" }
      })
    ]
  });
  const operations = collectBridgeOperations(snapshot);
  assert.equal(operations.length, 1);
  assert.equal(operations[0].association, "operation-id");
  assert.deepEqual(operations[0].sides.map((side) => side.side), ["consumer", "producer"]);
  assert.equal(operations[0].producerObserved, true);
  assert.equal(operations[0].called, true);
  assert.equal(operations[0].returned, true);
  assert.equal(operations[0].commitObserved, true);
  assert.equal(operations[0].applicationReadiness, "not-observed");
});

test("a successful render return without commit does not claim commit or readiness", () => {
  const snapshot = parsedSnapshot({
    instances: [bridgeInstance()],
    reports: [bridgeReport({ invoked: true, commit: false })]
  });
  const operation = createBridgeTraceResult(snapshot, { operationId: "bridge-op-1" })
    .operations[0];
  assert.equal(operation.outcome, "success");
  assert.equal(operation.called, true);
  assert.equal(operation.returned, true);
  assert.equal(operation.commitObserved, false);
  assert.equal(operation.applicationReadiness, "not-observed");
});

test("render errors keep the safe error and reason on the observed side", () => {
  const snapshot = parsedSnapshot({
    instances: [bridgeInstance()],
    reports: [bridgeReport({
      outcome: "error",
      error: { name: "Error", message: "render failed token=[redacted]" },
      bridge: { reason: "mount" }
    })]
  });
  const operation = createBridgeTraceResult(snapshot).operations[0];
  assert.equal(operation.outcome, "error");
  assert.equal(operation.sides[0].reason, "mount");
  assert.equal(operation.sides[0].error.message, "render failed token=[redacted]");
  assert.doesNotMatch(JSON.stringify(operation), /must-not-leak/);
});

test("one Bridge keeps update, route-sync, and destroy operations separate", () => {
  const reports = [
    bridgeReport({
      outcome: "skipped",
      bridge: { operationId: "op-update", operation: "update" }
    }),
    bridgeReport({
      bridge: {
        operationId: "op-route",
        operation: "route-sync",
        route: {
          action: "host-to-remote",
          from: "/before?token=must-not-leak",
          to: "/after#private",
          basename: "/catalog",
          mechanism: "popstate"
        }
      }
    }),
    bridgeReport({
      bridge: {
        operationId: "op-destroy",
        operation: "destroy",
        reason: "unmount"
      }
    })
  ];
  const snapshot = parsedSnapshot({ instances: [bridgeInstance()], reports });
  const result = createBridgeTraceResult(snapshot);
  assert.deepEqual(
    result.operations.flatMap((operation) => operation.operations).sort(),
    ["destroy", "route-sync", "update"]
  );
  const route = result.operations.find((operation) => operation.operationId === "op-route");
  assert.equal(route.routeSyncObserved, true);
  assert.equal(route.sides[0].evidence[0].bridge.route.from, "/before");
  assert.doesNotMatch(JSON.stringify(route), /must-not-leak|#private/);
  assert.equal(
    result.operations.find((operation) => operation.operationId === "op-update").outcome,
    "skipped"
  );
});

test("multiple Bridge ids and concurrent operation ids for the same remote never merge", () => {
  const snapshot = parsedSnapshot({
    instances: [bridgeInstance()],
    reports: [
      bridgeReport({ bridge: { operationId: "op-first", bridgeId: "bridge-first" } }),
      bridgeReport({ bridge: { operationId: "op-second", bridgeId: "bridge-second" } })
    ]
  });
  const result = createBridgeTraceResult(snapshot, { remote: "catalog" });
  assert.equal(result.selection.kind, "candidates");
  assert.deepEqual(
    [...new Set(result.candidates.map((candidate) => candidate.operationId))].sort(),
    ["op-first", "op-second"]
  );
});

test("remote aliases match only inside their owning MF instance", () => {
  const snapshot = parsedSnapshot({
    instances: [bridgeInstance({
      instanceRef: "mf-1",
      remotes: [{ name: "catalog", alias: "shop" }]
    })],
    reports: [bridgeReport({ instanceRef: "mf-1" })]
  });
  const result = createBridgeTraceResult(snapshot, {
    remote: "shop",
    instanceRef: "mf-1"
  });
  assert.equal(result.selection.kind, "operation");
  assert.equal(result.operations[0].remote, "catalog");
});

test("same remote and same MF name across instances stays scoped by instanceRef", () => {
  const snapshot = parsedSnapshot({
    instances: [
      bridgeInstance({ instanceRef: "mf-1", name: "host" }),
      bridgeInstance({ instanceRef: "mf-2", name: "host" })
    ],
    reports: [
      bridgeReport({ instanceRef: "mf-1", bridge: { operationId: "op-one" } }),
      bridgeReport({ instanceRef: "mf-2", bridge: { operationId: "op-two" } })
    ]
  });
  const unscoped = createBridgeTraceResult(snapshot, { remote: "catalog" });
  assert.equal(unscoped.selection.kind, "candidates");
  assert.deepEqual(
    [...new Set(unscoped.candidates.map((candidate) => candidate.instanceRef))].sort(),
    ["mf-1", "mf-2"]
  );
  const duplicateName = createBridgeTraceResult(snapshot, { name: "host" });
  assert.equal(duplicateName.selection.kind, "candidates");
  assert.deepEqual(
    duplicateName.instanceCandidates.map((candidate) => candidate.instanceRef),
    ["mf-1", "mf-2"]
  );
});

test("partial Bridge history returns available operations and an explicit warning", () => {
  const snapshot = parsedSnapshot({
    instances: [bridgeInstance()],
    reports: [bridgeReport()],
    bridgeCapability: capability(true, "partial", "no framework commit signal was observed"),
    stateOverrides: {
      completeness: {
        currentState: "complete",
        history: "partial",
        historyCleared: false,
        lateBoundInstanceRefs: ["mf-1"],
        recommendation: "Reopen the page."
      }
    }
  });
  const result = createBridgeTraceResult(snapshot);
  assert.equal(result.operations.length, 1);
  assert.match(result.warnings.join(" "), /history is partial|may be missing/);
  assert.match(result.recommendedActions.join(" "), /Reopen/);
});

test("a public report result preserves return evidence when its result event is missing", () => {
  const partialReport = bridgeReport();
  partialReport.events = partialReport.events.filter((event) =>
    event.lifecycle === "beforeBridgeOperation"
  );
  const snapshot = parsedSnapshot({
    instances: [bridgeInstance()],
    reports: [partialReport],
    bridgeCapability: capability(true, "partial", "history was trimmed")
  });
  const operation = createBridgeTraceResult(snapshot).operations[0];
  assert.equal(operation.called, true);
  assert.equal(operation.returned, true);
  assert.equal(operation.outcome, "success");
  assert.equal(operation.commitObserved, false);
});

test("unavailable trace is structured and still exposes current Bridge state", () => {
  const snapshot = parsedSnapshot({
    instances: [bridgeInstance({ states: [bridgeState()] })],
    reports: [],
    bridgeCapability: capability(
      false,
      "unavailable",
      "Bridge is present, but no Bridge lifecycle signal has been observed."
    )
  });
  const result = createBridgeTraceResult(snapshot);
  assert.equal(result.selection.kind, "unsupported");
  assert.equal(result.operations.length, 0);
  assert.equal(result.currentStates.length, 1);
  assert.match(result.warnings.join(" "), /historical lifecycle operations are unavailable/);
  assert.doesNotMatch(result.warnings.join(" "), /page does not use Bridge/i);
});

test("records without operationId use strict fallback identity and stay incomplete", () => {
  const snapshot = parsedSnapshot({
    instances: [bridgeInstance()],
    reports: [
      bridgeReport({ bridge: { operationId: "temporary-one", startedAt: 100 } }),
      bridgeReport({ bridge: { operationId: "temporary-two", startedAt: 200 } })
    ]
  });
  for (const bridgeReport of snapshot.reports) {
    delete bridgeReport.bridge.operationId;
    for (const event of bridgeReport.events) delete event.bridge.operationId;
  }
  const result = createBridgeTraceResult(snapshot);
  assert.equal(result.operations.length, 2);
  assert.ok(result.operations.every((operation) => operation.association === "fallback"));
  assert.ok(result.operations.every((operation) => operation.operationId === undefined));
  assert.match(result.warnings.join(" "), /association.*incomplete/i);
});

test("unscoped Bridge records remain visible but are never attached to an MF instance", () => {
  const snapshot = parsedSnapshot({
    instances: [bridgeInstance()],
    reports: [bridgeReport()]
  });
  delete snapshot.reports[0].instanceRef;
  const result = createBridgeTraceResult(snapshot);
  assert.equal(result.operations.length, 1);
  assert.equal(result.operations[0].instance.instanceRef, undefined);
  assert.equal(result.operations[0].association, "incomplete");
});
