import { appTools, defineConfig } from "@modern-js/app-tools";
import { openRuntimeChunkMapPlugin } from "@openruntime/modern-plugin/chunk-map";

export default defineConfig({
  plugins: [appTools(), openRuntimeChunkMapPlugin()],
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
