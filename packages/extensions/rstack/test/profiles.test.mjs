import assert from "node:assert/strict";
import test from "node:test";

import {
  discoverProfilesInSource,
  locationAt
} from "../dist/index.js";

const script = {
  connectionGeneration: 3,
  sessionId: "cdp-page",
  documentGeneration: 2,
  scriptId: "script-9",
  executionContextId: 11,
  url: "http://localhost:3000/static/js/main.js",
  scriptInstanceKey: {
    connectionGeneration: 3,
    sessionId: "cdp-page",
    documentGeneration: 2,
    scriptId: "script-9"
  }
};

const source = `
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
function hotApply() {
  throw new Error("apply() is only allowed in ready status");
}
function createModuleHotObject(moduleId) {
  return { invalidate: function () {
    this._selfInvalidated = true;
    setStatus("ready");
  }};
}
function internalApply(error, errors) {
  if (errors.length) throw errors[0];
  return setStatus("fail").then(function () { throw error; });
}
console.warn("[HMR] unexpected require(");

function shouldInvalidateReactRefreshBoundary() { return false; }
function executeRuntime(moduleExports, moduleId, hot, error) {
  if (shouldInvalidateReactRefreshBoundary()) {
    hot.invalidate();
  } else {
    enqueueUpdate();
  }
  if (!moduleExports) {
    hot.invalidate();
  }
  if (error) location.reload();
}
function flushRefresh(callback) {
  performReactRefresh();
  if (callback) callback();
}
`;

test("discovers runtime-scoped HMR and Refresh probes from compiled JavaScript", () => {
  const result = discoverProfilesInSource(script, source);
  const hmr = result.runtimes.filter((runtime) => runtime.kind === "rspack-hmr");
  const refresh = result.runtimes.filter((runtime) => runtime.kind === "react-refresh");

  assert.equal(hmr.length, 1);
  assert.equal(refresh.length, 1);
  assert.equal(hmr[0].sessionId, "cdp-page");
  assert.equal(hmr[0].owner.status, "unknown");
  assert.deepEqual(
    result.probes.filter((probe) => probe.required).map((probe) => probe.event),
    ["hmr.status"]
  );
  assert.deepEqual(
    new Set(result.probes.map((probe) => probe.event)),
    new Set([
      "hmr.status",
      "hmr.invalidate",
      "hmr.abort-error",
      "hmr.apply-error",
      "refresh.boundary-refresh",
      "refresh.boundary-invalidate",
      "refresh.non-boundary-invalidate",
      "refresh.completed",
      "reload.requested"
    ])
  );
});

test("compiled locations use one-based UTF-16 columns", () => {
  const unicode = "const marker = '😀'; currentStatus = newStatus;";
  const index = unicode.indexOf("currentStatus");
  assert.deepEqual(locationAt(unicode, index), {
    line: 1,
    column: unicode.slice(0, index).length + 1
  });
});
