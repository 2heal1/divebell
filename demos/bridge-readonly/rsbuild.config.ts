import { defineConfig } from "@rsbuild/core";

export default defineConfig({
  html: {
    template: "./index.html",
    title: "OpenRuntime Bridge Readonly Demo"
  },
  server: {
    port: 19080
  }
});
