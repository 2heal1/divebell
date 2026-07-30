import { pluginModuleFederation } from "@module-federation/rsbuild-plugin";
import { defineConfig } from "@rsbuild/core";

import moduleFederationConfig from "./module-federation.config";

export default defineConfig({
  html: {
    template: "./index.html"
  },
  source: {
    entry: {
      index: "./src/index.ts"
    }
  },
  output: {
    assetPrefix: "/"
  },
  plugins: [
    pluginModuleFederation(moduleFederationConfig)
  ]
});
