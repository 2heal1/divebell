import assert from "node:assert/strict";
import { test } from "@rstest/core";

import {
  analyzeOpenRuntimeCodeUsage,
  createOpenRuntimeChunkMap,
  matchOpenRuntimeChunk
} from "../dist/chunk-map/index.js";

const stats = {
  hash: "build-123",
  publicPath: "/assets/",
  assets: [
    { name: "static/js/main.abc.js", size: 1200 },
    { name: "static/js/main.abc.js.map", size: 3200 },
    { name: "static/js/orders.def.js", size: 800 }
  ],
  chunks: [
    {
      id: 1,
      names: ["main"],
      files: ["static/js/main.abc.js"],
      initial: true,
      entry: true,
      modules: [
        {
          identifier: "concatenated|main",
          name: "main modules",
          size: 420,
          modules: [
            {
              id: "app",
              identifier: "/repo/src/App.tsx",
              name: "./src/App.tsx",
              nameForCondition: "/repo/src/App.tsx",
              descriptionFileData: { name: "example-app", version: "1.0.0" },
              descriptionFilePath: "/repo/package.json",
              moduleType: "javascript/auto",
              size: 180
            },
            {
              id: "layout",
              identifier: "loader!/repo/src/routes/layout.tsx?route",
              name: "./src/routes/layout.tsx",
              descriptionFileData: { name: "example-app", version: "1.0.0" },
              descriptionFilePath: "/repo/package.json",
              moduleType: "javascript/auto",
              size: 120
            },
            {
              id: "react",
              identifier: "/repo/node_modules/.pnpm/react@19.2.6/node_modules/react/index.js",
              name: "./node_modules/react/index.js",
              nameForCondition: "/repo/node_modules/.pnpm/react@19.2.6/node_modules/react/index.js",
              descriptionFileData: { name: "react", version: "19.2.6" },
              descriptionFilePath: "/repo/node_modules/.pnpm/react@19.2.6/node_modules/react/package.json",
              moduleType: "javascript/auto",
              size: 50
            },
            {
              id: "core",
              identifier: "/workspace/packages/core/src/index.ts",
              name: "../packages/core/src/index.ts",
              nameForCondition: "/workspace/packages/core/src/index.ts",
              descriptionFileData: { name: "@openruntime/core", version: "0.1.0" },
              descriptionFilePath: "/workspace/packages/core/package.json",
              moduleType: "javascript/auto",
              size: 70
            }
          ]
        }
      ]
    },
    {
      id: 2,
      names: ["orders/page"],
      files: ["static/js/orders.def.js"],
      initial: false,
      entry: false
    }
  ],
  modules: [
    {
      id: "orders",
      identifier: "/repo/src/routes/orders/page.tsx",
      name: "./src/routes/orders/page.tsx",
      nameForCondition: "/repo/src/routes/orders/page.tsx",
      descriptionFileData: { name: "example-app", version: "1.0.0" },
      descriptionFilePath: "/repo/package.json",
      moduleType: "javascript/auto",
      size: 640,
      chunks: [2]
    }
  ],
  entrypoints: {
    main: { chunks: [1] }
  },
  namedChunkGroups: {
    main: { chunks: [1] },
    "orders/page": { chunks: [2] }
  }
};

test("creates a complete and deterministic chunk map", () => {
  const chunkMap = createOpenRuntimeChunkMap(stats, { context: "/repo" });

  assert.equal(chunkMap.schemaVersion, 3);
  assert.equal(chunkMap.buildId, "build-123");
  assert.equal(chunkMap.publicPath, "/assets/");
  assert.deepEqual(chunkMap.chunks.map((chunk) => chunk.id), ["1", "2"]);

  const main = chunkMap.chunks[0];
  assert.ok(main);
  assert.equal(main.initial, true);
  assert.equal(main.entry, true);
  assert.deepEqual(main.splitRule, {
    kind: "entry",
    name: "Entry",
    configPath: "entry",
    inferred: false
  });
  assert.deepEqual(main.entrypoints, ["main"]);
  assert.deepEqual(main.assets, [{
    file: "static/js/main.abc.js",
    size: 1200,
    sourceMap: "static/js/main.abc.js.map"
  }]);
  assert.equal(main.moduleSize, 420);
  assert.deepEqual(main.modules.map((module) => module.sourcePath), [
    "/repo/node_modules/.pnpm/react@19.2.6/node_modules/react/index.js",
    "/repo/src/App.tsx",
    "/repo/src/routes/layout.tsx",
    "/workspace/packages/core/src/index.ts"
  ]);
  assert.deepEqual(main.modules.find((module) => module.id === "react")?.owner, {
    kind: "third-party",
    packageName: "react",
    packageVersion: "19.2.6",
    packageSubpath: "index.js"
  });
  assert.equal(main.modules.find((module) => module.id === "core")?.owner.kind, "workspace");

  const orders = chunkMap.chunks[1];
  assert.ok(orders);
  assert.equal(orders.initial, false);
  assert.deepEqual(orders.groups, ["orders/page"]);
  assert.deepEqual(orders.splitRule, {
    kind: "dynamic-import",
    name: "orders/page",
    configPath: null,
    inferred: true
  });
  assert.equal(orders.modules[0]?.sourcePath, "/repo/src/routes/orders/page.tsx");
  assert.deepEqual(chunkMap.packages.map((item) => [item.kind, item.packageName]), [
    ["application", "example-app"],
    ["third-party", "react"],
    ["workspace", "@openruntime/core"]
  ]);
});

test("matches a loaded URL to its chunk without depending on host or query", () => {
  const chunkMap = createOpenRuntimeChunkMap(stats);
  const result = matchOpenRuntimeChunk(
    chunkMap,
    "https://cdn.example.com/releases/42/static/js/orders.def.js?cache=1",
    { expectedBuildId: "build-123" }
  );

  assert.equal(result.status, "matched");
  if (result.status !== "matched") return;
  assert.equal(result.chunk.id, "2");
  assert.equal(result.asset.file, "static/js/orders.def.js");
  assert.equal(result.chunk.modules[0]?.sourcePath, "/repo/src/routes/orders/page.tsx");
});

test("refuses to analyze a request against a different build", () => {
  const chunkMap = createOpenRuntimeChunkMap(stats);
  assert.deepEqual(
    matchOpenRuntimeChunk(chunkMap, "/static/js/main.abc.js", {
      expectedBuildId: "build-older"
    }),
    {
      status: "build-mismatch",
      requestUrl: "/static/js/main.abc.js",
      expectedBuildId: "build-older",
      actualBuildId: "build-123"
    }
  );
});

test("reports missing and ambiguous assets instead of guessing", () => {
  const chunkMap = createOpenRuntimeChunkMap(stats);
  assert.equal(
    matchOpenRuntimeChunk(chunkMap, "/static/js/missing.js").status,
    "not-found"
  );

  const duplicate = structuredClone(chunkMap);
  const second = duplicate.chunks[1];
  assert.ok(second);
  second.assets = [{ file: "static/js/main.abc.js", size: 1200, sourceMap: null }];
  const ambiguous = matchOpenRuntimeChunk(duplicate, "/static/js/main.abc.js");
  assert.equal(ambiguous.status, "ambiguous");
});

test("attributes executed bytes to application and third-party sources", () => {
  const chunkMap = createOpenRuntimeChunkMap({
    hash: "coverage-build",
    assets: [
      { name: "static/js/main.js", size: 10 },
      { name: "static/js/main.js.map", size: 100 }
    ],
    chunks: [{
      id: 1,
      files: ["static/js/main.js"],
      initial: true,
      modules: [
        {
          identifier: "/repo/src/app.ts",
          name: "./src/app.ts",
          nameForCondition: "/repo/src/app.ts",
          descriptionFileData: { name: "example-app", version: "1.0.0" },
          descriptionFilePath: "/repo/package.json",
          size: 5
        },
        {
          identifier: "/repo/node_modules/react/index.js",
          name: "./node_modules/react/index.js",
          nameForCondition: "/repo/node_modules/react/index.js",
          descriptionFileData: { name: "react", version: "19.2.6" },
          descriptionFilePath: "/repo/node_modules/react/package.json",
          size: 5
        }
      ]
    }]
  }, { context: "/repo" });

  const report = analyzeOpenRuntimeCodeUsage({
    chunkMap,
    checkpoints: [{
      schemaVersion: 1,
      label: "first-screen",
      scripts: [{
        scriptId: "1",
        url: "https://app.test/static/js/main.js",
        functions: [{
          functionName: "",
          ranges: [
            { startOffset: 0, endOffset: 10, count: 1 },
            { startOffset: 5, endOffset: 10, count: 0 }
          ]
        }]
      }]
    }],
    assets: [{
      file: "static/js/main.js",
      code: "aaaa\nbbbb\n",
      sourceMapPath: "/repo/dist/static/js/main.js.map",
      sourceMap: {
        version: 3,
        sources: ["../../../src/app.ts", "../../../node_modules/react/index.js"],
        mappings: "AAAA;ACAA"
      }
    }]
  });

  const phase = report.phases[0];
  assert.ok(phase);
  assert.equal(phase.chunks[0]?.usedRatio, 0.5);
  assert.equal(phase.chunks[0]?.entry, false);
  assert.deepEqual(phase.chunks[0]?.groups, []);
  assert.deepEqual(phase.packages.map((item) => [
    item.packageName,
    item.usedBytes,
    item.totalBytes
  ]), [
    ["example-app", 5, 5],
    ["react", 0, 5]
  ]);
  assert.deepEqual(report.codeFiles, [{
    file: "static/js/main.js",
    code: "aaaa\nbbbb\n",
    totalBytes: 10
  }]);
  assert.deepEqual(phase.codeFiles, [{
    file: "static/js/main.js",
    chunkIds: ["1"],
    totalBytes: 10,
    usedBytes: 5,
    usedRatio: 0.5,
    executedRanges: [{ startOffset: 0, endOffset: 5 }]
  }]);
});
