import assert from "node:assert/strict";
import test from "node:test";

import { OPEN_RUNTIME_PHASE, createPackageInfo } from "../dist/index.js";

test("exposes the phase 0 core package marker", () => {
  assert.equal(OPEN_RUNTIME_PHASE, "phase-0");
  assert.deepEqual(createPackageInfo("@openruntime/core", "runtime center"), {
    name: "@openruntime/core",
    phase: "phase-0",
    role: "runtime center"
  });
});

