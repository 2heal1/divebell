import { defineConfig } from "@rsbuild/core";
import { OpenRuntimeChunkMapRspackPlugin } from "@openruntime/rspack-plugin";

const pagesBase = process.env.OPENRUNTIME_PAGES_BASE ?? "/";

export default defineConfig({
  html: {
    template: "./index.html",
    title: "OpenRuntime Quick Start"
  },
  output: {
    assetPrefix: pagesBase,
    sourceMap: {
      js: "source-map"
    }
  },
  server: {
    port: 19084
  },
  tools: {
    rspack(config) {
      config.plugins.push(new OpenRuntimeChunkMapRspackPlugin());
    }
  }
});
