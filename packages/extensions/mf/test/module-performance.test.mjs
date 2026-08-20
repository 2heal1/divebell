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
  preloadTrace,
  stateWithConsumer
} from "./remote-fixtures.mjs";
import { sharedReport } from "./shared-fixtures.mjs";

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
    clock: {
      origin: "navigationStart",
      unit: "ms"
    },
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

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.command, "mf module-perf --report");
  assert.deepEqual(Object.keys(report.report), [
    "timeline",
    "summary",
    "modules",
    "sharedOperations",
    "recommendations",
    "page",
    "selection",
    "unobservedRemotes"
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
    "sharedDependencies",
    "preloadJs",
    "bottleneck",
    "findings"
  ]);
  assert.deepEqual(report.report.timeline.markers, [{
    id: "fp",
    label: "FP",
    at: 200
  }, {
    id: "fcp",
    label: "FCP",
    at: 500
  }, {
    id: "lcp",
    label: "LCP",
    at: 1200,
    status: "provisional"
  }]);
  assert.deepEqual(
    report.report.timeline.lanes.map((lane) => lane.kind),
    ["page", "mf-consumer", "mf-provider", "mf-resource"]
  );
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

test("the timeline shows host Shared JS loading and Remote Shared reuse", () => {
  const hostShared = sharedReport({
    traceId: "trace-host-react",
    operationId: "loadShare-host-react",
    instanceRef: "mf-1",
    package: "react",
    provider: "host",
    selectedVersion: "18.3.1",
    startedAt: 200,
    updatedAt: 400
  });
  delete hostShared.shared.remote;
  delete hostShared.shared.expose;
  delete hostShared.events[0].shared.remote;
  delete hostShared.events[0].shared.expose;
  const remoteShared = sharedReport({
    traceId: "trace-catalog-react",
    operationId: "loadShare-catalog-react",
    instanceRef: "mf-producer",
    package: "react",
    provider: "host",
    selectedVersion: "18.3.1",
    startedAt: 1028,
    updatedAt: 1029
  });
  delete remoteShared.shared.remote;
  delete remoteShared.shared.expose;
  delete remoteShared.events[0].shared.remote;
  delete remoteShared.events[0].shared.expose;
  const producer = instance({
    instanceRef: "mf-producer",
    name: "@scope/catalog",
    role: "producer"
  });
  const parsed = parseBrowserReadResult(browserRead(
    stateWithConsumer({
      instances: [stateWithConsumer().instances[0], producer]
    }),
    [hostShared, longExposeTrace(), remoteShared]
  ));
  assert.equal(parsed.ok, true);
  const performance = performanceSnapshot();
  performance.shared = [{
    key: "host:1.0.0",
    name: "host",
    version: "1.0.0",
    publicPath: "https://app.test/",
    packageName: "react",
    packageVersion: "18.3.1",
    js: { sync: ["react-shared.js"], async: [] }
  }];
  performance.resources.push({
    url: "https://app.test/react-shared.js",
    initiatorType: "script",
    declarations: ["script"],
    start: 210,
    end: 390,
    duration: 180
  });

  const result = createModulePerformanceResult(parsed.snapshot, performance);
  assert.deepEqual(result.sharedOperations.map((operation) => ({
    requester: operation.requester,
    packageName: operation.packageName,
    action: operation.action,
    provider: operation.provider,
    selectedVersion: operation.selectedVersion,
    timing: operation.timing,
    assets: operation.assets.map((asset) => asset.url)
  })), [{
    requester: "host",
    packageName: "react",
    action: "load",
    provider: "host",
    selectedVersion: "18.3.1",
    timing: { start: 200, end: 400, duration: 200 },
    assets: ["https://app.test/react-shared.js"]
  }, {
    requester: "@scope/catalog",
    packageName: "react",
    action: "reuse",
    provider: "host",
    selectedVersion: "18.3.1",
    timing: { start: 1028, end: 1029, duration: 1 },
    assets: []
  }]);

  const report = createModulePerformanceReport(result);
  const sharedLanes = report.report.timeline.lanes.filter((lane) =>
    lane.kind === "mf-shared"
  );
  assert.deepEqual(sharedLanes.map((lane) => lane.label), [
    "host · loadShare",
    "@scope/catalog · loadShare"
  ]);
  assert.equal(sharedLanes[0].items[0].label, "load react@18.3.1 Shared");
  assert.equal(
    sharedLanes[0].items[1].label,
    "react-shared.js · react Shared JS · loading"
  );
  assert.deepEqual({
    start: sharedLanes[0].items[1].start,
    end: sharedLanes[0].items[1].end,
    source: sharedLanes[0].items[1].source,
    resource: sharedLanes[0].items[1].resource
  }, {
    start: 210,
    end: 390,
    source: "browser",
    resource: {
      roles: ["shared-sync"],
      url: "https://app.test/react-shared.js",
      packageNames: ["react"]
    }
  });
  assert.equal(
    sharedLanes[1].items[0].label,
    "reuse react@18.3.1 Shared (from host)"
  );
  const pageScripts = report.report.timeline.lanes.find((lane) =>
    lane.kind === "page-script"
  );
  assert.ok(pageScripts === undefined || pageScripts.items.every((item) =>
    item.label !== "react-shared.js"
  ));
});

test("the report always starts with a timeline when browser performance is unavailable", () => {
  const parsed = parseBrowserReadResult(browserRead(
    stateWithConsumer(),
    [preloadTrace({ base: 900 }), loadTrace()]
  ));
  assert.equal(parsed.ok, true);

  const report = createModulePerformanceReport(
    createModulePerformanceResult(parsed.snapshot, null)
  );
  assert.equal(Object.keys(report.report)[0], "timeline");
  assert.deepEqual(report.report.timeline.clock, {
    origin: "firstObservedModuleLoad",
    unit: "ms"
  });
  assert.equal(report.report.timeline.lanes[0].items[0].label,
    "First observed module load");
  assert.equal(report.report.timeline.lanes.find((lane) =>
    lane.kind === "mf-consumer"
  ).items[0].start, 0);
  assert.equal(report.report.timeline.lanes.find((lane) =>
    lane.kind === "mf-preload"
  ).items[0].start, -99);
});

test("reused Shared values report producer Shared assets that still loaded", () => {
  const producer = instance({
    instanceRef: "mf-producer",
    name: "@scope/catalog",
    version: "1.0.0",
    role: "producer"
  });
  const state = stateWithConsumer({
    instances: [stateWithConsumer().instances[0], producer]
  });
  const parsed = parseBrowserReadResult(browserRead(
    state,
    [longExposeTrace()],
    {
      globalShared: {
        default: {
          react: {
            "18.2.0": {
              from: "host",
              useIn: ["@scope/catalog"],
              loaded: true,
              shareConfig: {
                requiredVersion: "^18.2.0",
                singleton: true
              }
            }
          }
        }
      }
    }
  ));
  assert.equal(parsed.ok, true);
  const performance = performanceSnapshot();
  performance.shared = [{
    key: "@scope/catalog:1.0.0",
    name: "@scope/catalog",
    version: "1.0.0",
    publicPath: "https://cdn.test/catalog/",
    packageName: "react",
    packageVersion: "18.3.1",
    requiredVersion: "^18.3.1",
    singleton: true,
    js: {
      sync: ["react-vendor.js"],
      async: []
    }
  }];
  performance.resources.push({
    url: "https://cdn.test/catalog/react-vendor.js",
    initiatorType: "script",
    start: 1005,
    end: 1025,
    duration: 20,
    transferSize: 2400,
    encodedBodySize: 2200,
    decodedBodySize: 7200,
    cache: "network"
  });

  const result = createModulePerformanceResult(parsed.snapshot, performance);
  const operation = result.modules[0].operations[0];
  assert.deepEqual(operation.sharedDependencies[0], {
    packageName: "react",
    packageVersion: "18.3.1",
    requiredVersion: "^18.3.1",
    singleton: true,
    resolution: "reused",
    provider: "host",
    selectedVersion: "18.2.0",
    evidence: [
      "Shared registry default/react@18.2.0 is loaded from host and used by @scope/catalog.",
      "@scope/catalog reused a Shared value from host."
    ],
    assets: [{
      asset: "react-vendor.js",
      kind: "sync",
      match: "matched",
      url: "https://cdn.test/catalog/react-vendor.js",
      start: 1005,
      end: 1025,
      duration: 20,
      loadedBeforeGet: true,
      transferSize: 2400,
      encodedBodySize: 2200,
      decodedBodySize: 7200,
      cache: "network"
    }]
  });
  assert.ok(operation.findings.some((finding) =>
    finding.id === "inspect-reused-shared-asset"
  ));

  const report = createModulePerformanceReport(result);
  const recommendation = report.report.recommendations.find((item) =>
    item.id === "inspect-reused-shared-asset"
  );
  assert.deepEqual(recommendation.assets, [
    "https://cdn.test/catalog/react-vendor.js"
  ]);
  assert.match(recommendation.reason, /Rsdoctor/);
  assert.match(recommendation.reason, /do not unify Shared versions/i);
  const resourceLane = report.report.timeline.lanes.find((lane) =>
    lane.kind === "mf-resource"
  );
  const sharedResource = resourceLane.items.find((item) =>
    item.type === "span" && item.resource?.roles.includes("shared-sync")
  );
  assert.deepEqual(sharedResource.resource, {
    roles: ["shared-sync"],
    url: "https://cdn.test/catalog/react-vendor.js",
    packageNames: ["react"],
    transferSize: 2400,
    encodedBodySize: 2200,
    decodedBodySize: 7200,
    cache: "network"
  });
});

test("reused Shared declarations do not warn when their JavaScript was not requested", () => {
  const producer = instance({
    instanceRef: "mf-producer",
    name: "@scope/catalog",
    role: "producer"
  });
  const parsed = parseBrowserReadResult(browserRead(
    stateWithConsumer({
      instances: [stateWithConsumer().instances[0], producer]
    }),
    [longExposeTrace()],
    {
      globalShared: {
        default: {
          react: {
            "18.2.0": {
              from: "host",
              useIn: ["@scope/catalog"],
              loaded: true
            }
          }
        }
      }
    }
  ));
  assert.equal(parsed.ok, true);
  const performance = performanceSnapshot();
  performance.shared = [{
    key: "@scope/catalog:1.0.0",
    name: "@scope/catalog",
    packageName: "react",
    packageVersion: "18.3.1",
    requiredVersion: "^18.3.1",
    singleton: true,
    publicPath: "https://cdn.test/catalog/",
    js: { sync: ["react-vendor.js"], async: [] }
  }];

  const result = createModulePerformanceResult(parsed.snapshot, performance);
  const operation = result.modules[0].operations[0];
  assert.equal(operation.sharedDependencies[0].resolution, "reused");
  assert.equal(operation.sharedDependencies[0].assets[0].match, "not-loaded");
  assert.ok(operation.findings.every((finding) =>
    finding.id !== "inspect-reused-shared-asset"
  ));
  assert.ok(createModulePerformanceReport(result).report.recommendations.every(
    (recommendation) => recommendation.id !== "inspect-reused-shared-asset"
  ));
});

test("the report timeline aligns navigation, page scripts, paints, and MF phases", () => {
  const parsed = parseBrowserReadResult(browserRead(
    stateWithConsumer(),
    [longExposeTrace()]
  ));
  assert.equal(parsed.ok, true);
  const performance = performanceSnapshot();
  performance.page.document = {
    start: 0,
    responseStart: 60,
    end: 90,
    duration: 90
  };
  performance.resources.push({
    url: "https://app.test/main.js",
    initiatorType: "script",
    declarations: ["script"],
    start: 70,
    end: 180,
    duration: 110
  }, {
    url: "https://app.test/catalog/Button.js",
    initiatorType: "script",
    declarations: ["script"],
    start: 75,
    end: 185,
    duration: 110
  });

  const timeline = createModulePerformanceReport(
    createModulePerformanceResult(parsed.snapshot, performance)
  ).report.timeline;
  const page = timeline.lanes.find((lane) => lane.kind === "page");
  const scripts = timeline.lanes.find((lane) => lane.kind === "page-script");
  const provider = timeline.lanes.find((lane) => lane.kind === "mf-provider");
  assert.deepEqual(page.items, [{
    id: "navigation-start",
    type: "point",
    label: "Visit URL",
    at: 0,
    source: "browser"
  }, {
    id: "main-document",
    type: "span",
    label: "Main HTML response",
    start: 0,
    end: 90,
    duration: 90,
    source: "browser"
  }]);
  assert.deepEqual(
    scripts.items.map((item) => item.label),
    ["main.js", "Button.js"]
  );
  assert.deepEqual(
    provider.items.map((item) => item.label),
    [
      "Manifest",
      "remoteEntry",
      "Provider container init",
      "Expose get / sync chunks",
      "Module factory",
      "Provider module loaded"
    ]
  );
});

test("the report shows only Manifest-attributed MF preload JavaScript", () => {
  const parsed = parseBrowserReadResult(browserRead(
    stateWithConsumer(),
    [longExposeTrace()]
  ));
  assert.equal(parsed.ok, true);
  const performance = performanceSnapshot();
  performance.resources = [{
    ...performance.resources[0],
    declarations: ["modulepreload"]
  }, {
    url: "https://app.test/unrelated-preload.js",
    initiatorType: "link",
    declarations: ["preload"],
    start: 20,
    end: 40,
    duration: 20
  }];

  const result = createModulePerformanceResult(parsed.snapshot, performance);
  const operation = result.modules[0].operations[0];
  assert.deepEqual(operation.preloadJs, [{
    asset: "https://cdn.test/catalog/Button.js",
    role: "expose-sync",
    initiators: ["modulepreload"],
    start: 1027,
    end: 1107,
    duration: 80
  }]);
  const report = createModulePerformanceReport(result);
  const preloadLanes = report.report.timeline.lanes.filter((lane) =>
    lane.kind === "mf-preload"
  );
  assert.equal(preloadLanes.length, 1);
  assert.match(preloadLanes[0].items[0].label, /Button\.js/);
  assert.doesNotMatch(JSON.stringify(report), /unrelated-preload/);
});

test("official preloadRemote JavaScript creates an MF preload lane", () => {
  const parsed = parseBrowserReadResult(browserRead(
    stateWithConsumer(),
    [preloadTrace({ base: 900 }), longExposeTrace()]
  ));
  assert.equal(parsed.ok, true);

  const result = createModulePerformanceResult(
    parsed.snapshot,
    performanceSnapshot()
  );
  const operation = result.modules[0].operations[0];
  assert.deepEqual(operation.preloadJs, [{
    asset: "https://cdn.test/catalog/Button.js",
    role: "expose-sync",
    initiators: ["preloadRemote"],
    start: 901,
    end: 911,
    duration: 10,
    outcome: "success"
  }]);
  assert.ok(createModulePerformanceReport(result).report.timeline.lanes.some((lane) =>
    lane.kind === "mf-preload"
  ));
});

test("remote-wide preload evidence omits JavaScript not owned by the selected expose", () => {
  const unrelated = preloadTrace({
    base: 900,
    resourceUrl: "https://cdn.test/catalog/Other.js"
  });
  delete unrelated.expose;
  const parsed = parseBrowserReadResult(browserRead(
    stateWithConsumer(),
    [unrelated, longExposeTrace()]
  ));
  assert.equal(parsed.ok, true);

  const result = createModulePerformanceResult(
    parsed.snapshot,
    performanceSnapshot(),
    { target: "shop/Button" }
  );
  assert.deepEqual(result.modules[0].operations[0].preloadJs, []);
  assert.ok(createModulePerformanceReport(result).report.timeline.lanes.every((lane) =>
    lane.kind !== "mf-preload"
  ));
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

test("the injected collector reads page, resources, expose assets, and Shared assets safely", () => {
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
  }, {
    name: "https://cdn.test/catalog/react-vendor.js?token=secret",
    initiatorType: "script",
    startTime: 31,
    responseEnd: 51,
    duration: 20,
    transferSize: 900,
    encodedBodySize: 800,
    decodedBodySize: 2400
  }, {
    name: "https://app.test/main.js?token=secret",
    initiatorType: "script",
    startTime: 12,
    responseEnd: 26,
    duration: 14,
    transferSize: 800,
    encodedBodySize: 700,
    decodedBodySize: 1400
  }];
  const context = vm.createContext({
    URL,
    location: { href: "https://app.test/page?token=secret" },
    performance: {
      timeOrigin: 1000,
      getEntriesByType(type) {
        if (type === "resource") return resourceEntries;
        if (type === "navigation") return [{
          startTime: 0,
          fetchStart: 0,
          responseStart: 8,
          responseEnd: 11
        }];
        return [];
      },
      setResourceTimingBufferSize() {}
    },
    addEventListener() {},
    document: {
      addEventListener() {},
      visibilityState: "visible",
      scripts: [{ src: "https://app.test/main.js?token=secret" }],
      querySelectorAll() {
        return [{
          rel: "modulepreload",
          href: "https://cdn.test/catalog/Button.js?token=secret"
        }, {
          rel: "preload",
          as: "script",
          href: "https://opaque.test/catalog/Hidden.js"
        }];
      }
    }
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
        }],
        shared: [{
          name: "react",
          version: "18.3.1",
          requiredVersion: "^18.3.1",
          singleton: true,
          assets: {
            js: { sync: ["react-vendor.js?asset-token=secret"], async: [] }
          }
        }]
      }
    }
  };

  vm.runInContext(createModulePerformanceInitScript(), context);
  const snapshot = context.__DIVEBELL_MF_MODULE_PERFORMANCE__.snapshot();

  assert.equal(isModulePerformanceBrowserSnapshot(snapshot), true);
  assert.deepEqual(context.__FEDERATION__.__GLOBAL_PLUGIN__, []);
  assert.equal(snapshot.page.url, "https://app.test/page");
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.page.document)), {
    start: 0,
    responseStart: 8,
    end: 11,
    duration: 11
  });
  assert.equal("interactions" in snapshot.page, false);
  assert.equal(snapshot.resources[0].url, "https://cdn.test/catalog/Button.js");
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.resources[1])), {
    url: "https://opaque.test/catalog/Hidden.js",
    initiatorType: "script",
    declarations: ["preload"],
    start: 30,
    end: 130,
    duration: 100
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(snapshot.resources[0].declarations)),
    ["modulepreload"]
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(snapshot.resources[3].declarations)),
    ["script"]
  );
  assert.equal(snapshot.exposes[0].expose, "./Button");
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.shared[0])), {
    key: "@scope/catalog:1.0.0",
    name: "@scope/catalog",
    version: "1.0.0",
    publicPath: "https://cdn.test/catalog/",
    packageName: "react",
    packageVersion: "18.3.1",
    requiredVersion: "^18.3.1",
    singleton: true,
    js: {
      sync: ["react-vendor.js"],
      async: []
    }
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
