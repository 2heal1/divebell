import assert from "node:assert/strict";
import { test } from "@rstest/core";

import { createDivebell } from "../../dist/index.js";
import { createClock, registerRoute } from "../helpers/runtime.ts";

test("registers targets without adding them to the current snapshot", () => {
  const runtime = createDivebell({ clock: createClock() });

  registerRoute(runtime);

  assert.deepEqual(runtime.getTargets(), [
    {
      id: "route:/home",
      type: "modern.route",
      source: "modern-js",
      label: "Home route",
      description: "Home page route",
      statuses: ["loading", "ready", "blocked", "error"],
      registeredAt: 1001,
      updatedAt: 1001
    }
  ]);
  assert.deepEqual(runtime.getSnapshot().targets, {});
});

test("unregisters targets and removes their current snapshot entry", () => {
  const runtime = createDivebell({ clock: createClock() });

  registerRoute(runtime);
  runtime.updateSnapshot({ id: "route:/home", status: "ready" });
  runtime.unregisterTarget("route:/home");

  assert.deepEqual(runtime.getTargets(), []);
  assert.deepEqual(runtime.getSnapshot().targets, {});
});

