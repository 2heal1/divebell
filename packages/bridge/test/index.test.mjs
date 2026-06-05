import assert from "node:assert/strict";
import test from "node:test";

import { bridgePackageInfo } from "../dist/index.js";

test("exposes the bridge package marker", () => {
  assert.deepEqual(bridgePackageInfo, {
    name: "@openruntime/bridge",
    phase: "phase-0",
    role: "page bridge"
  });
});

