import assert from "node:assert/strict";
import vm from "node:vm";
import test from "node:test";

import {
  MF_BROWSER_READ_SCRIPT,
  parseBrowserReadResult,
  parseRuntimeState,
  readMfObservability
} from "../dist/reader.js";
import { browserRead, instance, report, runtimeState } from "./fixtures.mjs";

test("injected mode accepts the MF-Obs-00 runtime-state schema", () => {
  const result = parseBrowserReadResult(browserRead(runtimeState()));
  assert.equal(result.ok, true);
  assert.equal(result.snapshot.observabilityMode, "injected");
  assert.equal(result.snapshot.observabilityVersion, "2.5.4");
});

test("reader accepts Bridge state without a commit observation field", () => {
  const result = parseBrowserReadResult(browserRead(runtimeState({
    instances: [instance({
      instanceRef: "mf-1",
      name: "host",
      role: "consumer",
      bridge: {
        available: true,
        states: [{
          bridgeId: "catalog-bridge",
          side: "consumer",
          framework: "react",
          status: "rendered",
          lastOperation: "render",
          lastOperationId: "bridge-op-1",
          lastOperationAt: 20,
          routeSyncObserved: false
        }]
      }
    })]
  })));

  assert.equal(
    result.snapshot.state.instances[0].bridge.states[0].commitObserved,
    false
  );
});

test("reader keeps only a bounded and sanitized MF proxy marker", () => {
  const result = parseBrowserReadResult(browserRead(runtimeState(), [], {
    proxyMarker: {
      schemaVersion: 1,
      source: "divebell/extension-mf",
      status: "installed",
      installedAt: 10,
      overrides: {
        shop: "https://user:secret@cdn.test/shop/mf-manifest.json?token=secret#hash"
      }
    }
  }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.snapshot.proxy, {
    schemaVersion: 1,
    source: "divebell/extension-mf",
    status: "installed",
    installedAt: 10,
    overrides: {
      shop: "https://cdn.test/shop/mf-manifest.json"
    }
  });
});

test("legacy shared flags are normalized and metadata entries are omitted", () => {
  const state = runtimeState({
    instances: [
      instance({
        instanceRef: "mf-1",
        name: "host",
        role: "consumer",
        shareScopes: [
          {
            name: "default",
            sharedCount: 2,
            sharedNames: ["react", "version"],
            shared: [
              {
                name: "react",
                versions: [
                  {
                    version: "19.1.1",
                    provider: "host",
                    loaded: true,
                    singleton: 1
                  }
                ]
              },
              {
                name: "version",
                versions: [{ version: "0" }, { version: "1" }]
              }
            ]
          }
        ]
      })
    ]
  });

  const parsed = parseRuntimeState(state);
  assert.deepEqual(parsed.instances[0].shareScopes[0], {
    name: "default",
    sharedCount: 1,
    sharedNames: ["react"],
    shared: [
      {
        name: "react",
        versions: [
          {
            version: "19.1.1",
            provider: "host",
            loaded: true,
            singleton: true
          }
        ]
      }
    ]
  });
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

test("browser adapter merges the global share table by scope, package, and version", () => {
  const state = runtimeState();
  const sharedMap = {
    default: {
      react: {
        "18.3.1": {
          from: "producer",
          useIn: ["host"],
          loaded: false,
          lib() {
            return "react";
          },
          get: () => "react-factory",
          scope: ["default"],
          deps: ["scheduler"],
          eager: true,
          strategy: "loaded-first",
          shareConfig: {
            requiredVersion: "^18.0.0",
            singleton: true,
            eager: false,
            strictVersion: false
          }
        },
        "17.0.2": {
          from: "legacy",
          useIn: [],
          loaded: false,
          get: () => "legacy-react"
        }
      }
    }
  };
  const context = vm.createContext({
    __FEDERATION__: {
      __OBSERVABILITY__: {
        chrome_extension: {
          getRuntimeState: () => state,
          getReports: () => []
        }
      },
      __SHARE__: {
        "host:1.0.0": sharedMap,
        "producer:1.0.0": sharedMap,
        "consumer:1.0.0": {
          default: {
            react: {
              "18.3.1": {
                from: "producer",
                useIn: ["catalog"],
                loaded: true,
                loading: Promise.resolve()
              }
            }
          }
        }
      }
    },
    __MF_OBSERVABILITY_INJECTION__: {
      observabilityVersion: "2.5.4"
    }
  });
  context.globalThis = context;
  const raw = vm.runInContext(MF_BROWSER_READ_SCRIPT, context);
  const result = parseBrowserReadResult(raw);
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.snapshot.globalShared.default.react["18.3.1"].useIn,
    ["catalog", "host"]
  );
  assert.equal(
    result.snapshot.globalShared.default.react["18.3.1"].loaded,
    true
  );
  assert.equal(
    result.snapshot.globalShared.default.react["18.3.1"].loading,
    undefined
  );
  assert.equal(
    result.snapshot.globalShared.default.react["18.3.1"].from,
    "producer"
  );
  assert.equal(
    result.snapshot.globalShared.default.react["18.3.1"].eager,
    true
  );
  assert.equal(
    result.snapshot.globalShared.default.react["17.0.2"].loaded,
    false
  );
  assert.equal(
    result.snapshot.globalShared.default.react["18.3.1"].lib,
    undefined
  );
});

test("default browser read does not collect lib or get locations", async () => {
  const state = runtimeState();
  const context = vm.createContext({
    __FEDERATION__: {
      __OBSERVABILITY__: {
        chrome_extension: {
          getRuntimeState: () => state,
          getReports: () => []
        }
      },
      __SHARE__: {
        host: {
          default: {
            react: {
              "18.3.1": {
                from: "host",
                useIn: ["host"],
                loaded: true,
                lib: () => "react",
                get: () => "react-factory"
              }
            }
          }
        }
      }
    },
    __MF_OBSERVABILITY_INJECTION__: {
      observabilityVersion: "2.5.4"
    }
  });
  context.globalThis = context;
  let rawCalled = false;
  const result = await readMfObservability({
    async eval(script) {
      return vm.runInContext(script, context);
    },
    async raw() {
      rawCalled = true;
      throw new Error("default reads must not request a debugger connection");
    }
  });
  assert.equal(result.ok, true);
  assert.equal(rawCalled, false);
  const shared = result.snapshot.globalShared.default.react["18.3.1"];
  assert.equal(shared.lib, undefined);
  assert.equal(shared.get, undefined);
});

test("--verbose browser read includes bounded lib and get source text", async () => {
  const state = runtimeState();
  const context = vm.createContext({
    __FEDERATION__: {
      __OBSERVABILITY__: {
        chrome_extension: {
          getRuntimeState: () => state,
          getReports: () => []
        }
      },
      __SHARE__: {
        host: {
          default: {
            react: {
              "18.3.1": {
                from: "host",
                useIn: ["host"],
                lib: () => "react",
                get: () => "react-factory"
              }
            }
          }
        }
      }
    },
    __MF_OBSERVABILITY_INJECTION__: {
      observabilityVersion: "2.5.4"
    }
  });
  context.globalThis = context;
  const result = await readMfObservability({
    async eval(script) {
      return vm.runInContext(script, context);
    }
  }, { verbose: true });
  assert.equal(result.ok, true);
  const shared = result.snapshot.globalShared.default.react["18.3.1"];
  assert.match(shared.lib.source, /react/);
  assert.match(shared.get.source, /react-factory/);
  assert.ok(shared.lib.source.length <= 1000);
  assert.ok(shared.get.source.length <= 1000);
});

test("shared function locations are validated and sensitive URL parts are removed", () => {
  const result = parseBrowserReadResult(browserRead(runtimeState(), [], {
    globalShared: {
      default: {
        react: {
          "18.3.1": {
            from: "host",
            useIn: ["host"],
            loaded: true,
            lib: {
              location: {
                url: "https://user:password@cdn.test/main.js?token=secret#hash"
              }
            },
            get: {
              source: "() => factory",
              location: {
                url: "https://cdn.test/remoteEntry.js",
                line: 8,
                column: 4,
                original: {
                  source:
                    "https://user:password@source.test/src/shared/react.ts?token=secret#hash",
                  line: 14,
                  column: 2
                }
              }
            }
          }
        }
      }
    }
  }));
  const shared = result.snapshot.globalShared.default.react["18.3.1"];
  assert.equal(shared.lib.location.url, "https://cdn.test/main.js");
  assert.deepEqual(shared.get.location.original, {
    source: "https://source.test/src/shared/react.ts",
    line: 14,
    column: 2
  });
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

test("schemaVersion 1 reports without newer optional fields remain readable", () => {
  const result = parseBrowserReadResult(browserRead(runtimeState(), [report()]));
  assert.equal(result.ok, true);
  assert.equal(result.snapshot.reports[0].remote.name, "catalog");
  assert.equal(result.snapshot.reports[0].events[0].phase, "manifest");
});

test("reader preserves public Remote resource results and strips unsafe input", () => {
  const remoteReport = report({
    requestId: "catalog/App",
    requestAlias: "shop/App",
    hostName: "host",
    runtimeVersion: "2.5.4",
    events: [{
      traceId: "trace-remote",
      instanceRef: "mf-1",
      phase: "remoteEntry",
      status: "success",
      timestamp: 125,
      requestId: "catalog/App",
      remote: {
        name: "catalog",
        entry: "https://cdn.test/remoteEntry.js?token=must-not-leak"
      },
      expose: "./App",
      duration: 25,
      recovered: false,
      cached: true,
      resource: {
        type: "remoteEntry",
        initiator: "loadRemote",
        outcome: "cached",
        url: "https://cdn.test/remoteEntry.js?token=must-not-leak#private",
        startedAt: 100,
        endedAt: 125,
        duration: 25,
        httpStatus: 200,
        mimeType: "text/javascript",
        redirected: false,
        cacheSource: "memory",
        errorType: "network",
        headers: { authorization: "Bearer secret" }
      },
      response: { headers: { cookie: "secret" } }
    }]
  });
  const result = parseBrowserReadResult(browserRead(runtimeState(), [remoteReport]));
  assert.equal(result.ok, true);
  const parsed = result.snapshot.reports[0];
  assert.equal(parsed.requestId, "catalog/App");
  assert.equal(parsed.events[0].resource.outcome, "cached");
  assert.equal(parsed.events[0].resource.httpStatus, 200);
  assert.equal(parsed.events[0].resource.url, "https://cdn.test/remoteEntry.js");
  assert.equal(parsed.events[0].remote.entry, "https://cdn.test/remoteEntry.js");
  assert.doesNotMatch(JSON.stringify(parsed), /authorization|cookie|must-not-leak|headers/);
});

test("reader preserves public Shared selection and registration fields", () => {
  const candidate = {
    scope: "default",
    version: "18.3.1",
    provider: "host",
    loaded: true,
    loading: false,
    singleton: true,
    eager: false,
    strategy: "loaded-first",
    compatible: true
  };
  const shared = {
    name: "react",
    shareScope: ["default"],
    version: "18.3.1",
    requiredVersion: "^18.0.0",
    selectedVersion: "18.3.1",
    availableVersions: ["17.0.2", "18.3.1"],
    provider: "host",
    useIn: ["catalog"],
    singleton: true,
    strictVersion: false,
    eager: false,
    strategy: "loaded-first",
    loaded: true,
    loading: false,
    selectionReason: "singleton-existing",
    loadType: "async",
    trigger: "build",
    moduleId: 42,
    chunkId: "shared-chunk",
    remote: "catalog",
    expose: "./App",
    requestId: "consume-request",
    operationId: "loadShare-42",
    fallback: false,
    recovered: true,
    candidates: [candidate],
    registration: {
      registrationId: "shared-register-1",
      action: "registered",
      reason: "container-share-registered",
      trigger: "container-init",
      scope: "default",
      candidate,
      effective: candidate
    },
    factory: () => "unsafe",
    token: "must-not-leak"
  };
  const sharedReport = report({
    remote: undefined,
    shared,
    events: [{
      phase: "shared",
      status: "success",
      timestamp: 200,
      requestId: "loadShare-42",
      shared
    }]
  });
  const result = parseBrowserReadResult(browserRead(runtimeState(), [sharedReport]));
  assert.equal(result.ok, true);
  const parsed = result.snapshot.reports[0].shared;
  assert.equal(parsed.selectedVersion, "18.3.1");
  assert.equal(parsed.candidates[0].provider, "host");
  assert.equal(parsed.registration.action, "registered");
  assert.equal(parsed.operationId, "loadShare-42");
  assert.doesNotMatch(JSON.stringify(parsed), /factory|token|must-not-leak/);
});

test("reader preserves public Bridge lifecycle and current-state fields", () => {
  const bridge = {
    operationId: "bridge-op-1",
    bridgeId: "catalog-bridge",
    side: "consumer",
    framework: "react",
    operation: "route-sync",
    moduleName: "CatalogApp",
    remote: "catalog",
    expose: "./App",
    route: {
      action: "host-to-remote",
      from: "/before?token=must-not-leak",
      to: "/after#private",
      basename: "/catalog",
      mechanism: "popstate"
    },
    startedAt: 300,
    endedAt: 315,
    duration: 15,
    outcome: "success"
  };
  const state = runtimeState({
    instances: [{
      instanceRef: "mf-1",
      name: "host",
      optionsName: "host",
      optionsVersion: "1.0.0",
      runtimeVersion: "2.5.4",
      role: "consumer",
      roleEvidence: { consumer: ["options.remotes"], producer: [] },
      remotes: [],
      loadedProducers: [],
      shareScopes: [],
      bridge: {
        available: true,
        lifecycleCount: 4,
        framework: "react",
        moduleName: "CatalogApp",
        remote: "catalog",
        expose: "./App",
        status: "rendered",
        lastOperationAt: 315,
        commitObserved: true,
        routeSyncObserved: true,
        states: [{
          bridgeId: "catalog-bridge",
          side: "consumer",
          framework: "react",
          moduleName: "CatalogApp",
          remote: "catalog",
          expose: "./App",
          status: "rendered",
          lastOperation: "route-sync",
          lastOperationId: "bridge-op-1",
          lastOperationAt: 315,
          commitObserved: true,
          routeSyncObserved: true,
          props: { token: "must-not-leak" },
          router: { private: true }
        }]
      },
      active: true
    }]
  });
  const bridgeReport = report({
    bridge,
    events: [{
      phase: "bridge-route",
      status: "success",
      timestamp: 315,
      duration: 15,
      lifecycle: "afterBridgeOperation",
      message: "bridge:route-sync-success",
      bridge
    }]
  });
  const result = parseBrowserReadResult(browserRead(state, [bridgeReport]));
  assert.equal(result.ok, true);
  const snapshot = result.snapshot;
  assert.equal(snapshot.state.instances[0].bridge.states[0].lastOperation, "route-sync");
  assert.equal(snapshot.reports[0].bridge.operationId, "bridge-op-1");
  assert.equal(snapshot.reports[0].bridge.route.from, "/before");
  assert.doesNotMatch(JSON.stringify(snapshot), /props|router|must-not-leak/);
});

test("reader rejects invalid types in newly recognized report fields", () => {
  const invalidResource = report({
    events: [{
      phase: "manifest",
      status: "success",
      timestamp: 10,
      resource: {
        type: "manifest",
        initiator: "loadRemote",
        startedAt: 1,
        httpStatus: "200"
      }
    }]
  });
  assert.throws(
    () => parseBrowserReadResult(browserRead(runtimeState(), [invalidResource])),
    /resource httpStatus/
  );

  const invalidShared = report({ shared: { name: "react", singleton: "yes" } });
  assert.throws(
    () => parseBrowserReadResult(browserRead(runtimeState(), [invalidShared])),
    /shared singleton/
  );
});

test("browser adapter reads only the public reader, injection marker, and global share table", () => {
  assert.match(MF_BROWSER_READ_SCRIPT, /__OBSERVABILITY__/);
  assert.match(MF_BROWSER_READ_SCRIPT, /getRuntimeState/);
  assert.match(MF_BROWSER_READ_SCRIPT, /__SHARE__/);
  assert.doesNotMatch(MF_BROWSER_READ_SCRIPT, /__INSTANCES__|moduleCache|moduleInfo|shareScopeMap|options\.id/);
});
