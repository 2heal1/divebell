import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import {
  createModulePerformanceInitScript,
  createModulePerformanceResult,
  isModulePerformanceBrowserSnapshot,
  parseBrowserReadResult
} from "../dist/public.js";
import { browserRead, instance } from "./fixtures.mjs";
import {
  catalogRemote,
  loadTrace,
  stateWithConsumer
} from "./remote-fixtures.mjs";

test("module performance attributes expose resources and page impact without rerunning the module", () => {
  const report = longExposeTrace();
  const producer = instance({
    instanceRef: "mf-producer",
    name: "@scope/catalog",
    version: "1.0.0",
    role: "producer"
  });
  const state = stateWithConsumer({
    instances: [stateWithConsumer().instances[0], producer]
  });
  const parsed = parseBrowserReadResult(browserRead(state, [report]));
  assert.equal(parsed.ok, true);

  const result = createModulePerformanceResult(
    parsed.snapshot,
    performanceSnapshot(),
    { target: "shop/Button" }
  );

  assert.deepEqual(result.page, {
    fp: 200,
    fcp: 500,
    lcp: 1200,
    lcpStatus: "provisional"
  });
  assert.equal(result.modules.length, 1);
  assert.equal(result.modules[0].operations.length, 1);
  const operation = result.modules[0].operations[0];
  assert.equal(operation.timing.requested, 1000);
  assert.deepEqual(operation.timing.get, {
    start: 1027,
    end: 1127,
    duration: 100
  });
  assert.equal(operation.timing.getToRender, 113);
  assert.equal(operation.timing.getToFirstContent, 118);
  assert.equal(operation.manifest.status, "available");
  assert.equal(operation.manifest.assets[0].match, "matched");
  assert.equal(operation.manifest.assets[0].loadedBeforeGet, false);
  assert.equal(operation.bottleneck.type, "expose-resource");
  assert.equal(operation.pageImpact.containsLcpElement, true);
  assert.equal(operation.codeUsage.status, "recommended");
  assert.deepEqual(operation.codeUsage.assets, [
    "https://cdn.test/catalog/Button.js"
  ]);
  assert.ok(operation.findings.some((finding) =>
    finding.id === "preload-expose-assets"
  ));
  assert.equal(result.summary.operationCount, 1);
});

test("missing Manifest and Bridge keep measured get/factory timing explicit", () => {
  const parsed = parseBrowserReadResult(browserRead(
    stateWithConsumer(),
    [loadTrace()]
  ));
  assert.equal(parsed.ok, true);
  const result = createModulePerformanceResult(parsed.snapshot, {
    ...performanceSnapshot(),
    exposes: [],
    renders: []
  });
  const operation = result.modules[0].operations[0];
  assert.equal(operation.manifest.status, "unavailable");
  assert.equal(operation.pageImpact.rendering, "not-observed");
  assert.equal(operation.timing.get.duration, 2);
  assert.equal(operation.timing.factory.duration, 3);
  assert.equal(operation.timing.render, undefined);
  assert.equal(operation.codeUsage.status, "unavailable");
  assert.match(result.modules[0].warnings.join(" "), /render and first-content timing/);
});

test("unavailable cross-origin resource sizes and cache are omitted", () => {
  const parsed = parseBrowserReadResult(browserRead(
    stateWithConsumer(),
    [longExposeTrace()]
  ));
  assert.equal(parsed.ok, true);
  const result = createModulePerformanceResult(parsed.snapshot, {
    ...performanceSnapshot(),
    resources: [{
      url: "https://cdn.test/catalog/Button.js",
      initiatorType: "script",
      start: 1027,
      end: 1107,
      duration: 80,
      transferSize: 0,
      encodedBodySize: 0,
      decodedBodySize: 0,
      cache: "unknown"
    }]
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.modules[0].operations[0].manifest.assets[0])),
    {
      asset: "Button.js",
      kind: "sync",
      match: "matched",
      url: "https://cdn.test/catalog/Button.js",
      start: 1027,
      end: 1107,
      duration: 80,
      loadedBeforeGet: false
    }
  );
});

test("two operations mean two page-observed loads and do not create render runs", () => {
  const parsed = parseBrowserReadResult(browserRead(
    stateWithConsumer(),
    [
      loadTrace({ traceId: "load-1", base: 1000 }),
      loadTrace({ traceId: "load-2", base: 2000 })
    ]
  ));
  assert.equal(parsed.ok, true);
  const result = createModulePerformanceResult(parsed.snapshot, {
    ...performanceSnapshot(),
    exposes: [],
    loads: [],
    renders: []
  });
  assert.deepEqual(
    result.modules[0].operations.map((operation) => operation.traceId),
    ["load-1", "load-2"]
  );
  assert.equal(result.summary.operationCount, 2);
  assert.equal(result.summary.renderedOperationCount, 0);
});

test("the injected collector is bounded and reads Manifest expose assets safely", () => {
  let clock = 200;
  const resourceEntries = [{
    name: "https://cdn.test/catalog/Button.js?token=secret",
    initiatorType: "script",
    startTime: 27,
    responseEnd: 107,
    duration: 80,
    transferSize: 1200,
    encodedBodySize: 1000,
    decodedBodySize: 3000
  }, {
    name: "https://opaque.test/catalog/Hidden.js",
    initiatorType: "script",
    startTime: 30,
    responseEnd: 130,
    duration: 100,
    transferSize: 0,
    encodedBodySize: 0,
    decodedBodySize: 0
  }];
  const context = vm.createContext({
    URL,
    location: { href: "https://app.test/page?token=secret" },
    performance: {
      timeOrigin: 1000,
      now: () => clock,
      getEntriesByType(type) {
        return type === "resource" ? resourceEntries : [];
      },
      setResourceTimingBufferSize() {}
    },
    addEventListener() {},
    document: { addEventListener() {}, visibilityState: "visible" }
  });
  context.globalThis = context;
  context.window = context;
  context.__FEDERATION__ = {
    __GLOBAL_PLUGIN__: [],
    moduleInfo: {
      "@scope/catalog:1.0.0": {
        version: "1.0.0",
        publicPath: "https://cdn.test/catalog/",
        remoteEntry: "remoteEntry.js",
        modules: [{
          moduleName: "./Button",
          assets: { js: { sync: ["Button.js?asset-token=secret"], async: [] } }
        }]
      }
    }
  };

  vm.runInContext(createModulePerformanceInitScript(), context);
  const plugin = context.__FEDERATION__.__GLOBAL_PLUGIN__[0];
  const hooks = plugin.apply({ options: { name: "host" } });
  const lifecycleArgs = {
    id: "@scope/catalog/Button",
    expose: "./Button",
    moduleInfo: { name: "@scope/catalog", alias: "shop" }
  };
  hooks.beforeGetExpose(lifecycleArgs);
  clock = 280;
  hooks.afterGetExpose(lifecycleArgs);
  clock = 285;
  hooks.beforeExecuteFactory(lifecycleArgs);
  clock = 300;
  hooks.afterExecuteFactory(lifecycleArgs);
  const snapshot = context.__DIVEBELL_MF_MODULE_PERFORMANCE__.snapshot();

  assert.equal(isModulePerformanceBrowserSnapshot(snapshot), true);
  assert.deepEqual(
    context.__FEDERATION__.__GLOBAL_PLUGIN__.map((plugin) => plugin.name),
    ["divebell-module-performance"]
  );
  assert.equal(snapshot.page.url, "https://app.test/page");
  assert.equal(snapshot.resources[0].url, "https://cdn.test/catalog/Button.js");
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.resources[1])), {
    url: "https://opaque.test/catalog/Hidden.js",
    initiatorType: "script",
    start: 30,
    end: 130,
    duration: 100
  });
  assert.equal(snapshot.exposes[0].expose, "./Button");
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.loads[0].get)), {
    start: 200,
    end: 280,
    duration: 80
  });
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.loads[0].factory)), {
    start: 285,
    end: 300,
    duration: 15
  });
  assert.doesNotMatch(JSON.stringify(snapshot), /secret/);
});

function longExposeTrace() {
  const current = loadTrace({ base: 1000 });
  const timestamps = new Map([
    ["expose:success", 1127],
    ["moduleFactory:start", 1128],
    ["moduleFactory:success", 1131],
    ["loadRemote:success", 1132],
    ["loadRemote:complete", 1133]
  ]);
  for (const event of current.events) {
    const timestamp = timestamps.get(`${event.phase}:${event.status}`);
    if (timestamp !== undefined) {
      event.timestamp = timestamp;
      if (event.phase === "moduleFactory" && event.status === "success") {
        event.duration = 3;
      }
    }
  }
  current.updatedAt = 1133;
  current.duration = 133;
  return current;
}

function performanceSnapshot() {
  return {
    schemaVersion: 1,
    installedAt: 1,
    page: {
      timeOrigin: 0,
      url: "https://app.test/",
      fp: 200,
      fcp: 500,
      lcp: 1200,
      lcpStatus: "provisional",
      interactions: []
    },
    resources: [{
      url: "https://cdn.test/catalog/Button.js",
      initiatorType: "script",
      start: 1027,
      end: 1107,
      duration: 80,
      transferSize: 1200,
      encodedBodySize: 1000,
      decodedBodySize: 3000,
      cache: "network"
    }],
    exposes: [{
      key: "@scope/catalog:1.0.0",
      name: "@scope/catalog",
      version: "1.0.0",
      publicPath: "https://cdn.test/catalog/",
      remoteEntry: "https://cdn.test/catalog/remoteEntry.js",
      expose: "./Button",
      js: {
        sync: ["Button.js"],
        async: []
      }
    }],
    loads: [],
    renders: [{
      id: "render-1",
      instanceName: "@scope/catalog",
      remote: "@scope/catalog",
      expose: "./Button",
      framework: "react",
      start: 1135,
      end: 1140,
      duration: 5,
      firstContent: 1145,
      firstContentDuration: 10,
      firstContentElement: "div.hero",
      containsLcpElement: true,
      status: "content-observed"
    }]
  };
}
