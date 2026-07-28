import assert from "node:assert/strict";
import { test } from "@rstest/core";
import { createDivebell } from "@divebell/core";

import {
  markDivebellReady,
  markDivebellReadyError,
  registerDivebellReady,
  unregisterDivebellReady
} from "../../dist/index.js";

test("registers and marks a business ready target", () => {
  const runtime = createDivebell();

  const targetId = registerDivebellReady({
    runtime,
    id: "checkout",
    label: "Checkout ready",
    data: {
      step: "cart"
    }
  });
  assert.equal(targetId, "business:ready:checkout");
  assert.equal(runtime.getSnapshot().targets[targetId]?.status, "pending");

  markDivebellReady(runtime, "checkout", {
    step: "payment"
  });
  assert.equal(runtime.getSnapshot().targets[targetId]?.status, "ready");

  registerDivebellReady({
    runtime,
    id: "checkout"
  });
  assert.equal(runtime.getSnapshot().targets[targetId]?.status, "ready");

  markDivebellReadyError(runtime, "checkout failed", "checkout");
  assert.equal(runtime.getSnapshot().targets[targetId]?.status, "error");
  assert.equal(runtime.getSnapshot().targets[targetId]?.error?.message, "checkout failed");

  unregisterDivebellReady(runtime, "checkout");
  assert.equal(runtime.getTargets({ id: targetId }).length, 0);
  assert.equal(runtime.getSnapshot().targets[targetId], undefined);
});
