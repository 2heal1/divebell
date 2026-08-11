import assert from "node:assert/strict";
import test from "node:test";

import {
  MfCoreError,
  createModuleInfoResult,
  createStatusResult,
  filterRelationshipsForInstances,
  parseBrowserReadResult
} from "../dist/public.js";
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
      shared: [{
        name: "react",
        versions: [
          {
            version: "18.3.1",
            provider: "catalog",
            loaded: true,
            singleton: true,
            strategy: "loaded-first"
          },
          { version: "17.0.2", provider: "legacy", loaded: false }
        ]
      }]
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

test("status returns compact instances, consumers, and loaded shared dependencies", () => {
  const { state } = multiInstanceFixture();
  state.relationships.push({
    consumerInstanceRef: "mf-2",
    producerInstanceRef: "mf-1",
    remote: { name: "host" },
    evidence: ["moduleCache.remoteInfo"],
    status: "resolved"
  });
  const globalShared = {
    default: {
      react: {
        "18.3.1": {
          from: "catalog",
          useIn: ["host"],
          loaded: true,
          scope: ["default"],
          strategy: "loaded-first",
          shareConfig: { singleton: true },
          lib: {
            source: "() => react",
            location: {
              url: "https://cdn.test/assets/main.js",
              line: 120,
              column: 18,
              original: {
                source: "src/shared/react.ts",
                line: 14,
                column: 2
              }
            }
          },
          get: {
            source: "() => factory",
            location: {
              url: "https://cdn.test/remoteEntry.js",
              line: 8,
              column: 4
            }
          }
        },
        "17.0.2": {
          from: "legacy",
          useIn: [],
          loaded: false,
          get: { source: "() => legacyFactory" }
        }
      }
    }
  };
  const parsed = parseBrowserReadResult(browserRead(state, [], {
    globalShared
  }));
  const result = createStatusResult(parsed.snapshot, {});
  assert.deepEqual(result.instances, [
    {
      instanceRef: "mf-1",
      name: "host",
      role: "consumer",
      consumers: [{ instanceRef: "mf-2", name: "catalog" }],
      active: true
    },
    {
      instanceRef: "mf-2",
      name: "catalog",
      role: "producer",
      consumers: [{ instanceRef: "mf-1", name: "host" }],
      active: true
    }
  ]);
  assert.deepEqual(result.shared, {
    default: {
      react: {
        "18.3.1": {
          from: "catalog",
          useIn: ["host"],
          loaded: true,
          scope: ["default"],
          strategy: "loaded-first",
          shareConfig: { singleton: true }
        }
      }
    }
  });
  assert.equal(JSON.stringify(result).includes("17.0.2"), false);
  assert.equal(JSON.stringify(result).includes("factory"), false);
  assert.equal(JSON.stringify(result).includes("runtimeVersion"), false);
  assert.equal(JSON.stringify(result).includes("remotes"), false);
  assert.equal(JSON.stringify(result).includes("shareScopes"), false);
  assert.equal(JSON.stringify(result).includes("relationships"), false);
  assert.equal(JSON.stringify(result).includes("compatibility"), false);
  assert.doesNotThrow(() => JSON.stringify(result));

  const verbose = createStatusResult(parsed.snapshot, {}, { verbose: true });
  assert.deepEqual(verbose.instances[0].remotes, [
    {
      name: "catalog",
      alias: "shop",
      entry: "https://cdn.test/catalog/mf-manifest.json",
      type: "global"
    }
  ]);
  assert.equal(verbose.relationships.length, 2);
  assert.equal(verbose.shared.default.react["17.0.2"].loaded, false);
  assert.equal(
    verbose.shared.default.react["17.0.2"].get.source,
    "() => legacyFactory"
  );
  assert.equal(
    verbose.shared.default.react["18.3.1"].lib.source,
    "() => react"
  );
  assert.deepEqual(
    verbose.shared.default.react["18.3.1"].lib.location.original,
    {
      source: "src/shared/react.ts",
      line: 14,
      column: 2
    }
  );
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

test("module-info prefers the resources that were actually loaded", () => {
  const { state } = multiInstanceFixture();
  const stale = report({
    events: [
      {
        phase: "manifest",
        status: "success",
        timestamp: 11,
        sanitizedUrl: "http://localhost:3000/mf-manifest.json",
        resource: {
          type: "manifest",
          initiator: "loadRemote",
          outcome: "success",
          url: "http://localhost:3000/mf-manifest.json",
          startedAt: 10,
          endedAt: 11
        }
      },
      {
        phase: "remoteEntry",
        status: "success",
        timestamp: 12,
        sanitizedUrl: "http://localhost:3000/remoteEntry.js",
        resource: {
          type: "remoteEntry",
          initiator: "loadRemote",
          outcome: "success",
          url: "http://localhost:3000/remoteEntry.js",
          startedAt: 11,
          endedAt: 12
        }
      }
    ]
  });
  const parsed = parseBrowserReadResult(browserRead(state, [stale]));
  const result = createModuleInfoResult(parsed.snapshot, {}, "shop");

  assert.equal(result.remote.manifestUrl, "http://localhost:3000/mf-manifest.json");
  assert.equal(result.remote.remoteEntryUrl, "http://localhost:3000/remoteEntry.js");
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
    (error) => error instanceof MfCoreError &&
      error.code === "MF_INSTANCE_STATE_UNAVAILABLE" &&
      error.facts.capability.available === false &&
      error.recommendedActions[0].type === "configure-observability" &&
      !JSON.stringify(error.issue).includes("divebell mf")
  );
});

test("public relationship filtering includes consumer, producer, and candidate links", () => {
  const relationships = [
    {
      consumerInstanceRef: "mf-1",
      producerInstanceRef: "mf-2",
      remote: { name: "catalog" },
      evidence: [],
      status: "resolved"
    },
    {
      consumerInstanceRef: "mf-3",
      candidateProducerInstanceRefs: ["mf-4"],
      remote: { name: "checkout" },
      evidence: [],
      status: "ambiguous"
    }
  ];
  assert.deepEqual(
    filterRelationshipsForInstances(relationships, ["mf-2", "mf-4"]),
    relationships
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
