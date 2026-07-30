import { createModuleFederationConfig } from "@module-federation/rsbuild-plugin";

export default createModuleFederationConfig({
  name: "divebell_e2e_host",
  remotes: {
    provider: "divebell_e2e_provider@/provider/mf-manifest.json"
  },
  dts: false,
  shareStrategy: "loaded-first"
});
