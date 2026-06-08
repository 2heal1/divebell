import assert from "node:assert/strict";
import { test } from "@rstest/core";

import { OPEN_RUNTIME_PHASE, createPackageInfo } from "../../dist/index.js";

test("keeps the package metadata marker for dependent packages", () => {
  assert.equal(OPEN_RUNTIME_PHASE, "phase-0");
  assert.deepEqual(createPackageInfo("@openruntime/core", "runtime center"), {
    name: "@openruntime/core",
    phase: "phase-0",
    role: "runtime center"
  });
});

