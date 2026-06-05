import assert from "node:assert/strict";
import test from "node:test";

import { modernPluginPackageInfo } from "../dist/index.js";

test("exposes the Modern.js plugin package marker", () => {
  assert.deepEqual(modernPluginPackageInfo, {
    name: "@openruntime/modern-plugin",
    phase: "phase-0",
    role: "modern.js plugin"
  });
});

