import assert from "node:assert/strict";
import { test } from "@rstest/core";

import { DIVEBELL_PHASE, createPackageInfo } from "../../dist/index.js";

test("keeps the package metadata marker for dependent packages", () => {
  assert.equal(DIVEBELL_PHASE, "phase-0");
  assert.deepEqual(createPackageInfo("@divebell/core", "runtime center"), {
    name: "@divebell/core",
    phase: "phase-0",
    role: "runtime center"
  });
});

