import assert from "node:assert/strict";
import { test } from "@rstest/core";

import { createDivebell } from "../../dist/index.js";
import { createClock, registerRoute } from "../helpers/runtime.ts";

test("filters targets, snapshots and events", () => {
  const runtime = createDivebell({ clock: createClock() });

  registerRoute(runtime);
  runtime.registerTarget({
    id: "loader:/home",
    type: "modern.loader",
    source: "modern-js",
    description: "Home loader",
    statuses: ["loading", "ready", "error"]
  });
  runtime.updateSnapshot({ id: "route:/home", status: "ready" });
  runtime.updateSnapshot({ id: "loader:/home", status: "loading" });
  runtime.updateSnapshot({
    id: "loader:/home",
    status: "error",
    data: { library: "react" },
    error: { message: "React shared dependency failed" }
  });

  assert.deepEqual(
    runtime.getTargets({ query: "loader" }).map((target) => target.id),
    ["loader:/home"]
  );
  assert.deepEqual(Object.keys(runtime.getSnapshot({ status: "ready" }).targets), [
    "route:/home"
  ]);
  assert.deepEqual(
    runtime.getEvents({ since: 1, targetId: "loader:/home" }).events.map((event) => event.id),
    [2, 3]
  );
  assert.deepEqual(
    runtime.getEvents({ query: "React" }).events.map((event) => event.id),
    [3]
  );
});
