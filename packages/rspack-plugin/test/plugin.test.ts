import assert from "node:assert/strict";
import { test } from "@rstest/core";

import { OpenRuntimeChunkMapRspackPlugin } from "../dist/index.js";

test("emits a Rspack Chunk Map without depending on Modern.js", () => {
  let compilationHandler: ((compilation: unknown) => void) | undefined;
  let processAssetsHandler: (() => void) | undefined;
  let emittedName: string | undefined;
  let emittedValue: string | undefined;

  class RawSource {
    constructor(readonly value: string) {}
  }

  const plugin = new OpenRuntimeChunkMapRspackPlugin();
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
  assert.equal(emittedName, "openruntime-chunks.json");
  const chunkMap = JSON.parse(emittedValue ?? "");
  assert.equal(chunkMap.generator, "@openruntime/rspack-plugin");
  assert.equal(chunkMap.buildId, "rspack-build-1");
  assert.deepEqual(chunkMap.chunks[0].splitRule, {
    kind: "cache-group",
    name: "react",
    configPath: "optimization.splitChunks.cacheGroups.react",
    inferred: false
  });
});
