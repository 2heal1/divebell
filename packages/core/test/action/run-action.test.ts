import assert from "node:assert/strict";
import { test } from "@rstest/core";

import { createDivebell } from "../../dist/index.js";
import { createClock, registerRoute } from "../helpers/runtime.ts";

test("runs actions and records started and success events", async () => {
  const runtime = createDivebell({ clock: createClock() });

  registerRoute(runtime);
  runtime.updateSnapshot({ id: "route:/home", status: "ready" });
  runtime.registerAction({
    name: "route.submit",
    source: "modern-js",
    risk: "safe",
    availableWhen: { id: "route:/home", status: "ready" },
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "string" }
      },
      required: ["value"],
      additionalProperties: false
    },
    handler: (payload) => ({ ok: true, payload })
  });

  const result = await runtime.runAction("route.submit", { value: "hello" });

  assert.deepEqual(result, {
    success: true,
    actionName: "route.submit",
    result: {
      ok: true,
      payload: { value: "hello" }
    }
  });
  assert.equal(runtime.getSnapshot().targets["route:/home"]?.status, "ready");
  assert.deepEqual(
    runtime.getEvents({ type: ["action.started", "action.success"] }).events.map((event) => ({
      type: event.type,
      actionName: event.actionName,
      source: event.source,
      payload: event.payload
    })),
    [
      {
        type: "action.started",
        actionName: "route.submit",
        source: "modern-js",
        payload: { value: "hello" }
      },
      {
        type: "action.success",
        actionName: "route.submit",
        source: "modern-js",
        payload: { ok: true, payload: { value: "hello" } }
      }
    ]
  );
});

test("records handler errors as action error events", async () => {
  const runtime = createDivebell({ clock: createClock() });

  runtime.registerAction({
    name: "danger.fail",
    source: "business",
    handler: () => {
      throw new Error("handler failed");
    }
  });

  const result = await runtime.runAction("danger.fail");

  assert.equal(result.success, false);
  assert.deepEqual(
    runtime.getEvents({ type: ["action.started", "action.error"] }).events.map((event) => ({
      type: event.type,
      actionName: event.actionName,
      source: event.source,
      errorMessage: event.error?.message
    })),
    [
      {
        type: "action.started",
        actionName: "danger.fail",
        source: "business",
        errorMessage: undefined
      },
      {
        type: "action.error",
        actionName: "danger.fail",
        source: "business",
        errorMessage: "handler failed"
      }
    ]
  );
});

test("rejects unavailable or invalid actions without calling handlers", async () => {
  const runtime = createDivebell({ clock: createClock() });
  let called = false;

  registerRoute(runtime);
  runtime.registerAction({
    name: "route.submit",
    availableWhen: { id: "route:/home", status: "ready" },
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "string" }
      },
      required: ["value"],
      additionalProperties: false
    },
    handler: () => {
      called = true;
    }
  });

  const unavailable = await runtime.runAction("route.submit", { value: "hello" });
  runtime.updateSnapshot({ id: "route:/home", status: "ready" });
  const invalid = await runtime.runAction("route.submit", { value: 1 });

  assert.equal(called, false);
  assert.deepEqual(unavailable.error, {
    message: "Waiting for route:/home to reach ready.",
    code: "action_not_available"
  });
  assert.deepEqual(invalid.error, {
    message: "payload.value must be a string",
    code: "action_payload_invalid"
  });
  assert.deepEqual(
    runtime.getEvents({ type: "action.error" }).events.map((event) => event.error?.code),
    ["action_not_available", "action_payload_invalid"]
  );
});

