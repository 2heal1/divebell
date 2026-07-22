import assert from "node:assert/strict";
import vm from "node:vm";
import test from "node:test";

import {
  MF_BROWSER_READ_SCRIPT,
  parseBrowserReadResult,
  parseRuntimeState
} from "../dist/reader.js";
import { browserRead, runtimeState } from "./fixtures.mjs";

test("injected mode accepts the MF-Obs-00 runtime-state schema", () => {
  const result = parseBrowserReadResult(browserRead(runtimeState()));
  assert.equal(result.ok, true);
  assert.equal(result.snapshot.observabilityMode, "injected");
  assert.equal(result.snapshot.observabilityVersion, "2.5.4");
});

test("application mode is distinguished from injected mode", () => {
  const result = parseBrowserReadResult(browserRead(runtimeState({
    scope: { name: "runtime_host", realm: "current", frame: "top" }
  }), [], {
    selectedScope: "runtime_host",
    mode: "application",
    observabilityVersion: "unknown",
    availableScopes: ["chrome_extension", "runtime_host"],
    compatibleScopes: ["chrome_extension", "runtime_host"]
  }));
  assert.equal(result.snapshot.observabilityMode, "application");
  assert.equal(result.snapshot.selectedScope, "runtime_host");
});

test("browser adapter prefers one application reader when injected and application readers coexist", () => {
  const injectedState = runtimeState();
  const applicationState = runtimeState({
    scope: { name: "runtime_host", realm: "current", frame: "top" }
  });
  const context = vm.createContext({
    __FEDERATION__: {
      __OBSERVABILITY__: {
        chrome_extension: {
          getRuntimeState: () => injectedState,
          getReports: () => []
        },
        runtime_host: {
          getRuntimeState: () => applicationState,
          getReports: () => []
        }
      }
    }
  });
  context.globalThis = context;
  const result = vm.runInContext(MF_BROWSER_READ_SCRIPT, context);
  assert.equal(result.ok, true);
  assert.equal(result.mode, "application");
  assert.equal(result.selectedScope, "runtime_host");
});

test("unavailable mode preserves what was checked and how to recover", () => {
  const result = parseBrowserReadResult({
    ok: false,
    reason: "unavailable",
    message: "No reader.",
    availableScopes: [],
    compatibleScopes: []
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "unavailable");
  assert.deepEqual(result.availableScopes, []);
});

test("multiple application readers are not silently reduced to the first", () => {
  const result = parseBrowserReadResult({
    ok: false,
    reason: "multiple-readers",
    message: "Multiple readers.",
    availableScopes: ["one", "two", "chrome_extension"],
    compatibleScopes: ["one", "two", "chrome_extension"]
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "multiple-readers");
});

test("arbitrary page globals fail structural validation", () => {
  assert.throws(() => parseRuntimeState({ schemaVersion: 1, instances: {} }), /scope/);
  assert.throws(() => parseBrowserReadResult({ ok: true, state: { schemaVersion: 99 } }));
});

test("browser adapter only names the public reader and extension marker", () => {
  assert.match(MF_BROWSER_READ_SCRIPT, /__OBSERVABILITY__/);
  assert.match(MF_BROWSER_READ_SCRIPT, /getRuntimeState/);
  assert.doesNotMatch(MF_BROWSER_READ_SCRIPT, /__INSTANCES__|moduleCache|moduleInfo|shareScopeMap|options\.id/);
});
