import assert from "node:assert/strict";
import { test } from "@rstest/core";
import { createOpenRuntime } from "@openruntime/core";

import { openRuntimeModernPlugin } from "../../dist/index.js";
import { createModernApiHarness } from "../helpers/modern-api.js";

test("stores loader status on the current route match", () => {
  const runtime = createOpenRuntime();
  const { handlers } = createModernApiHarness(openRuntimeModernPlugin({ runtime }));
  const routes = [
    {
      id: "profile",
      path: "/profile",
      loader: (_args: unknown) => undefined
    }
  ];

  handlers.onRouterStateChange?.({
    router: {},
    routes,
    state: {
      navigation: { state: "idle" },
      matches: [{ route: { id: "profile" }, pathname: "/profile" }],
      location: { pathname: "/profile" }
    },
    context: {}
  });

  handlers.onRouteLoader?.({
    type: "start",
    routeId: "profile"
  });
  assert.equal(runtime.getSnapshot().targets["modern:route"]?.status, "loading");
  assert.equal(getFirstMatch(runtime).loader, "loading");

  handlers.onRouteLoader?.({
    type: "success",
    routeId: "profile",
    result: { name: "Ada" }
  });
  assert.equal(runtime.getSnapshot().targets["modern:route"]?.status, "ready");
  assert.equal(getFirstMatch(runtime).loader, "success");

  handlers.onRouteLoader?.({
    type: "redirect",
    routeId: "profile",
    response: {
      status: 302,
      statusText: "Found",
      url: "/login"
    }
  });
  assert.equal(runtime.getSnapshot().targets["modern:route"]?.status, "loading");
  assert.equal(getFirstMatch(runtime).loader, "redirect");

  handlers.onRouteLoader?.({
    type: "error",
    routeId: "profile",
    error: new Error("loader failed")
  });
  const snapshot = runtime.getSnapshot();
  assert.equal(snapshot.targets["modern:route"]?.status, "error");
  assert.equal(snapshot.targets["modern:route"]?.error?.message, "loader failed");
  assert.equal(snapshot.targets["modern:app"]?.status, "error");
  assert.deepEqual(snapshot.targets["modern:app"]?.data, {
    failedTargetId: "modern:route",
    failedStatus: "error",
    reason: "route-loader-error",
    pathname: "/profile",
    errorRouteIds: ["/profile"]
  });
  assert.equal(getFirstMatch(runtime).loader, "error");
});

test("marks matched data loaders as successful when no loader event is emitted", () => {
  const runtime = createOpenRuntime();
  const { handlers } = createModernApiHarness(openRuntimeModernPlugin({ runtime }));
  const routes = [
    {
      id: "profile",
      path: "/profile",
      loader: (_args: unknown) => undefined
    }
  ];

  handlers.onRouterStateChange?.({
    router: {},
    routes,
    state: {
      navigation: { state: "idle" },
      matches: [{ route: { id: "profile" }, pathname: "/profile" }],
      location: { pathname: "/profile" }
    },
    context: {}
  });

  const match = getFirstMatch(runtime);
  assert.equal(match.loader, "success");
  assert.equal(match.hasLoader, undefined);
  assert.equal(match.hasRouteComponent, undefined);
});

test("stores only route component errors on the current route match", () => {
  const runtime = createOpenRuntime();
  const { handlers } = createModernApiHarness(openRuntimeModernPlugin({ runtime }));
  const routes = [
    {
      id: "dashboard",
      path: "/dashboard",
      Component: true
    }
  ];

  handlers.onRouterStateChange?.({
    router: {},
    routes,
    state: {
      navigation: { state: "idle" },
      matches: [{ route: { id: "dashboard" }, pathname: "/dashboard" }],
      location: { pathname: "/dashboard" }
    },
    context: {}
  });
  assert.equal(runtime.getSnapshot().targets["modern:route"]?.status, "ready");
  assert.equal(getFirstMatch(runtime).routeComponent, undefined);

  handlers.onRouteComponent?.({
    type: "module-load",
    routeId: "dashboard",
    routeModule: {}
  });
  assert.equal(runtime.getSnapshot().targets["modern:route"]?.status, "ready");
  assert.equal(getFirstMatch(runtime).routeComponent, undefined);

  handlers.onRouteComponent?.({
    type: "mount",
    routeId: "dashboard"
  });
  assert.equal(runtime.getSnapshot().targets["modern:route"]?.status, "ready");
  assert.equal(getFirstMatch(runtime).routeComponent, undefined);

  handlers.onRouteComponent?.({
    type: "module-load-error",
    routeId: "dashboard",
    error: new Error("component failed")
  });
  const snapshot = runtime.getSnapshot();
  assert.equal(snapshot.targets["modern:route"]?.status, "error");
  assert.equal(snapshot.targets["modern:route"]?.error?.message, "component failed");
  assert.equal(snapshot.targets["modern:app"]?.status, "error");
  assert.deepEqual(snapshot.targets["modern:app"]?.data, {
    failedTargetId: "modern:route",
    failedStatus: "error",
    reason: "route-component-error",
    pathname: "/dashboard",
    errorRouteIds: ["/dashboard"]
  });
  assert.equal(getFirstMatch(runtime).routeComponent, "error");
});

test("stores route component render errors on the current route match", () => {
  const runtime = createOpenRuntime();
  const { handlers } = createModernApiHarness(openRuntimeModernPlugin({ runtime }));
  const routes = [
    {
      id: "dashboard",
      path: "/dashboard",
      Component: true
    }
  ];

  handlers.onRouterStateChange?.({
    router: {},
    routes,
    state: {
      navigation: { state: "idle" },
      matches: [{ route: { id: "dashboard" }, pathname: "/dashboard" }],
      location: { pathname: "/dashboard" }
    },
    context: {}
  });
  handlers.onRouteComponent?.({
    type: "render-error",
    routeId: "dashboard",
    error: new Error("render failed"),
    componentStack: "\n    at Dashboard"
  });

  const snapshot = runtime.getSnapshot();
  assert.equal(snapshot.targets["modern:route"]?.status, "error");
  assert.equal(snapshot.targets["modern:route"]?.error?.message, "render failed");
  assert.equal(snapshot.targets["modern:route"]?.error?.code, "modern_route_render_error");
  assert.deepEqual(snapshot.targets["modern:route"]?.error?.data, {
    componentStack: "\n    at Dashboard"
  });
  assert.equal(snapshot.targets["modern:app"]?.status, "error");
  assert.deepEqual(snapshot.targets["modern:app"]?.data, {
    failedTargetId: "modern:route",
    failedStatus: "error",
    reason: "route-component-error",
    pathname: "/dashboard",
    errorRouteIds: ["/dashboard"]
  });
  assert.equal(getFirstMatch(runtime).routeComponent, "error");
});

test("keeps route metadata when loader events arrive after the route table", () => {
  const runtime = createOpenRuntime();
  const { handlers } = createModernApiHarness(openRuntimeModernPlugin({ runtime }));

  handlers.onBeforeRender?.({
    routes: [
      {
        id: "profile",
        path: "/profile",
        loader: (_args: unknown) => undefined,
        Component: true
      }
    ]
  });
  handlers.onRouteLoader?.({
    type: "start",
    routeId: "profile"
  });

  const target = runtime.getTargets({ id: "modern:route" })[0];
  assert.deepEqual(target?.data, {
    routes: [
      {
        routeId: "/profile",
        hasLoader: true,
        hasRouteComponent: true,
        hasLazyModule: false,
        path: "/profile",
        pathname: "/profile",
        modernRouteId: "profile"
      }
    ]
  });
});

test("maps Modern.js internal route ids to readable route match ids", () => {
  const runtime = createOpenRuntime();
  const { handlers } = createModernApiHarness(openRuntimeModernPlugin({ runtime }));
  const routes = [
    {
      id: "1",
      path: "/orders",
      loader: (_args: unknown) => undefined,
      Component: true
    }
  ];

  handlers.onRouterStateChange?.({
    router: {},
    routes,
    state: {
      navigation: { state: "idle" },
      matches: [{ route: { id: "1" }, pathname: "/orders" }],
      location: { pathname: "/orders" }
    },
    context: {}
  });
  handlers.onRouteLoader?.({
    type: "start",
    routeId: "1"
  });
  handlers.onRouteLoader?.({
    type: "success",
    routeId: "1",
    result: { orders: [] }
  });

  const snapshot = runtime.getSnapshot();
  assert.equal(snapshot.targets["modern:loader:/orders"], undefined);
  assert.equal(snapshot.targets["modern:route:/orders"], undefined);
  assert.equal(getFirstMatch(runtime).routeId, "/orders");
  assert.equal(getFirstMatch(runtime).loader, "success");
});

function getFirstMatch(runtime: ReturnType<typeof createOpenRuntime>): Record<string, unknown> {
  const data = runtime.getSnapshot().targets["modern:route"]?.data as { matches?: Array<Record<string, unknown>> } | undefined;
  const match = data?.matches?.[0];
  assert.ok(match);
  return match;
}
