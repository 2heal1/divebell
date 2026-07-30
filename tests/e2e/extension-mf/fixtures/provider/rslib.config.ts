import { pluginModuleFederation } from "@module-federation/rsbuild-plugin";
import { defineConfig } from "@rslib/core";

import moduleFederationConfig from "./module-federation.config";

export default defineConfig({
  lib: [{
    format: "mf",
    output: {
      assetPrefix: "/provider/",
      distPath: {
        root: "./dist/mf"
      }
    },
    plugins: [
      pluginModuleFederation(moduleFederationConfig)
    ]
  }]
});
