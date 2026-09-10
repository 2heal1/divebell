import assert from "node:assert/strict";
import { test } from "@rstest/core";

import { DivebellChunkMapRspackPlugin } from "../dist/index.js";

test("emits a Rspack Chunk Map without depending on Modern.js", () => {
  let compilationHandler: ((compilation: unknown) => void) | undefined;
  let processAssetsHandler: (() => void) | undefined;
  let emittedName: string | undefined;
  let emittedValue: string | undefined;

  class RawSource {
    constructor(readonly value: string) {}
  }

  const plugin = new DivebellChunkMapRspackPlugin();
  plugin.apply({
    context: "/repo",
    options: {
      target: "web",
      optimization: {
        splitChunks: {
          cacheGroups: {
            react: {
              name: "lib-react",
              test: /node_modules[\\/]react[\\/]/
            }
          }
        }
      }
    },
    hooks: {
      thisCompilation: {
        tap(_name: string, handler: (compilation: unknown) => void) {
          compilationHandler = handler;
        }
      }
    },
    webpack: {
      Compilation: { PROCESS_ASSETS_STAGE_REPORT: 5000 },
      sources: { RawSource }
    }
  } as never);

  assert.ok(compilationHandler);
  compilationHandler({
    fullHash: "rspack-build-1",
    chunks: [],
    chunkGraph: {
      getChunkModulesIterable: () => [],
      getModuleId: () => null
    },
    hooks: {
      processAssets: {
        tap(_options: unknown, handler: () => void) {
          processAssetsHandler = handler;
        }
      }
    },
    getStats: () => ({
      toJson: () => ({
        hash: "rspack-build-1",
        publicPath: "/",
        assets: [{ name: "static/js/lib-react.js", size: 1200 }],
        chunks: [{
          id: 1,
          names: ["lib-react"],
          files: ["static/js/lib-react.js"],
          initial: true,
          entry: false,
          modules: []
        }],
        modules: [],
        entrypoints: {},
        namedChunkGroups: { index: { chunks: [1] } }
      })
    }),
    getAssets: () => [],
    getAsset: () => undefined,
    emitAsset(name: string, source: RawSource) {
      emittedName = name;
      emittedValue = source.value;
    },
    updateAsset: () => {
      throw new Error("updateAsset should not be called");
    }
  });

  assert.ok(processAssetsHandler);
  processAssetsHandler();
  assert.equal(emittedName, "divebell-chunks.json");
  const chunkMap = JSON.parse(emittedValue ?? "");
  assert.equal(chunkMap.generator, "@divebell/rspack-plugin");
  assert.equal(chunkMap.buildId, "rspack-build-1");
  assert.deepEqual(chunkMap.chunks[0].splitRule, {
    kind: "cache-group",
    name: "react",
    configPath: "optimization.splitChunks.cacheGroups.react",
    inferred: false
  });
});

test("keeps module attribution when Rspack does not expose getModuleId", () => {
  let compilationHandler: ((compilation: unknown) => void) | undefined;
  let processAssetsHandler: (() => void) | undefined;
  let emittedValue = "";
  class RawSource { constructor(readonly value: string) {} }
  const module = {
    type: "javascript/auto",
    identifier: () => "/repo/node_modules/demo/index.js",
    readableIdentifier: () => "./node_modules/demo/index.js",
    nameForCondition: () => "/repo/node_modules/demo/index.js",
    size: () => 1200,
    resource: "/repo/node_modules/demo/index.js",
    resourceResolveData: {
      path: "/repo/node_modules/demo/index.js",
      descriptionFileData: { name: "demo", version: "1.2.3" },
      descriptionFilePath: "/repo/node_modules/demo/package.json"
    }
  };
  new DivebellChunkMapRspackPlugin().apply({
    context: "/repo",
    options: { target: "web" },
    hooks: { thisCompilation: { tap(_name: string, handler: (compilation: unknown) => void) { compilationHandler = handler; } } },
    webpack: { Compilation: { PROCESS_ASSETS_STAGE_REPORT: 5000 }, sources: { RawSource } }
  } as never);
  assert.ok(compilationHandler);
  compilationHandler({
    hash: "rspack-old-graph",
    chunks: [{ id: 7 }],
    chunkGraph: { getChunkModulesIterable: () => [module] },
    hooks: { processAssets: { tap(_options: unknown, handler: () => void) { processAssetsHandler = handler; } } },
    getStats: () => ({ toJson: () => ({
      hash: "rspack-old-graph",
      publicPath: "/",
      assets: [{ name: "static/js/7.js", size: 1200 }],
      chunks: [{ id: 7, names: ["7"], files: ["static/js/7.js"], initial: false, modules: [] }],
      modules: [], entrypoints: {}, namedChunkGroups: {}
    }) }),
    getAsset: () => undefined,
    emitAsset(_name: string, source: RawSource) { emittedValue = source.value; },
    updateAsset: () => { throw new Error("updateAsset should not be called"); }
  });
  assert.ok(processAssetsHandler);
  processAssetsHandler();
  const chunkMap = JSON.parse(emittedValue);
  assert.equal(chunkMap.chunks[0].modules[0].id, null);
  assert.equal(chunkMap.chunks[0].modules[0].owner.packageName, "demo");
  assert.equal(chunkMap.chunks[0].modules[0].owner.packageVersion, "1.2.3");
});
