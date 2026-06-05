import assert from "node:assert/strict";
import test from "node:test";

import { cliPackageInfo, getCliCommandName } from "../dist/index.js";

test("exposes the cli package marker", () => {
  assert.equal(getCliCommandName(), "openruntime");
  assert.deepEqual(cliPackageInfo, {
    name: "@openruntime/cli",
    phase: "phase-0",
    role: "agent command line"
  });
});

