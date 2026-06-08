import assert from "node:assert/strict";
import { test } from "@rstest/core";

import { createOpenRuntime } from "../../dist/index.js";
import { createClock, registerRoute } from "../helpers/runtime.ts";

test("registers actions and reports availability from current snapshot", () => {
  const runtime = createOpenRuntime({ clock: createClock() });

  registerRoute(runtime);
  runtime.registerAction({
    name: "route.submit",
    description: "Submit current route",
    availableWhen: { id: "route:/home", status: "ready" },
    handler: () => ({ submitted: true })
  });

  assert.deepEqual(runtime.getActions(), [
    {
      name: "route.submit",
      description: "Submit current route",
      source: "business",
      risk: "state-changing",
      availableWhen: { id: "route:/home", status: "ready" },
      hasInputOptions: false,
      enabled: false,
      reason: "Waiting for route:/home to reach ready.",
      registeredAt: 1002,
      updatedAt: 1002
    }
  ]);

  runtime.updateSnapshot({ id: "route:/home", status: "ready" });

  assert.equal(runtime.getActions()[0]?.enabled, true);
  assert.deepEqual(runtime.getActions({ query: "submit" }).map((action) => action.name), [
    "route.submit"
  ]);
});

