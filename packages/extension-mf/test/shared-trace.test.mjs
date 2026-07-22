import assert from "node:assert/strict";
import test from "node:test";

import {
  createSharedTraceResult,
  groupSharedTraceOperations,
  parseBrowserReadResult
} from "../dist/public.js";
import { formatSharedTrace } from "../dist/shared/format.js";
import { browserRead, capability, instance, runtimeState } from "./fixtures.mjs";
import {
  registration,
  sharedCandidate,
  sharedReport
} from "./shared-fixtures.mjs";

function snapshot(state, reports = [], overrides = {}) {
  return parseBrowserReadResult(browserRead(state, reports, overrides)).snapshot;
}

function host(options = {}) {
  return instance({
    instanceRef: options.instanceRef ?? "mf-1",
    name: options.name ?? "host",
    role: "consumer",
    runtimeVersion: options.runtimeVersion ?? "2.5.4"
  });
}

test("shared trace explains candidates, compatibility, selection, trigger, and final result", () => {
  const rejected = sharedCandidate("17.0.2", {
    provider: "legacy",
    singleton: true,
    compatible: false,
    rejectionReason: "version-mismatch"
  });
  const selected = sharedCandidate("18.3.1", {
    provider: "host",
    loaded: true,
    singleton: true,
    compatible: true
  });
  const report = sharedReport({
    operationId: "loadShare-42",
    traceId: "trace-shared-42",
    candidates: [rejected, selected],
    candidate: selected,
    availableVersions: ["17.0.2", "18.3.1"],
    selectedVersion: "18.3.1",
    selectionReason: "singleton-existing",
    strictVersion: true,
    trigger: "build",
    remote: "catalog",
    expose: "./App",
    sharedRequestId: "catalog/App"
  });
  const result = createSharedTraceResult(
    snapshot(runtimeState({ instances: [host()] }), [report]),
    { package: "react" }
  );
  assert.equal(result.selection.kind, "detail");
  const operation = result.operations[0];
  assert.equal(operation.operationId, "loadShare-42");
  assert.equal(operation.trigger, "build");
  assert.equal(operation.requiredVersion, "^18.0.0");
  assert.equal(operation.candidates[0].compatible, false);
  assert.equal(operation.candidates[0].rejectionReason, "version-mismatch");
  assert.equal(operation.selectedVersion, "18.3.1");
  assert.equal(operation.selectionReason, "singleton-existing");
  assert.equal(operation.strictVersion, true);
  assert.equal(operation.remote, "catalog");
  assert.equal(operation.expose, "./App");
  assert.equal(operation.finalResult.outcome, "shared-resolved");
});

test("registration, replacement, reuse, and ignored actions remain distinct", () => {
  const actions = ["registered", "replaced", "reused", "ignored"];
  const reports = actions.map((action, index) => sharedReport({
    operationId: `register-${index}`,
    traceId: `trace-register-${index}`,
    registration: registration(action),
    startedAt: 100 + index * 10,
    updatedAt: 105 + index * 10,
    outcome: "shared-registered"
  }));
  const result = createSharedTraceResult(
    snapshot(runtimeState({ instances: [host()] }), reports),
    {}
  );
  assert.equal(result.selection.kind, "list");
  assert.deepEqual(
    result.operations.map((operation) => operation.registrations[0].action),
    actions
  );
});

test("fallback and recovered facts are preserved", () => {
  const result = createSharedTraceResult(
    snapshot(runtimeState({ instances: [host()] }), [sharedReport({
      operationId: "fallback-1",
      selectionReason: "local-fallback",
      fallback: true,
      recovered: true,
      outcome: "recovered"
    })]),
    { package: "react" }
  );
  assert.equal(result.operations[0].fallback, true);
  assert.equal(result.operations[0].recovered, true);
  assert.equal(result.operations[0].finalResult.outcome, "recovered");
});

test("failure reason and final error remain explicit", () => {
  const result = createSharedTraceResult(
    snapshot(runtimeState({ instances: [host()] }), [sharedReport({
      operationId: "failed-1",
      status: "error",
      selectedVersion: undefined,
      failureReason: "strict-version-mismatch",
      error: {
        errorCode: "RUNTIME-006",
        errorName: "Error",
        errorMessage: "No compatible shared version."
      }
    })]),
    { package: "react" }
  );
  assert.equal(result.operations[0].failureReason, "strict-version-mismatch");
  assert.equal(result.operations[0].finalResult.status, "error");
  assert.equal(result.operations[0].finalResult.errorCode, "RUNTIME-006");
});

test("same-package concurrent operations are never merged and operation selects exactly", () => {
  const reports = [
    sharedReport({ operationId: "op-a", traceId: "trace-a", provider: "first", startedAt: 100 }),
    sharedReport({ operationId: "op-b", traceId: "trace-b", provider: "second", startedAt: 101 })
  ];
  const current = snapshot(runtimeState({ instances: [host()] }), reports);
  const ambiguous = createSharedTraceResult(current, { package: "react" });
  assert.equal(ambiguous.selection.kind, "ambiguous");
  assert.deepEqual(ambiguous.operations.map((item) => item.operationId), ["op-a", "op-b"]);
  assert.deepEqual(ambiguous.candidates.map((item) => item.operationId), ["op-a", "op-b"]);

  const exact = createSharedTraceResult(current, { package: "react", operationId: "op-b" });
  assert.equal(exact.selection.kind, "detail");
  assert.equal(exact.operations[0].provider, "second");
});

test("the same operation id in two instances remains two independent chains", () => {
  const instances = [
    host({ instanceRef: "mf-1", name: "host" }),
    host({ instanceRef: "mf-2", name: "host" })
  ];
  const reports = [
    sharedReport({ instanceRef: "mf-1", operationId: "same-op", traceId: "trace-first", provider: "first" }),
    sharedReport({ instanceRef: "mf-2", operationId: "same-op", traceId: "trace-second", provider: "second" })
  ];
  const current = snapshot(runtimeState({ instances }), reports);
  const grouped = groupSharedTraceOperations(current);
  assert.equal(grouped.length, 2);
  assert.deepEqual(grouped.map((item) => item.instanceRef), ["mf-1", "mf-2"]);
  const byName = createSharedTraceResult(current, {
    package: "react",
    mf: "host",
    operationId: "same-op"
  });
  assert.equal(byName.selection.kind, "ambiguous");
  assert.deepEqual(byName.candidates.map((item) => item.instanceRef), ["mf-1", "mf-2"]);
});

test("trace id is the correlation fallback when operationId is absent", () => {
  const first = sharedReport({ operationId: "temporary", traceId: "trace-only" });
  delete first.shared.operationId;
  delete first.events[0].shared.operationId;
  const second = structuredClone(first);
  second.traceId = "trace-other";
  second.events[0].traceId = "trace-other";
  const grouped = groupSharedTraceOperations(
    snapshot(runtimeState({ instances: [host()] }), [first, second])
  );
  assert.equal(grouped.length, 2);
  assert.deepEqual(grouped.map((item) => item.operationId), [undefined, undefined]);
});

test("sharedTrace unavailable distinguishes low runtime from unknown runtime", () => {
  const reason = "Shared tracing requires a stable runtime version of 2.5.0 or newer.";
  const lowState = runtimeState({ instances: [host({ runtimeVersion: "2.4.9" })] });
  lowState.capabilities.sharedTrace = capability(false, "unavailable", reason);
  const low = createSharedTraceResult(snapshot(lowState), { package: "react" });
  assert.equal(low.supported, false);
  assert.equal(low.capability.minimumRuntimeVersion, "2.5.0");
  assert.match(low.warnings.join(" "), /Upgrade to 2\.5\.0 or newer/);
  assert.doesNotMatch(low.warnings.join(" "), /no shared/i);

  const unknownHost = host();
  delete unknownHost.runtimeVersion;
  const unknownState = runtimeState({ instances: [unknownHost] });
  unknownState.capabilities.sharedTrace = capability(false, "unavailable", reason);
  const unknown = createSharedTraceResult(snapshot(unknownState), { package: "react" });
  assert.equal(unknown.capability.runtimeVersionKnown, false);
  assert.equal(unknown.capability.minimumRuntimeVersion, undefined);
  assert.match(unknown.warnings.join(" "), /runtime version is unknown/);
  assert.doesNotMatch(unknown.warnings.join(" "), /does not meet/);
});

test("available capability is used even when runtime version text looks old", () => {
  const old = host({ runtimeVersion: "2.4.9" });
  const result = createSharedTraceResult(
    snapshot(runtimeState({ instances: [old] }), [sharedReport({ runtimeVersion: "2.4.9" })]),
    { package: "react" }
  );
  assert.equal(result.supported, true);
  assert.equal(result.selection.kind, "detail");
  assert.equal(result.capability.minimumRuntimeVersion, undefined);
});

test("partial history and late injection return data with explicit reopen guidance", () => {
  const state = runtimeState({
    instances: [host()],
    completeness: {
      currentState: "complete",
      history: "partial",
      historyCleared: false,
      lateBoundInstanceRefs: ["mf-1"],
      recommendation: "Reload or reopen the page."
    }
  });
  state.capabilities.sharedTrace = capability(true, "partial", "Detailed history is incomplete.");
  const marker = {
    schemaVersion: 1,
    source: "openruntime/extension-mf",
    status: "installed",
    scope: "chrome_extension",
    observabilityVersion: "2.5.4",
    installedAt: 50,
    timing: "late"
  };
  const result = createSharedTraceResult(
    snapshot(state, [sharedReport()], { marker }),
    { package: "react" }
  );
  assert.equal(result.supported, true);
  assert.equal(result.operations.length, 1);
  assert.match(result.warnings.join(" "), /partial/);
  assert.match(result.warnings.join(" "), /injected after/);
  assert.match(result.recommendedActions.join(" "), /Reopen/);
});

test("shared trace human output contains candidate decisions and final result", () => {
  const rejected = sharedCandidate("17.0.2", {
    compatible: false,
    rejectionReason: "version-mismatch"
  });
  const result = createSharedTraceResult(
    snapshot(runtimeState({ instances: [host()] }), [sharedReport({ candidates: [rejected] })]),
    { package: "react" }
  );
  const text = formatSharedTrace({ ...result, candidates: [] });
  assert.match(text, /Module Federation shared trace/);
  assert.match(text, /compatible=false rejection=version-mismatch/);
  assert.match(text, /final result: success/);
});
