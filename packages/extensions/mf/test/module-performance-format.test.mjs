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
      { id: "fcp", label: "FCP", at: 231 },
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
        id: "consumer",
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
        id: "resource",
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

  assert.match(output, /^navigationStart = 0 ms/m);
  assert.match(output, /Paint[\s\S]*FP 142 ms · FCP 231 ms[\s\S]*LCP 480 ms \[provisional\]/);
  assert.match(output, /├[─┬]+┤/);
  assert.match(output, /Main HTML response 0–84 ms/);
  assert.match(output, /MF consumer.*host · loadRemote/);
  assert.match(output, /catalog\/Button 190–338 ms/);
  assert.match(output, /MF shared[\s\S]*host · loadShare/);
  assert.match(output, /react@18\.3\.1 Shared JS · loading/);
  assert.match(output, /catalog · loadShare[\s\S]*reuse react@18\.3\.1 Shared/);
  assert.match(output, /from host/);
  assert.match(output, /Button\.js 272–329 ms/);
  assert.doesNotMatch(output, /Page scripts|irrelevant\.js|1000/);
  assert.doesNotMatch(output, /transfer|decoded|cache:/);
  const paintLine = output.split("\n").find((line) => line.startsWith("Paint"));
  assert.equal((paintLine.match(/●/g) ?? []).length, 3);
  assert.doesNotMatch(output, /[│┼]/);
  assert.match(output, /[├─┤●]/);
  assert.ok(output.split("\n").every((line) => line.length <= 96));
});

test("keeps fallback origins, negative preloads, pending spans, and missing paints explicit", () => {
  const output = formatModulePerformanceTimeline({
    schemaVersion: 1,
    clock: { origin: "firstObservedModuleLoad", unit: "ms" },
    markers: [],
    lanes: [{
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

  assert.match(output, /^firstObservedModuleLoad = 0 ms/m);
  assert.match(output, /Paint[\s\S]*not observed/);
  assert.match(output, /Button\.js -25–… ms \[pending\]/);
  assert.match(output, /├…/);
  assert.ok(output.split("\n").every((line) => line.length <= 72));
});

test("rejects non-report values before terminal rendering", () => {
  assert.throws(
    () => formatModulePerformanceReportTimeline({ command: "mf status" }),
    /requires an mf module-perf --report result/
  );
});
