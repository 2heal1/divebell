import assert from "node:assert/strict";
import { test } from "@rstest/core";
import { createDivebell } from "@divebell/core";

import {
  createModernPlugin,
  divebellModernPlugin
} from "../../dist/index.js";
import { createModernApiHarness } from "../helpers/modern-api.js";

test("keeps the existing Divebell plugin identity and source by default", () => {
  const runtime = createDivebell();
  const plugin = divebellModernPlugin({ runtime });

  assert.equal(plugin.name, "@divebell/modern-plugin");
  createModernApiHarness(plugin);
  assert.deepEqual(
    runtime.getTargets().map(({ id, source }) => ({ id, source })),
    [
      { id: "modern:app", source: "modern.js" },
      { id: "modern:route", source: "modern.js" }
    ]
  );
});

test("creates a branded plugin factory with a matching Runtime source", () => {
  const edenxModernPlugin = createModernPlugin({
    name: "@edenx/divebell-plugin",
    source: "edenx"
  });
  const runtime = createDivebell();
  const plugin = edenxModernPlugin({
    runtime,
    injectRouteListAction: true
  });

  assert.equal(plugin.name, "@edenx/divebell-plugin");
  const { handlers } = createModernApiHarness(plugin);
  handlers.onBeforeRender?.({
    routes: [{
      id: "root",
      path: "/",
      Component: true
    }]
  });

  assert.ok(
    runtime.getTargets().every((target) => target.source === "edenx")
  );
  const events = runtime.getEvents().events;
  assert.ok(events.length > 0);
  assert.ok(
    events.every((event) => event.source === "edenx")
  );
  assert.equal(
    runtime.getActions().find((action) => action.name === "modern.route.list")?.source,
    "edenx"
  );
});

test("allows an app to override the configured default source", () => {
  const brandedModernPlugin = createModernPlugin({
    name: "@example/modern-plugin",
    source: "distribution"
  });
  const runtime = createDivebell();

  createModernApiHarness(brandedModernPlugin({
    runtime,
    source: "application"
  }));

  assert.ok(
    runtime.getTargets().every((target) => target.source === "application")
  );
});
