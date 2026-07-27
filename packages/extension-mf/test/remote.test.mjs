import assert from "node:assert/strict";
import test from "node:test";

import {
  RemoteCoreError,
  createRemoteStatusResult,
  createRemoteTraceResult,
  parseBrowserReadResult
} from "../dist/public.js";
import { formatRemoteStatus, formatRemoteTrace } from "../dist/remote/format.js";
import { browserRead, capability } from "./fixtures.mjs";
import {
  catalogRemote,
  consumer,
  loadTrace,
  preloadTrace,
  stateWithConsumer
} from "./remote-fixtures.mjs";

function snapshot(state, reports = []) {
  const parsed = parseBrowserReadResult(browserRead(state, reports));
  assert.equal(parsed.ok, true);
  return parsed.snapshot;
}

test("single consumer remote trace preserves every observed load stage", () => {
  const result = createRemoteTraceResult(
    snapshot(stateWithConsumer(), [loadTrace()]),
    "load",
    { target: "shop/Button" }
  );
  assert.equal(result.outcome, "success");
  assert.equal(result.traces.length, 1);
  const trace = result.traces[0];
  assert.equal(trace.instanceRef, "mf-1");
  assert.equal(trace.remote.name, "@scope/catalog");
  assert.equal(trace.expose, "./Button");
  assert.deepEqual(trace.stages.map((stage) => stage.name), [
    "request",
    "matchRemote",
    "manifest",
    "remoteEntry",
    "containerInit",
    "expose",
    "factory",
    "result"
  ]);
  assert.ok(trace.stages.every((stage) => stage.status === "success"));
  assert.equal(trace.stages[2].httpStatus, 200);
  assert.equal(trace.stages[2].mimeType, "application/json");
  assert.equal(trace.stages[3].redirected, true);
});

test("remote alias and scoped remote/expose selectors resolve without first-slash splitting", () => {
  const current = snapshot(stateWithConsumer(), [loadTrace()]);
  const alias = createRemoteTraceResult(current, "load", { target: "shop/Button" });
  const scoped = createRemoteTraceResult(current, "load", {
    target: "@scope/catalog/Button"
  });
  assert.equal(alias.traces[0].traceId, "trace-load-1");
  assert.equal(scoped.traces[0].traceId, "trace-load-1");
  assert.equal(scoped.traces[0].expose, "./Button");
});

test("same remote concurrent loads require an explicit trace id", () => {
  const current = snapshot(stateWithConsumer(), [
    loadTrace({ traceId: "trace-a", base: 1000 }),
    loadTrace({ traceId: "trace-b", base: 2000 })
  ]);
  assert.throws(
    () => createRemoteTraceResult(current, "load", { target: "shop/Button" }),
    (error) => error instanceof RemoteCoreError &&
      error.code === "MF_REMOTE_TRACE_AMBIGUOUS" &&
      error.issue.candidates.map((candidate) => candidate.traceId).join(",") ===
        "trace-a,trace-b"
  );
  const selected = createRemoteTraceResult(current, "load", {
    target: "shop/Button",
    traceId: "trace-b"
  });
  assert.deepEqual(selected.traces.map((trace) => trace.traceId), ["trace-b"]);
});

test("trace list summaries retain instance and trace identity", () => {
  const first = consumer({ instanceRef: "mf-1", name: "host-a" });
  const second = consumer({ instanceRef: "mf-2", name: "host-b" });
  const state = stateWithConsumer({ instances: [first, second], relationships: [] });
  const result = createRemoteTraceResult(snapshot(state, [
    loadTrace({ traceId: "trace-a", instanceRef: "mf-1", hostName: "host-a" }),
    loadTrace({ traceId: "trace-b", instanceRef: "mf-2", hostName: "host-b", base: 2000 })
  ]), "load", {});
  assert.deepEqual(result.traces.map((trace) => [trace.instanceRef, trace.traceId]), [
    ["mf-1", "trace-a"],
    ["mf-2", "trace-b"]
  ]);
});

test("manifest success and remoteEntry failure stay separate", () => {
  const result = createRemoteTraceResult(snapshot(stateWithConsumer(), [
    loadTrace({ remoteEntryOutcome: "error" })
  ]), "load", { target: "shop/Button" });
  assert.equal(result.outcome, "error");
  assert.equal(result.traces[0].stages.find((stage) => stage.name === "manifest").status, "success");
  assert.equal(result.traces[0].stages.find((stage) => stage.name === "remoteEntry").status, "error");
  assert.equal(result.traces[0].stages.find((stage) => stage.name === "containerInit").status, "unknown");
});

test("cached, recovered, and timeout evidence remains explicit", () => {
  const cached = createRemoteTraceResult(snapshot(stateWithConsumer(), [
    loadTrace({ cached: true, remoteEntryOutcome: "cached" })
  ]), "load", { target: "shop/Button" });
  assert.equal(cached.traces[0].cached, true);

  const recovered = createRemoteTraceResult(snapshot(stateWithConsumer(), [
    loadTrace({ recovered: true })
  ]), "load", { target: "shop/Button" });
  assert.equal(recovered.outcome, "recovered");
  assert.equal(recovered.traces[0].recovered, true);
  assert.equal(
    recovered.traces[0].stages.find((stage) => stage.name === "remoteEntry").resources[0].outcome,
    "error"
  );

  const timeout = createRemoteTraceResult(snapshot(stateWithConsumer(), [
    loadTrace({ remoteEntryOutcome: "timeout" })
  ]), "load", { target: "shop/Button" });
  assert.equal(timeout.outcome, "error");
  assert.equal(timeout.traces[0].timeout, true);
});

test("preload traces never mix ordinary loadRemote resources", () => {
  const current = snapshot(stateWithConsumer(), [loadTrace(), preloadTrace()]);
  const load = createRemoteTraceResult(current, "load", {});
  const preload = createRemoteTraceResult(current, "preload", {});
  assert.deepEqual(load.traces.map((trace) => trace.traceId), ["trace-load-1"]);
  assert.deepEqual(preload.traces.map((trace) => trace.traceId), ["trace-preload-1"]);
  assert.ok(load.traces[0].stages.flatMap((stage) => stage.resources)
    .every((resource) => resource.initiator === "loadRemote"));
  assert.ok(preload.traces[0].stages.flatMap((stage) => stage.resources)
    .every((resource) => resource.initiator === "preloadRemote"));
  assert.equal(
    preload.traces[0].stages.find((stage) => stage.name === "manifest").status,
    "success"
  );
  assert.equal(
    preload.traces[0].stages.find((stage) => stage.name === "resources").resources[0].type,
    "js"
  );
});

test("pending means start without completion while missing stages remain unknown", () => {
  const pending = createRemoteTraceResult(snapshot(stateWithConsumer(), [
    loadTrace({ pending: true })
  ]), "load", { target: "shop/Button" });
  assert.equal(pending.outcome, "pending");
  assert.equal(pending.traces[0].stages.find((stage) => stage.name === "remoteEntry").status, "pending");
  assert.equal(pending.traces[0].stages.find((stage) => stage.name === "containerInit").status, "unknown");

  const unknown = createRemoteTraceResult(snapshot(stateWithConsumer()), "load", {
    target: "not-observed"
  });
  assert.equal(unknown.outcome, "unknown");
  assert.deepEqual(unknown.traces, []);
  assert.match(unknown.recommendedActions.join(" "), /reproduce/i);
});

test("partial history and late injection are explicit without discarding evidence", () => {
  const state = stateWithConsumer({
    state: {
      completeness: {
        currentState: "complete",
        history: "partial",
        historyCleared: false,
        lateBoundInstanceRefs: ["mf-1"],
        recommendation: "Reopen the page."
      }
    }
  });
  state.capabilities.remoteTrace = capability(true, "partial", "Late remote hooks.");
  const parsed = parseBrowserReadResult(browserRead(state, [loadTrace()], {
    marker: {
      schemaVersion: 1,
      source: "openruntime/extension-mf",
      status: "installed",
      scope: "chrome_extension",
      observabilityVersion: "2.5.4",
      installedAt: 10,
      timing: "late"
    }
  }));
  assert.equal(parsed.ok, true);
  const result = createRemoteTraceResult(parsed.snapshot, "load", {
    target: "shop/Button"
  });
  assert.equal(result.capability.status, "partial");
  assert.equal(result.traces.length, 1);
  assert.match(result.warnings.join(" "), /partial/);
});

test("remoteTrace unavailable returns a structured unsupported result", () => {
  const state = stateWithConsumer();
  state.capabilities.remoteTrace = capability(false, "unavailable", "Old reader.");
  const result = createRemoteTraceResult(snapshot(state, [loadTrace()]), "load", {
    target: "shop/Button"
  });
  assert.equal(result.outcome, "unavailable");
  assert.equal(result.capability.available, false);
  assert.deepEqual(result.traces, []);
  assert.match(result.warnings.join(" "), /Old reader/);
  assert.match(result.recommendedActions.join(" "), /reopen/i);
  const preload = createRemoteTraceResult(snapshot(state, [preloadTrace()]), "preload", {
    target: "shop"
  });
  const status = createRemoteStatusResult(snapshot(state, [loadTrace()]), "shop", {});
  assert.equal(preload.outcome, "unavailable");
  assert.equal(status.remote.latestResult, "unavailable");
});

test("remote status keeps current declaration, relationship, and latest trace summary compact", () => {
  const result = createRemoteStatusResult(snapshot(stateWithConsumer(), [loadTrace()]), "shop", {});
  assert.equal(result.remote.declared, true);
  assert.equal(result.remote.loaded, true);
  assert.deepEqual(result.remote.loadedExposes, ["./Button"]);
  assert.equal(result.remote.relationship, "resolved");
  assert.equal(result.remote.producerInstanceRef, "mf-producer");
  assert.equal(result.remote.latestResult, "success");
  assert.equal(result.remote.latestTraceId, "trace-load-1");
  assert.deepEqual(Object.keys(result.remote), [
    "name",
    "alias",
    "declared",
    "loaded",
    "loadedExposes",
    "relationship",
    "producerInstanceRef",
    "latestResult",
    "latestTraceId"
  ]);
});

test("remote status reports whether the active name or alias proxy was applied", () => {
  const parsed = parseBrowserReadResult(browserRead(
    stateWithConsumer({
      consumer: consumer({
        remotes: [{ ...catalogRemote, version: "2.0.0", entry: undefined }],
        loadedProducers: [{ ...catalogRemote, version: "2.0.0", entry: undefined }]
      })
    }),
    [loadTrace()],
    {
      proxyMarker: {
        schemaVersion: 1,
        source: "openruntime/extension-mf",
        status: "installed",
        installedAt: 10,
        overrides: { shop: "2.0.0" }
      }
    }
  ));
  assert.equal(parsed.ok, true);
  const result = createRemoteStatusResult(parsed.snapshot, "shop", {});
  assert.deepEqual(result.proxy, {
    target: "2.0.0",
    matchedBy: "alias",
    applied: true
  });
  assert.match(formatRemoteStatus(result), /Proxy applied: true/);
});

test("remote status sanitizes URL proxies and exposes setup failures", () => {
  const urlParsed = parseBrowserReadResult(browserRead(
    stateWithConsumer({
      consumer: consumer({
        loadedProducers: [{
          ...catalogRemote,
          entry: "https://cdn.test/catalog/remoteEntry.js",
          version: "https://cdn.test/catalog/mf-manifest.json"
        }]
      })
    }),
    [loadTrace()],
    {
      proxyMarker: {
        schemaVersion: 1,
        source: "openruntime/extension-mf",
        status: "installed",
        installedAt: 10,
        overrides: {
          "@scope/catalog": "https://user:secret@cdn.test/catalog/mf-manifest.json?token=secret#hash"
        }
      }
    }
  ));
  assert.equal(urlParsed.ok, true);
  const urlResult = createRemoteStatusResult(
    urlParsed.snapshot,
    "@scope/catalog",
    {}
  );
  assert.deepEqual(urlResult.proxy, {
    target: "https://cdn.test/catalog/mf-manifest.json",
    matchedBy: "name",
    applied: true,
    loadedFrom: "https://cdn.test/catalog/mf-manifest.json"
  });
  assert.doesNotMatch(JSON.stringify(urlResult), /secret|token=/);

  const failedParsed = parseBrowserReadResult(browserRead(
    stateWithConsumer(),
    [],
    {
      proxyMarker: {
        schemaVersion: 1,
        source: "openruntime/extension-mf",
        status: "error",
        installedAt: 10,
        overrides: { shop: "2.0.0" },
        message: "Proxy SDK conflict."
      }
    }
  ));
  assert.equal(failedParsed.ok, true);
  const failed = createRemoteStatusResult(failedParsed.snapshot, "shop", {});
  assert.deepEqual(failed.proxy, {
    target: "2.0.0",
    matchedBy: "alias",
    applied: false,
    error: "Proxy SDK conflict."
  });
});

test("remote status does not claim a URL proxy succeeded when loading used another manifest", () => {
  const parsed = parseBrowserReadResult(browserRead(
    stateWithConsumer({
      consumer: consumer({
        remotes: [{
          ...catalogRemote,
          entry: "http://localhost:3000/mf-manifest.json"
        }]
      })
    }),
    [loadTrace({
      manifestUrl: "https://cdn.test/catalog/mf-manifest.json"
    })],
    {
      proxyMarker: {
        schemaVersion: 1,
        source: "openruntime/extension-mf",
        status: "installed",
        installedAt: 10,
        overrides: {
          shop: "http://localhost:3000/mf-manifest.json"
        }
      }
    }
  ));
  assert.equal(parsed.ok, true);
  const result = createRemoteStatusResult(parsed.snapshot, "shop", {});
  assert.deepEqual(result.proxy, {
    target: "http://localhost:3000/mf-manifest.json",
    matchedBy: "alias",
    applied: false,
    loadedFrom: "https://cdn.test/catalog/mf-manifest.json"
  });
});

test("remote status returns unknown and a replay recommendation when no load was observed", () => {
  const result = createRemoteStatusResult(snapshot(stateWithConsumer()), "shop", {});
  assert.equal(result.remote.declared, true);
  assert.equal(result.remote.loaded, true);
  assert.deepEqual(result.remote.loadedExposes, []);
  assert.equal(result.remote.latestResult, "unknown");
  assert.equal(result.remote.latestTraceId, undefined);
  assert.match(result.recommendedActions.join(" "), /reproduce/i);
});

test("remote status does not report failed exposes as loaded", () => {
  const host = consumer({ loadedProducers: [] });
  const state = stateWithConsumer({
    consumer: host,
    relationships: []
  });
  const result = createRemoteStatusResult(snapshot(state, [
    loadTrace({ remoteEntryOutcome: "error" })
  ]), "shop", {});
  assert.equal(result.remote.declared, true);
  assert.equal(result.remote.loaded, false);
  assert.deepEqual(result.remote.loadedExposes, []);
  assert.equal(result.remote.latestResult, "error");
});

test("JSON and readable output expose stable safe evidence only", () => {
  const current = snapshot(stateWithConsumer(), [
    loadTrace({ remoteEntryOutcome: "error" })
  ]);
  const trace = createRemoteTraceResult(current, "load", { target: "shop/Button" });
  const status = createRemoteStatusResult(current, "shop", {});
  const json = JSON.stringify({ trace, status });
  assert.doesNotMatch(json, /demo-secret|token=/);
  assert.doesNotMatch(json, /factory\s*[:=]\s*function|container code/i);
  assert.match(formatRemoteTrace(trace), /Remote match: success/);
  assert.match(formatRemoteTrace(trace), /remoteEntry resource: error/);
  assert.match(formatRemoteStatus(status), /Declared: true/);
  assert.match(formatRemoteStatus(status), /Loaded: true/);
  assert.match(formatRemoteStatus(status), /Loaded exposes: none/);
  assert.match(formatRemoteStatus(status), /Latest result: error/);
  const secondJson = JSON.stringify({
    trace: createRemoteTraceResult(current, "load", { target: "shop/Button" }),
    status: createRemoteStatusResult(current, "shop", {})
  });
  assert.equal(secondJson, json);
});
