import assert from "node:assert/strict";
import { test } from "@rstest/core";

import { createOpenRuntime } from "../../dist/index.js";
import { createClock, registerRoute } from "../helpers/runtime.ts";

test("updates snapshot and records accepted snapshot events", () => {
  const runtime = createOpenRuntime({ clock: createClock() });

  registerRoute(runtime);
  runtime.updateSnapshot({
    id: "route:/home",
    status: "blocked",
    dependsOn: ["loader:/home"],
    data: { path: "/home" }
  });

  assert.deepEqual(runtime.getSnapshot().targets, {
    "route:/home": {
      id: "route:/home",
      type: "modern.route",
      status: "blocked",
      source: "modern-js",
      description: "Home page route",
      data: { path: "/home" },
      updatedAt: 1002,
      dependsOn: ["loader:/home"]
    }
  });

  assert.deepEqual(runtime.getEvents(), {
    latestEventId: 1,
    truncated: false,
    events: [
      {
        id: 1,
        type: "snapshot.updated",
        source: "modern-js",
        timestamp: 1003,
        targetId: "route:/home",
        status: "blocked",
        payload: {
          id: "route:/home",
          type: "modern.route",
          source: "modern-js",
          status: "blocked",
          data: { path: "/home" },
          dependsOn: ["loader:/home"]
        }
      }
    ]
  });
});

test("rejects updates for unregistered targets without changing snapshot", () => {
  const runtime = createOpenRuntime({ clock: createClock() });

  runtime.updateSnapshot({
    id: "route:/missing",
    status: "ready",
    source: "modern-js"
  });

  assert.deepEqual(runtime.getSnapshot().targets, {});
  assert.deepEqual(runtime.getEvents().events, [
    {
      id: 1,
      type: "snapshot.update.rejected",
      source: "modern-js",
      timestamp: 1001,
      targetId: "route:/missing",
      status: "ready",
      payload: {
        id: "route:/missing",
        status: "ready",
        source: "modern-js"
      },
      error: {
        message: 'Cannot update unregistered target "route:/missing".',
        code: "target_not_registered"
      }
    }
  ]);
});

test("rejects undeclared statuses and mismatched target types", () => {
  const runtime = createOpenRuntime({ clock: createClock() });

  registerRoute(runtime);
  runtime.updateSnapshot({ id: "route:/home", status: "ready" });
  runtime.updateSnapshot({ id: "route:/home", status: "success" });
  runtime.updateSnapshot({
    id: "route:/home",
    type: "mf.remote",
    status: "loading"
  });

  assert.equal(runtime.getSnapshot().targets["route:/home"]?.status, "ready");

  const events = runtime.getEvents().events;
  assert.equal(events.length, 3);
  assert.equal(events[0]?.type, "snapshot.updated");
  assert.deepEqual(events[1]?.error, {
    message: 'Status "success" is not declared for target "route:/home".',
    code: "target_status_not_declared"
  });
  assert.deepEqual(events[2]?.error, {
    message: 'Snapshot type "mf.remote" does not match registered target type "modern.route".',
    code: "target_type_mismatch"
  });
});

