import assert from "node:assert/strict";
import { test } from "@rstest/core";

import { createOpenRuntime } from "../../dist/index.js";
import { createClock, registerRoute } from "../helpers/runtime.ts";

test("waits for target status changes", async () => {
  const runtime = createOpenRuntime({ clock: createClock() });

  registerRoute(runtime);
  const wait = runtime.waitFor({ id: "route:/home", status: "ready" }, { timeout: 100 });
  runtime.updateSnapshot({ id: "route:/home", status: "loading" });
  runtime.updateSnapshot({ id: "route:/home", status: "ready" });

  const result = await wait;
  assert.equal(result.success, true);
  assert.equal(result.target?.status, "ready");
});

test("waits for target status and data conditions", async () => {
  const runtime = createOpenRuntime({ clock: createClock() });

  runtime.registerTarget({
    id: "modern:route",
    type: "modern.route",
    source: "modern-js",
    statuses: ["loading", "ready", "error"]
  });

  const wait = runtime.waitFor({
    id: "modern:route",
    status: "ready",
    where: [
      {
        path: "matches.pathname",
        equals: "/orders"
      }
    ]
  }, { timeout: 100 });

  runtime.updateSnapshot({
    id: "modern:route",
    status: "ready",
    data: {
      pathname: "/settings",
      matches: [{ pathname: "/settings" }]
    }
  });
  runtime.updateSnapshot({
    id: "modern:route",
    status: "ready",
    data: {
      pathname: "/orders",
      matches: [{ pathname: "/" }, { pathname: "/orders" }]
    }
  });

  const result = await wait;
  assert.equal(result.success, true);
  assert.equal((result.target?.data as { pathname?: string } | undefined)?.pathname, "/orders");
});

test("returns wait failures for unknown, unregistered and timed out targets", async () => {
  const runtime = createOpenRuntime({ clock: createClock() });

  const unknown = await runtime.waitFor({ id: "route:/missing", status: "ready" });
  assert.deepEqual(
    { success: unknown.success, reason: unknown.reason },
    { success: false, reason: "Target is not registered." }
  );

  registerRoute(runtime);
  const unregisteredWait = runtime.waitFor(
    { id: "route:/home", status: "ready" },
    { timeout: 100 }
  );
  runtime.unregisterTarget("route:/home");
  const unregistered = await unregisteredWait;
  assert.deepEqual(
    { success: unregistered.success, reason: unregistered.reason },
    { success: false, reason: "Target was unregistered." }
  );

  registerRoute(runtime);
  const timedOut = await runtime.waitFor({ id: "route:/home", status: "ready" }, { timeout: 1 });
  assert.deepEqual(
    { success: timedOut.success, reason: timedOut.reason },
    { success: false, reason: "Timed out waiting for target status." }
  );
});
