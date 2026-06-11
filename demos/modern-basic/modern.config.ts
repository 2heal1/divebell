import { appTools, defineConfig } from "@modern-js/app-tools";

export default defineConfig({
  plugins: [appTools()],
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
