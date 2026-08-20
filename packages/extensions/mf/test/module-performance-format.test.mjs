import assert from "node:assert/strict";
import test from "node:test";

import {
  formatModulePerformanceReportTimeline,
  formatModulePerformanceTimeline
} from "../dist/module-performance/format.js";

test("renders a proportional terminal swimlane with exact observed boundaries", () => {
  const output = formatModulePerformanceTimeline({
    schemaVersion: 1,
    clock: { origin: "navigationStart", unit: "ms" },
    markers: [
      { id: "fp", label: "FP", at: 142 },
      { id: "fcp", label: "FCP", at: 142 },
      { id: "lcp", label: "LCP", at: 480, status: "provisional" }
    ],
    lanes: [
      {
        id: "page",
        kind: "page",
        label: "Page",
        items: [
          {
            id: "navigation-start",
            type: "point",
            label: "Visit URL",
            at: 0,
            source: "browser"
          },
          {
            id: "main-document",
            type: "span",
            label: "Main HTML response",
            start: 0,
            end: 84,
            duration: 84,
            source: "browser"
          }
        ]
      },
      {
        id: "module-1-operation-1-consumer",
        kind: "mf-consumer",
        label: "host · loadRemote",
        items: [{
          id: "load-remote",
          type: "span",
          label: "catalog/Button",
          start: 190,
          end: 338,
          duration: 148,
          source: "module-federation",
          status: "success"
        }]
      },
      {
        id: "host-shared",
        kind: "mf-shared",
        label: "host · loadShare",
        items: [{
          id: "host-react",
          type: "span",
          label: "react@18.3.1 Shared JS · loading",
          start: 100,
          end: 180,
          duration: 80,
          source: "module-federation"
        }]
      },
      {
        id: "remote-shared",
        kind: "mf-shared",
        label: "catalog · loadShare",
        items: [{
          id: "catalog-react",
          type: "span",
          label: "reuse react@18.3.1 Shared (from host)",
          start: 267,
          end: 268,
          duration: 1,
          source: "module-federation"
        }]
      },
      {
        id: "page-scripts",
        kind: "page-script",
        label: "Page scripts",
        items: [{
          id: "irrelevant-page-script",
          type: "span",
          label: "irrelevant.js",
          start: 500,
          end: 1000,
          duration: 500,
          source: "browser",
          resource: {
            roles: ["page-script"],
            url: "https://app.test/irrelevant.js"
          }
        }]
      },
      {
        id: "module-1-operation-1-provider",
        kind: "mf-provider",
        label: "catalog@1.0.0",
        items: [{
          id: "manifest",
          type: "span",
          label: "Manifest",
          start: 192,
          end: 205,
          duration: 13,
          source: "module-federation"
        }, {
          id: "container-init",
          type: "span",
          label: "Provider container init",
          start: 267,
          end: 268,
          duration: 1,
          source: "module-federation"
        }, {
          id: "module-loaded",
          type: "point",
          label: "Provider module loaded",
          at: 338,
          source: "module-federation",
          status: "success"
        }]
      },
      {
        id: "module-1-operation-1-resources",
        kind: "mf-resource",
        label: "catalog · resources",
        items: [{
          id: "button-resource",
          type: "span",
          label: "Button.js",
          start: 272,
          end: 329,
          duration: 57,
          source: "browser",
          resource: {
            roles: ["expose-sync"],
            url: "https://cdn.test/catalog/Button.js",
            transferSize: 12288,
            decodedBodySize: 24576,
            cache: "network"
          }
        }]
      }
    ]
  }, { columns: 96 });

  assert.match(output, /│ Event\s+│ Timeline · navigationStart = 0 ms/);
  assert.match(output, /│\s+│ 0s\s+0\.2s\s+0\.4s/);
  assert.match(output, /│ Page\s+│/);
  assert.match(output, /│ {3}Paint\s+│[\s●]+◇/);
  assert.match(output, /FP · FCP[\s\S]*LCP/);
  assert.match(output, /0\.142s[\s\S]*0\.48s/);
  assert.match(output, /Consumer · host/);
  assert.match(output, /loadRemote/);
  assert.match(output, /catalog\/Button\s+│\s+━+●/);
  assert.match(output, /0\.19s\s+0\.338s/);
  assert.match(output, /react@18\.3\.1\s+│\s+━+/);
  assert.match(output, /80ms/);
  assert.match(output, /Producer · catalog/);
  assert.match(output, /Lifecycle/);
  assert.match(output, /Container init\s+│\s+◆/);
  assert.match(output, /Module loaded\s+│\s+●/);
  assert.match(output, /Button\.js\s+│\s+━+/);
  assert.match(output, /57ms · 12 KB/);
  assert.match(output, /◆ reuse/);
  assert.match(output, /0\.268s/);
  assert.doesNotMatch(output, /Page scripts|irrelevant\.js|1000/);
  assert.doesNotMatch(output, /Main HTML response|Visit URL|from host/);
  assert.doesNotMatch(output, /transfer|decoded|cache:|190–338|272–329/);
  const sharedEventLine = output.split("\n").find((line) =>
    line.includes("react@18.3.1") && line.includes("━")
  );
  assert.doesNotMatch(sharedEventLine, /80ms|KB/);
  const sharedMetricLine = output.split("\n").find((line) => line.includes("80ms"));
  assert.ok(sharedMetricLine.indexOf("80ms") > sharedMetricLine.indexOf("│", 1));
  assert.doesNotMatch(sharedMetricLine, /KB/);
  assert.match(output, /[┌┬┐├┼┤└┴┘━◆●◇]/);
  assert.ok(output.split("\n").every((line) => line.length <= 96));
});

test("keeps fallback origins, negative preloads, pending spans, and missing paints explicit", () => {
  const output = formatModulePerformanceTimeline({
    schemaVersion: 1,
    clock: { origin: "firstObservedModuleLoad", unit: "ms" },
    markers: [],
    lanes: [{
      id: "consumer",
      kind: "mf-consumer",
      label: "host · loadRemote",
      items: [{
        id: "pending-load",
        type: "span",
        label: "catalog/Button",
        start: -10,
        source: "module-federation",
        status: "pending"
      }]
    }, {
      id: "preload",
      kind: "mf-preload",
      label: "catalog · preload",
      items: [{
        id: "preload-resource",
        type: "span",
        label: "Button.js",
        start: -25,
        source: "module-federation",
        status: "pending"
      }]
    }]
  }, { columns: 72 });

  assert.match(output, /Timeline · firstObservedModuleLoad = 0 ms/);
  assert.match(output, /-0\.04s\s+-0\.02s\s+0s/);
  assert.match(output, /Paint\s+│ not observed/);
  assert.match(output, /Consumer · host/);
  assert.match(output, /catalog\/Button\s+│\s+━…/);
  assert.doesNotMatch(output, /pending · pending/);
  assert.match(output, /Producer · catalog/);
  assert.match(output, /Button\.js\s+│\s+━…/);
  assert.match(output, /… · pending/);
  assert.doesNotMatch(output, /-25–/);
  assert.ok(output.split("\n").every((line) => line.length <= 72));
});

test("rejects non-report values before terminal rendering", () => {
  assert.throws(
    () => formatModulePerformanceReportTimeline({ command: "mf status" }),
    /requires an mf module-perf --report result/
  );
});
