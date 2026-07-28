import { defineConfig } from "@rsbuild/core";
import { DivebellChunkMapRspackPlugin } from "@divebell/rspack-plugin";

const pagesBase = process.env.DIVEBELL_PAGES_BASE ?? "/";

export default defineConfig({
  html: {
    template: "./index.html",
    title: "Northstar Supply | Operations"
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
      config.plugins.push(new DivebellChunkMapRspackPlugin());
    }
  }
});
