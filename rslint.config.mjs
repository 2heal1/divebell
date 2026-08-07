import { defineConfig, globalIgnores, js } from "@rslint/core";
import globals from "globals";

export default defineConfig([
  globalIgnores([
    "packages/extensions/mf/assets/install-runtime-debug.js",
    "packages/extensions/mf/assets/observability-chrome-devtool.iife.js",
  ]),
  js.configs.recommended,
  {
    files: ["packages/**/*.{js,mjs,cjs}", "scripts/**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
]);
