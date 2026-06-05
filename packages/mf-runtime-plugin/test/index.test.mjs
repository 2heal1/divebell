import assert from "node:assert/strict";
import test from "node:test";

import { mfRuntimePluginPackageInfo } from "../dist/index.js";

test("exposes the Module Federation runtime plugin package marker", () => {
  assert.deepEqual(mfRuntimePluginPackageInfo, {
    name: "@openruntime/mf-runtime-plugin",
    phase: "phase-0",
    role: "module federation runtime plugin"
  });
});
