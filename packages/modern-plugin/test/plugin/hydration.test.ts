import assert from "node:assert/strict";
import { test } from "@rstest/core";
import { createDivebell, type DivebellWindowHost } from "@divebell/core";

import { divebellModernPlugin } from "../../dist/index.js";
import { createModernApiHarness } from "../helpers/modern-api.js";

test("updates hydration status from Modern.js hydration lifecycle events", () => {
  const runtime = createDivebell();
  const { handlers } = createModernApiHarness(divebellModernPlugin({ runtime }));

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

test("keeps hydration error details on hydration target when hydration errors", () => {
  const runtime = createDivebell();
  const host = {
    __DIVEBELL__: runtime,
    _SSR_DATA: {
      renderMode: "string"
    }
  } satisfies DivebellWindowHost & { _SSR_DATA: { renderMode: string } };
  const { handlers } = createModernApiHarness(divebellModernPlugin({
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
  assert.equal(snapshot.targets["modern:ssr"]?.status, "invalidated");
  assert.equal(snapshot.targets["modern:app"]?.status, "error");
  assert.equal(snapshot.targets["modern:hydration"]?.error?.message, "hydrate failed");
  assert.equal(snapshot.targets["modern:ssr"]?.error, undefined);
  assert.equal(snapshot.targets["modern:app"]?.error, undefined);
  assert.deepEqual(snapshot.targets["modern:ssr"]?.data, {
    environment: "browser",
    type: "error",
    renderLevel: "client",
    renderMode: "string",
    invalidatedBy: "modern:hydration",
    hydrationStatus: "error"
  });
  assert.deepEqual(snapshot.targets["modern:app"]?.data, {
    failedTargetId: "modern:hydration",
    failedStatus: "error",
    hydrationEventType: "error"
  });
});

test("keeps hydration failed after a recoverable hydration error", () => {
  const runtime = createDivebell();
  const { handlers } = createModernApiHarness(divebellModernPlugin({ runtime }));

  handlers.onHydration?.({
    type: "recoverable-error",
    renderMode: "stream",
    renderLevel: 2,
    reason: "recoverable-hydration-error",
    error: new Error("hydration mismatch")
  });
  handlers.onHydration?.({
    type: "success",
    renderMode: "stream",
    renderLevel: 2
  });

  const snapshot = runtime.getSnapshot();
  assert.equal(snapshot.targets["modern:hydration"]?.status, "error");
  assert.equal(snapshot.targets["modern:ssr"]?.status, "invalidated");
  assert.equal(snapshot.targets["modern:app"]?.status, "error");
  assert.equal(snapshot.targets["modern:hydration"]?.error?.message, "hydration mismatch");
  assert.equal(snapshot.targets["modern:ssr"]?.error, undefined);
  assert.equal(snapshot.targets["modern:app"]?.error, undefined);
  assert.deepEqual(snapshot.targets["modern:ssr"]?.data, {
    environment: "browser",
    type: "recoverable-error",
    renderLevel: 2,
    renderMode: "stream",
    reason: "recoverable-hydration-error",
    invalidatedBy: "modern:hydration",
    hydrationStatus: "error"
  });
  assert.deepEqual(snapshot.targets["modern:app"]?.data, {
    failedTargetId: "modern:hydration",
    failedStatus: "error",
    hydrationEventType: "recoverable-error",
    reason: "recoverable-hydration-error"
  });
});

test("marks SSR as fallback when Modern.js downgrades to client render", () => {
  const runtime = createDivebell();
  const { handlers } = createModernApiHarness(divebellModernPlugin({ runtime }));

  handlers.onHydration?.({
    type: "fallback",
    renderMode: "stream",
    renderLevel: 0,
    reason: "client-render"
  });

  const snapshot = runtime.getSnapshot();
  assert.equal(snapshot.targets["modern:hydration"]?.status, "fallback");
  assert.equal(snapshot.targets["modern:ssr"]?.status, "fallback");
  assert.deepEqual(snapshot.targets["modern:ssr"]?.data, {
    environment: "browser",
    type: "fallback",
    renderLevel: 0,
    renderMode: "stream",
    reason: "client-render"
  });
});
