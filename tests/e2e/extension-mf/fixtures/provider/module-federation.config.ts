import { createModuleFederationConfig } from "@module-federation/rsbuild-plugin";

export default createModuleFederationConfig({
  name: "divebell_e2e_provider",
  exposes: {
    "./Widget": "./src/widget.ts"
  },
  dts: false,
  shareStrategy: "loaded-first"
});
