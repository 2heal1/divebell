import assert from "node:assert/strict";
import test from "node:test";

import {
  createModuleInfoResult,
  createStatusResult,
  parseBrowserReadResult
} from "../dist/index.js";
import { browserRead, capability, instance, report, runtimeState } from "./fixtures.mjs";

function multiInstanceFixture() {
  const consumer = instance({
    instanceRef: "mf-1",
    name: "host",
    role: "consumer",
    remotes: [{
      name: "catalog",
      alias: "shop",
      entry: "https://cdn.test/catalog/mf-manifest.json",
      type: "global"
    }],
    loadedProducers: [{
      name: "catalog",
      alias: "shop",
      version: "2.0.0",
      entry: "https://cdn.test/catalog/mf-manifest.json",
      entryGlobalName: "catalog",
      type: "global"
    }]
  });
  const producer = instance({
    instanceRef: "mf-2",
    name: "catalog",
    version: "2.0.0",
    role: "producer",
    shareScopes: [{
      name: "default",
      sharedCount: 1,
      sharedNames: ["react"],
      shared: [{ name: "react", versions: [{ version: "18.3.1", loaded: true }] }]
    }]
  });
  const state = runtimeState({
    instances: [consumer, producer],
    relationships: [{
      consumerInstanceRef: "mf-1",
      producerInstanceRef: "mf-2",
      remote: {
        name: "catalog",
        alias: "shop",
        version: "2.0.0",
        entry: "https://cdn.test/catalog/mf-manifest.json"
      },
      evidence: ["moduleCache.remoteInfo"],
      status: "resolved"
    }],
    moduleInfo: [{
      key: "catalog:2.0.0",
      name: "catalog",
      version: "2.0.0",
      entry: "https://cdn.test/catalog/mf-manifest.json",
      tag: "manifest",
      remotes: [{ name: "design-system" }]
    }]
  });
  return { consumer, producer, state };
}

test("status keeps nested and cyclic relationships flat", () => {
  const { state } = multiInstanceFixture();
  state.relationships.push({
    consumerInstanceRef: "mf-2",
    producerInstanceRef: "mf-1",
    remote: { name: "host" },
    evidence: ["moduleCache.remoteInfo"],
    status: "resolved"
  });
  const parsed = parseBrowserReadResult(browserRead(state));
  const result = createStatusResult(parsed.snapshot, {});
  assert.equal(result.instances.length, 2);
  assert.equal(result.relationships.length, 2);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test("module-info reports loaded facts from the public state and reports", () => {
  const { state } = multiInstanceFixture();
  const parsed = parseBrowserReadResult(browserRead(state, [report()]));
  const result = createModuleInfoResult(parsed.snapshot, {}, "shop");
  assert.equal(result.remote.status, "loaded");
  assert.equal(result.remote.producerInstanceRef, "mf-2");
  assert.equal(result.remote.manifestUrl, "https://cdn.test/catalog/mf-manifest.json");
  assert.equal(result.remote.remoteEntryUrl, "https://cdn.test/catalog/remoteEntry.js");
  assert.equal(result.remote.publicPath, "https://cdn.test/catalog/");
  assert.deepEqual(result.remote.exposes, ["./App"]);
  assert.equal(result.remote.shared[0].sharedNames[0], "react");
  assert.equal(result.remote.dependencyRemotes[0].name, "design-system");
  assert.equal(result.remote.cached, false);
  assert.equal(result.remote.firstLoadedAt, 10);
});

test("declared remote is not presented as loaded", () => {
  const declared = instance({
    instanceRef: "mf-1",
    name: "host",
    role: "consumer",
    remotes: [{ name: "catalog", entry: "https://cdn.test/catalog/mf-manifest.json" }]
  });
  const state = runtimeState({ instances: [declared] });
  const parsed = parseBrowserReadResult(browserRead(state));
  const result = createModuleInfoResult(parsed.snapshot, {}, "catalog");
  assert.equal(result.remote.status, "declared");
  assert.equal(result.remote.cached, "unknown");
  assert.match(result.warnings.join(" "), /declared but no load is confirmed/);
});

test("partial history and unavailable capability remain explicit", () => {
  const { state } = multiInstanceFixture();
  state.completeness = {
    currentState: "complete",
    history: "partial",
    historyCleared: false,
    lateBoundInstanceRefs: ["mf-1"],
    recommendation: "Reopen the page."
  };
  state.capabilities.remoteTrace = capability(false, "unavailable", "No remote signals.");
  const parsed = parseBrowserReadResult(browserRead(state));
  const result = createModuleInfoResult(parsed.snapshot, {}, "catalog");
  assert.equal(result.compatibility.completeness.history, "partial");
  assert.match(result.warnings.join(" "), /No remote signals/);
  assert.match(result.recommendedActions.join(" "), /Reopen/);
});

test("missing instanceState capability fails before selection", () => {
  const { state } = multiInstanceFixture();
  state.capabilities.instanceState = capability(false, "unavailable", "Old reader.");
  const parsed = parseBrowserReadResult(browserRead(state));
  assert.throws(
    () => createStatusResult(parsed.snapshot, {}),
    (error) => error.code === "MF_INSTANCE_STATE_UNAVAILABLE"
  );
});

test("JSON result contains neither functions nor private MF objects", () => {
  const { state } = multiInstanceFixture();
  const parsed = parseBrowserReadResult(browserRead(state, [report()]));
  const result = createModuleInfoResult(parsed.snapshot, {}, "catalog");
  const json = JSON.stringify(result);
  assert.doesNotMatch(json, /__INSTANCES__|moduleCache|shareScopeMap|options\.id/);
  assert.doesNotMatch(json, /function|factory|container/i);
});
