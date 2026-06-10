import assert from "node:assert/strict";
import { test } from "@rstest/core";
import { createOpenRuntime, type OpenRuntimeWindowHost } from "@openruntime/core";

import { openRuntimeModernPlugin } from "../../dist/index.js";
import { createModernApiHarness } from "../helpers/modern-api.js";

test("updates hydration status from Modern.js hydration lifecycle events", () => {
  const runtime = createOpenRuntime();
  const { handlers } = createModernApiHarness(openRuntimeModernPlugin({ runtime }));

  handlers.onBeforeRender?.({});
  handlers.onHydration?.({
    type: "start",
    renderMode: "string",
    renderLevel: "client"
  });
  assert.equal(runtime.getSnapshot().targets["modern:hydration"]?.status, "running");

  handlers.onHydration?.({
    type: "success",
    renderMode: "string",
    renderLevel: "client"
  });
  assert.equal(runtime.getSnapshot().targets["modern:hydration"]?.status, "success");
});

test("marks hydration, SSR, and app as failed when hydration errors", () => {
  const runtime = createOpenRuntime();
  const host = {
    __OPEN_RUNTIME__: runtime,
    _SSR_DATA: {
      renderMode: "string"
    }
  } satisfies OpenRuntimeWindowHost & { _SSR_DATA: { renderMode: string } };
  const { handlers } = createModernApiHarness(openRuntimeModernPlugin({
    runtime,
    host
  }));

  handlers.onBeforeRender?.({});
  handlers.onHydration?.({
    type: "error",
    renderMode: "string",
    renderLevel: "client",
    error: new Error("hydrate failed")
  });

  const snapshot = runtime.getSnapshot();
  assert.equal(snapshot.targets["modern:hydration"]?.status, "error");
  assert.equal(snapshot.targets["modern:ssr"]?.status, "error");
  assert.equal(snapshot.targets["modern:app"]?.status, "error");
  assert.equal(snapshot.targets["modern:hydration"]?.error?.message, "hydrate failed");
});
