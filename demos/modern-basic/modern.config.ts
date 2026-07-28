import { appTools, defineConfig } from "@modern-js/app-tools";
import { divebellChunkMapPlugin } from "@divebell/modern-plugin/chunk-map";

export default defineConfig({
  plugins: [appTools(), divebellChunkMapPlugin()],
  output: {
    polyfill: "off",
    disableTsChecker: true,
    minify: false
  },
  server: {
    port: 19081,
    ssr: false
  },
  performance: {
    buildCache: false
  }
});
