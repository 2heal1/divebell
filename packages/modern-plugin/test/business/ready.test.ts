import assert from "node:assert/strict";
import { test } from "@rstest/core";
import { createOpenRuntime } from "@openruntime/core";

import {
  markOpenRuntimeReady,
  markOpenRuntimeReadyError,
  registerOpenRuntimeReady,
  unregisterOpenRuntimeReady
} from "../../dist/index.js";

test("registers and marks a business ready target", () => {
  const runtime = createOpenRuntime();

  const targetId = registerOpenRuntimeReady({
    runtime,
    id: "checkout",
    label: "Checkout ready",
    data: {
      step: "cart"
    }
  });
  assert.equal(targetId, "business:ready:checkout");
  assert.equal(runtime.getSnapshot().targets[targetId]?.status, "pending");

  markOpenRuntimeReady(runtime, "checkout", {
    step: "payment"
  });
  assert.equal(runtime.getSnapshot().targets[targetId]?.status, "ready");

  registerOpenRuntimeReady({
    runtime,
    id: "checkout"
  });
  assert.equal(runtime.getSnapshot().targets[targetId]?.status, "ready");

  markOpenRuntimeReadyError(runtime, "checkout failed", "checkout");
  assert.equal(runtime.getSnapshot().targets[targetId]?.status, "error");
  assert.equal(runtime.getSnapshot().targets[targetId]?.error?.message, "checkout failed");

  unregisterOpenRuntimeReady(runtime, "checkout");
  assert.equal(runtime.getTargets({ id: targetId }).length, 0);
  assert.equal(runtime.getSnapshot().targets[targetId], undefined);
});
