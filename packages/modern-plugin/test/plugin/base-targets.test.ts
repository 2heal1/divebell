import assert from "node:assert/strict";
import { test } from "@rstest/core";
import { createOpenRuntime } from "@openruntime/core";

import { openRuntimeModernPlugin } from "../../dist/index.js";
import { createModernApiHarness } from "../helpers/modern-api.js";

test("registers Modern.js app, SSR, and aggregate route targets", () => {
  const runtime = createOpenRuntime();
  const host = {
    __OPEN_RUNTIME__: runtime,
    _SSR_DATA: {
      renderMode: "string"
    }
  };
  const { handlers } = createModernApiHarness(openRuntimeModernPlugin({ runtime, host }));

  handlers.onBeforeRender?.({
    routes: [
      {
        id: "root",
        path: "/",
        loader: (_args: unknown) => undefined,
        Component: true,
        children: [
          {
            id: "settings",
            path: "settings",
            Component: true
          }
        ]
      }
    ]
  });

  const targets = runtime.getTargets();
  assert.ok(targets.find((target) => target.id === "modern:app"));
  assert.ok(targets.find((target) => target.id === "modern:ssr"));
  assert.equal(targets.find((target) => target.id === "modern:hydration"), undefined);
  assert.equal(targets.find((target) => target.id === "modern:loader:/"), undefined);
  assert.equal(targets.find((target) => target.id === "modern:component:/"), undefined);

  const routeTarget = targets.find((target) => target.id === "modern:route");
  assert.ok(routeTarget);
  assert.deepEqual(routeTarget.data, {
    routes: [
      {
        routeId: "/",
        hasLoader: true,
        hasComponent: true,
        hasLazyModule: false,
        path: "/",
        pathname: "/",
        modernRouteId: "root"
      },
      {
        routeId: "/settings",
        hasLoader: false,
        hasComponent: true,
        hasLazyModule: false,
        path: "settings",
        pathname: "/settings",
        modernRouteId: "settings",
        parentRouteId: "/"
      }
    ]
  });

  const snapshot = runtime.getSnapshot();
  assert.equal(snapshot.targets["modern:app"]?.status, "rendering");
  assert.equal(snapshot.targets["modern:ssr"]?.status, "server-rendered");
  assert.equal(snapshot.targets["modern:route"], undefined);
});

test("does not register an SSR target for client-rendered pages", () => {
  const runtime = createOpenRuntime();
  const { handlers } = createModernApiHarness(openRuntimeModernPlugin({ runtime }));

  handlers.onBeforeRender?.({
    routes: [
      {
        id: "root",
        path: "/",
        Component: true
      }
    ]
  });

  assert.equal(runtime.getTargets({ id: "modern:ssr" }).length, 0);
  assert.equal(runtime.getTargets({ id: "modern:hydration" }).length, 0);
  assert.equal(runtime.getSnapshot().targets["modern:ssr"], undefined);
  assert.equal(runtime.getSnapshot().targets["modern:hydration"], undefined);
});

test("does not treat Modern.js lazy import loader as a data loader", () => {
  const runtime = createOpenRuntime();
  const { handlers } = createModernApiHarness(openRuntimeModernPlugin({ runtime }));

  handlers.onBeforeRender?.({
    routes: [
      {
        id: "page",
        path: "/",
        loader: () => null,
        Component: true
      }
    ]
  });

  const routeTarget = runtime.getTargets({ id: "modern:route" })[0];
  assert.deepEqual(routeTarget?.data, {
    routes: [
      {
        routeId: "/",
        hasLoader: false,
        hasComponent: true,
        hasLazyModule: false,
        path: "/",
        pathname: "/",
        modernRouteId: "page"
      }
    ]
  });
});
