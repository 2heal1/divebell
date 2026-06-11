import { appTools, defineConfig } from "@modern-js/app-tools";

export default defineConfig({
  plugins: [appTools()],
  output: {
    polyfill: "off",
    disableTsChecker: true,
    minify: false
  },
  server: {
    port: 19083,
    ssr: {
      mode: "stream"
    }
  },
  performance: {
    buildCache: false
  }
});
