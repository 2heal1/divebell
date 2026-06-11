import assert from "node:assert/strict";
import { test } from "@rstest/core";
import { createOpenRuntime } from "@openruntime/core";

import { openRuntimeModernPlugin } from "../../dist/index.js";
import { createModernApiHarness } from "../helpers/modern-api.js";

test("stores current route matches in the aggregate route snapshot", () => {
  const runtime = createOpenRuntime();
  const { handlers } = createModernApiHarness(openRuntimeModernPlugin({ runtime }));
  const routes = [
    {
      id: "root",
      path: "/",
      Component: true
    }
  ];

  handlers.onRouterCreated?.({
    router: {
      state: {
        navigation: { state: "idle" },
        matches: [{ route: { id: "root" }, pathname: "/" }],
        location: { pathname: "/" }
      }
    },
    routes,
    basename: "",
    context: {}
  });

  const snapshot = runtime.getSnapshot();
  assert.equal(snapshot.targets["modern:app"]?.status, "ready");
  assert.equal(snapshot.targets["modern:route"]?.status, "ready");
  assert.deepEqual(snapshot.targets["modern:route"]?.data, {
    pathname: "/",
    navigation: "idle",
    matches: [
      {
        routeId: "/",
        hasLazyModule: false,
        path: "/",
        pathname: "/",
        modernRouteId: "root"
      }
    ],
    errorRouteIds: []
  });
});

test("dedupes repeated current route matches", () => {
  const runtime = createOpenRuntime();
  const { handlers } = createModernApiHarness(openRuntimeModernPlugin({ runtime }));
  const routes = [
    {
      id: "page",
      path: "/",
      Component: true
    }
  ];

  handlers.onRouterCreated?.({
    router: {
      state: {
        navigation: { state: "idle" },
        matches: [
          { route: { id: "page" }, pathname: "/" },
          { route: { id: "page" }, pathname: "/" }
        ],
        location: { pathname: "/" }
      }
    },
    routes,
    basename: "",
    context: {}
  });

  const target = runtime.getSnapshot().targets["modern:route"];
  assert.deepEqual((target?.data as { matches?: Array<{ routeId: string }> } | undefined)?.matches, [
    {
      routeId: "/",
      hasLazyModule: false,
      path: "/",
      pathname: "/",
      modernRouteId: "page"
    }
  ]);
});

test("marks aggregate route loading during navigation and error on router errors", () => {
  const runtime = createOpenRuntime();
  const { handlers } = createModernApiHarness(openRuntimeModernPlugin({ runtime }));
  const routes = [
    {
      id: "settings",
      path: "/settings",
      Component: true
    }
  ];

  handlers.onRouterStateChange?.({
    router: {},
    routes,
    state: {
      navigation: { state: "loading", location: { pathname: "/settings" } },
      matches: [{ route: { id: "settings" }, pathname: "/settings" }],
      location: { pathname: "/" }
    },
    context: {}
  });
  assert.equal(runtime.getSnapshot().targets["modern:route"]?.status, "loading");

  handlers.onRouterStateChange?.({
    router: {},
    routes,
    state: {
      navigation: { state: "idle" },
      matches: [{ route: { id: "settings" }, pathname: "/settings" }],
      location: { pathname: "/settings" },
      errors: {
        settings: new Error("route failed")
      }
    },
    context: {}
  });

  const target = runtime.getSnapshot().targets["modern:route"];
  assert.equal(target?.status, "error");
  assert.equal(target?.error?.message, "route failed");
  assert.deepEqual((target?.data as { errorRouteIds?: string[] } | undefined)?.errorRouteIds, ["/settings"]);
  assert.equal(runtime.getSnapshot().targets["modern:app"]?.status, "error");
  assert.deepEqual(runtime.getSnapshot().targets["modern:app"]?.data, {
    failedTargetId: "modern:route",
    failedStatus: "error",
    reason: "route-error",
    pathname: "/settings",
    errorRouteIds: ["/settings"]
  });
  assert.equal(runtime.getSnapshot().targets["modern:app"]?.error, undefined);
});

test("marks SSR as errored when the initial route state has loader errors", () => {
  const runtime = createOpenRuntime();
  const host = {
    __OPEN_RUNTIME__: runtime,
    _SSR_DATA: {
      renderMode: "stream"
    }
  };
  const { handlers } = createModernApiHarness(openRuntimeModernPlugin({ runtime, host }));
  const routes = [
    {
      id: "details",
      path: "/details",
      loader: (_args: unknown) => undefined,
      Component: true
    }
  ];

  handlers.onBeforeRender?.({ routes });
  handlers.onHydration?.({
    type: "success",
    renderMode: "stream",
    renderLevel: 2
  });
  handlers.onRouterCreated?.({
    router: {
      state: {
        navigation: { state: "idle" },
        matches: [{ route: { id: "details" }, pathname: "/details" }],
        location: { pathname: "/details" },
        errors: {
          details: new Error("loader failed")
        }
      }
    },
    routes,
    basename: "",
    context: {}
  });
  handlers.onHydration?.({
    type: "success",
    renderMode: "stream",
    renderLevel: 2
  });

  const snapshot = runtime.getSnapshot();
  assert.equal(snapshot.targets["modern:route"]?.status, "error");
  assert.equal(snapshot.targets["modern:route"]?.error?.message, "loader failed");
  assert.equal(snapshot.targets["modern:app"]?.status, "error");
  assert.equal(snapshot.targets["modern:app"]?.error, undefined);
  assert.deepEqual(snapshot.targets["modern:app"]?.data, {
    failedTargetId: "modern:route",
    failedStatus: "error",
    reason: "route-loader-error",
    pathname: "/details",
    errorRouteIds: ["/details"]
  });
  assert.equal(snapshot.targets["modern:ssr"]?.status, "error");
  assert.equal(snapshot.targets["modern:ssr"]?.error, undefined);
  assert.deepEqual(snapshot.targets["modern:ssr"]?.data, {
    environment: "browser",
    phase: "server-render",
    reason: "route-loader-error",
    failedTargetId: "modern:route",
    failedStatus: "error",
    pathname: "/details",
    errorRouteIds: ["/details"]
  });
  assert.equal(snapshot.targets["modern:hydration"], undefined);
});
