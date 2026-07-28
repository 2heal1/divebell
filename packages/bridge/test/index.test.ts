import assert from "node:assert/strict";
import { test } from "@rstest/core";

import { bridgePackageInfo } from "../dist/index.js";

test("exposes the bridge package marker", () => {
  assert.deepEqual(bridgePackageInfo, {
    name: "@divebell/bridge",
    phase: "phase-0",
    role: "page bridge"
  });
});
