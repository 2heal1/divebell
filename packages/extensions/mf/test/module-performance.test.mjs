import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import {
  createModulePerformanceInitScript,
  createModulePerformanceReport,
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

test("module performance attributes loadRemote, expose resources, and page impact without rerunning the module", () => {
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
  assert.deepEqual(operation.timing.loadRemote, {
    start: 1000,
    end: 1133,
    duration: 133
  });
  assert.deepEqual(operation.timing.get, {
    start: 1027,
    end: 1127,
    duration: 100
  });
  assert.equal(operation.manifest.status, "available");
  assert.equal(operation.manifest.assets[0].match, "matched");
  assert.equal(operation.manifest.assets[0].loadedBeforeGet, false);
  assert.equal(operation.bottleneck.type, "expose-resource");
  assert.deepEqual(operation.pageImpact, {
    fp: { startDelta: 800, endDelta: 933 },
    fcp: { startDelta: 500, endDelta: 633 },
    lcp: { startDelta: -200, endDelta: -67 }
  });
  assert.equal(operation.codeUsage.status, "recommended");
  assert.deepEqual(operation.codeUsage.assets, [
    "https://cdn.test/catalog/Button.js"
  ]);
  assert.equal(
    operation.codeUsage.documentation,
    "https://github.com/2heal1/divebell/blob/main/docs/code-usage-analysis.md"
  );
  assert.ok(operation.findings.some((finding) =>
    finding.id === "defer-expose-assets"
  ));
  assert.ok(operation.findings.every((finding) => !("suggestion" in finding)));
  assert.equal(result.summary.operationCount, 1);
  assert.equal("warnings" in result, false);
  assert.equal("recommendedActions" in result, false);
  assert.equal("warnings" in result.modules[0], false);
});

test("module performance report keeps a fixed producer and operation template", () => {
  const parsed = parseBrowserReadResult(browserRead(
    stateWithConsumer(),
    [longExposeTrace()]
  ));
  assert.equal(parsed.ok, true);
  const result = createModulePerformanceResult(
    parsed.snapshot,
    performanceSnapshot(),
    { target: "shop/Button" }
  );
  const report = createModulePerformanceReport(result);

  assert.equal(report.command, "mf module-perf --report");
  assert.deepEqual(Object.keys(report.report), [
    "page",
    "selection",
    "summary",
    "modules",
    "unobservedRemotes",
    "recommendations"
  ]);
  assert.deepEqual(Object.keys(report.report.modules[0]), [
    "consumer",
    "remote",
    "producer",
    "expose",
    "operations"
  ]);
  assert.deepEqual(Object.keys(report.report.modules[0].operations[0]), [
    "status",
    "timing",
    "pageImpact",
    "remoteEntry",
    "exposeAssets",
    "bottleneck",
    "findings"
  ]);
  assert.deepEqual(report.report.recommendations, [{
    id: "code-usage",
    severity: "info",
    title: "Analyze matched expose assets with Code Usage",
    target: {
      consumer: result.modules[0].consumer,
      remote: result.modules[0].remote,
      producer: result.modules[0].producer,
      expose: result.modules[0].expose
    },
    evidence: ["Matched expose asset: https://cdn.test/catalog/Button.js."],
    assets: ["https://cdn.test/catalog/Button.js"],
    reason: "Use Code Usage executed and unused-code evidence before changing code splitting; this is not proof that asset size caused the current bottleneck.",
    documentation: "https://github.com/2heal1/divebell/blob/main/docs/code-usage-analysis.md"
  }]);
});

test("missing Manifest keeps loadRemote and measured get/factory timing explicit", () => {
  const parsed = parseBrowserReadResult(browserRead(
    stateWithConsumer(),
    [loadTrace()]
  ));
  assert.equal(parsed.ok, true);
  const result = createModulePerformanceResult(parsed.snapshot, {
    ...performanceSnapshot(),
    exposes: []
  });
  const operation = result.modules[0].operations[0];
  assert.equal(operation.manifest.status, "unavailable");
  assert.deepEqual(operation.timing.loadRemote, {
    start: 1000,
    end: 1035,
    duration: 35
  });
  assert.equal(operation.timing.get.duration, 2);
  assert.equal(operation.timing.factory.duration, 3);
  assert.equal(operation.codeUsage.status, "unavailable");
  assert.equal(
    operation.codeUsage.documentation,
    "https://github.com/2heal1/divebell/blob/main/docs/code-usage-analysis.md"
  );
  assert.equal("warnings" in result.modules[0], false);
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

test("remoteEntry bottleneck uses only the request time that blocks module loading", () => {
  const parsed = parseBrowserReadResult(browserRead(
    stateWithConsumer(),
    [traceWithoutRemoteEntryStage({ getStart: 1120 })]
  ));
  assert.equal(parsed.ok, true);

  const cases = [{
    name: "preloaded before loadRemote",
    start: 100,
    end: 900,
    blockingDuration: 0,
    bottleneck: "factory",
    bottleneckDuration: 3
  }, {
    name: "partially overlaps loadRemote",
    start: 990,
    end: 1010,
    blockingDuration: 10,
    bottleneck: "remoteEntry",
    bottleneckDuration: 10
  }, {
    name: "blocks until get can start",
    start: 1005,
    end: 1120,
    blockingDuration: 115,
    bottleneck: "remoteEntry",
    bottleneckDuration: 115
  }];

  for (const current of cases) {
    const result = createModulePerformanceResult(
      parsed.snapshot,
      performanceWithRemoteEntry(current.start, current.end)
    );
    const operation = result.modules[0].operations[0];
    assert.deepEqual(operation.timing.remoteEntry, {
      start: current.start,
      end: current.end,
      duration: current.end - current.start,
      blockingDuration: current.blockingDuration
    }, current.name);
    assert.equal(operation.bottleneck.type, current.bottleneck, current.name);
    assert.equal(
      operation.bottleneck.duration,
      current.bottleneckDuration,
      current.name
    );
  }
});

test("zero blocking time is not reported as a bottleneck", () => {
  const trace = traceWithoutRemoteEntryStage({ getStart: 1120 });
  trace.events = trace.events.filter((event) =>
    event.phase !== "expose" && event.phase !== "moduleFactory"
  );
  const parsed = parseBrowserReadResult(browserRead(
    stateWithConsumer(),
    [trace]
  ));
  assert.equal(parsed.ok, true);

  const result = createModulePerformanceResult(
    parsed.snapshot,
    performanceWithRemoteEntry(100, 900)
  );
  const operation = result.modules[0].operations[0];
  assert.equal(operation.timing.remoteEntry.blockingDuration, 0);
  assert.equal(operation.bottleneck.type, "unknown");
  assert.equal("duration" in operation.bottleneck, false);
});

test("remoteEntry findings distinguish late initial loading from slow delivery", () => {
  const parsed = parseBrowserReadResult(browserRead(
    stateWithConsumer(),
    [traceWithoutRemoteEntryStage({ getStart: 1120 })]
  ));
  assert.equal(parsed.ok, true);

  const lateResult = createModulePerformanceResult(
    parsed.snapshot,
    performanceWithRemoteEntry(1060, 1120, { fcp: 1500, lcp: 1800 })
  );
  const lateOperation = lateResult.modules[0].operations[0];
  assert.equal(lateOperation.timing.remoteEntry.blockingDuration, 60);
  assert.ok(lateOperation.findings.some((finding) =>
    finding.id === "preload-remote-entry"
  ));
  assert.ok(lateOperation.findings.every((finding) =>
    finding.id !== "inspect-remote-entry-delivery"
  ));

  const slowResult = createModulePerformanceResult(
    parsed.snapshot,
    performanceWithRemoteEntry(1000, 1120, { fcp: 1500, lcp: 1800 })
  );
  const slowOperation = slowResult.modules[0].operations[0];
  assert.equal(slowOperation.timing.remoteEntry.duration, 120);
  assert.equal(slowOperation.timing.remoteEntry.blockingDuration, 120);
  assert.ok(slowOperation.findings.some((finding) =>
    finding.id === "inspect-remote-entry-delivery"
  ));
  assert.ok(slowOperation.findings.every((finding) =>
    finding.id !== "preload-remote-entry"
  ));
});

test("two operations mean two page-observed loadRemote histories", () => {
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
    exposes: []
  });
  assert.deepEqual(
    result.modules[0].operations.map((operation) => operation.traceId),
    ["load-1", "load-2"]
  );
  assert.equal(result.summary.operationCount, 2);
  assert.equal("renderedOperationCount" in result.summary, false);
});

test("operation outcome and completion boundary follow loadRemote itself", () => {
  const parsed = parseBrowserReadResult(browserRead(
    stateWithConsumer(),
    [
      loadTrace({ traceId: "failed-load", remoteEntryOutcome: "error" }),
      loadTrace({ traceId: "pending-load", base: 2000, pending: true })
    ]
  ));
  assert.equal(parsed.ok, true);
  const result = createModulePerformanceResult(parsed.snapshot, performanceSnapshot());
  const [failed, pending] = result.modules[0].operations;

  assert.equal(failed.outcome, "error");
  assert.deepEqual(failed.timing.loadRemote, {
    start: 1000,
    end: 1035,
    duration: 35
  });
  assert.equal(failed.bottleneck.type, "unknown");
  assert.equal(failed.findings[0].id, "resolve-load-failure");
  assert.equal(pending.outcome, "pending");
  assert.deepEqual(pending.timing.loadRemote, {
    start: 2000,
    duration: 13
  });
  assert.deepEqual(pending.pageImpact, {
    fp: { startDelta: 1800 },
    fcp: { startDelta: 1500 },
    lcp: { startDelta: 800 }
  });
  assert.equal(pending.findings[0].id, "complete-load-observation");
});

test("the injected collector reads page, resources, and Manifest expose assets safely", () => {
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
  const snapshot = context.__DIVEBELL_MF_MODULE_PERFORMANCE__.snapshot();

  assert.equal(isModulePerformanceBrowserSnapshot(snapshot), true);
  assert.deepEqual(context.__FEDERATION__.__GLOBAL_PLUGIN__, []);
  assert.equal(snapshot.page.url, "https://app.test/page");
  assert.equal("interactions" in snapshot.page, false);
  assert.equal(snapshot.resources[0].url, "https://cdn.test/catalog/Button.js");
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.resources[1])), {
    url: "https://opaque.test/catalog/Hidden.js",
    initiatorType: "script",
    start: 30,
    end: 130,
    duration: 100
  });
  assert.equal(snapshot.exposes[0].expose, "./Button");
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
      lcpStatus: "provisional"
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
    }]
  };
}

function performanceWithRemoteEntry(start, end, page = {}) {
  const snapshot = performanceSnapshot();
  return {
    ...snapshot,
    page: {
      ...snapshot.page,
      ...page
    },
    resources: [{
      url: "https://cdn.test/catalog/remoteEntry.js",
      initiatorType: "script",
      start,
      end,
      duration: end - start
    }, ...snapshot.resources]
  };
}

function traceWithoutRemoteEntryStage({ getStart }) {
  const current = loadTrace();
  current.events = current.events.filter((event) =>
    event.phase !== "remoteEntry"
  );
  const timestamps = new Map([
    ["remoteEntryInit:start", getStart - 2],
    ["remoteEntryInit:success", getStart - 1],
    ["expose:start", getStart],
    ["expose:success", getStart + 2],
    ["moduleFactory:start", getStart + 3],
    ["moduleFactory:success", getStart + 6],
    ["loadRemote:success", getStart + 7],
    ["loadRemote:complete", getStart + 8]
  ]);
  for (const event of current.events) {
    const timestamp = timestamps.get(`${event.phase}:${event.status}`);
    if (timestamp === undefined) continue;
    event.timestamp = timestamp;
    if (event.phase === "moduleFactory" && event.status === "success") {
      event.duration = 3;
    }
  }
  current.updatedAt = getStart + 8;
  current.duration = current.updatedAt - current.startedAt;
  return current;
}
