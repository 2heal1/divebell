import assert from "node:assert/strict";
import { test } from "@rstest/core";
import { createDivebell } from "@divebell/core";

import { divebellModernPlugin, type ModernDataRouter } from "../../dist/index.js";
import { createModernApiHarness } from "../helpers/modern-api.js";

const routeListActionName = "modern.route.list";
const routeNavigateActionName = "modern.route.navigate";

test("does not register route actions by default", () => {
  const runtime = createDivebell();
  createModernApiHarness(divebellModernPlugin({ runtime }));

  assert.equal(runtime.getActions({ name: routeListActionName }).length, 0);
  assert.equal(runtime.getActions({ name: routeNavigateActionName }).length, 0);
});

test("registers route list action when enabled", async () => {
  const runtime = createDivebell();
  const { handlers } = createModernApiHarness(divebellModernPlugin({
    runtime,
    injectRouteListAction: true
  }));

  handlers.onBeforeRender?.({
    routes: [
      {
        id: "root",
        path: "/",
        Component: true,
        children: [
          {
            id: "orders",
            path: "orders",
            loader: (_args: unknown) => undefined,
            Component: true
          }
        ]
      }
    ]
  });

  const action = runtime.getActions({ name: routeListActionName })[0];
  assert.ok(action);
  assert.equal(action.risk, "safe");
  assert.equal(action.source, "modern.js");

  const result = await runtime.runAction(routeListActionName);
  assert.equal(result.success, true);
  assert.deepEqual(result.result, {
    routeCount: 2,
    routes: [
      {
        routeId: "/",
        hasLoader: false,
        hasRouteComponent: true,
        hasLazyModule: false,
        path: "/",
        pathname: "/",
        modernRouteId: "root"
      },
      {
        routeId: "/orders",
        hasLoader: true,
        hasRouteComponent: true,
        hasLazyModule: false,
        path: "orders",
        pathname: "/orders",
        modernRouteId: "orders",
        parentRouteId: "/"
      }
    ]
  });
});

test("registers route navigate action when enabled", async () => {
  const runtime = createDivebell();
  const navigations: Array<{ to: string; options: { replace?: boolean } | undefined }> = [];
  const router: ModernDataRouter = {
    state: {
      navigation: { state: "idle" },
      matches: [{ route: { id: "root" }, pathname: "/" }],
      location: { pathname: "/" }
    },
    navigate(to, options) {
      navigations.push({ to, options });
      return { ok: true };
    }
  };
  const { handlers } = createModernApiHarness(divebellModernPlugin({
    runtime,
    injectRouteNavigateAction: true
  }));

  handlers.onRouterCreated?.({
    router,
    routes: [
      {
        id: "root",
        path: "/",
        Component: true,
        children: [
          {
            id: "orders",
            path: "orders",
            Component: true
          }
        ]
      }
    ],
    basename: "",
    context: {}
  });

  const action = runtime.getActions({ name: routeNavigateActionName })[0];
  assert.ok(action);
  assert.equal(action.risk, "state-changing");
  assert.equal(action.source, "modern.js");

  const result = await runtime.runAction(routeNavigateActionName, {
    to: "/orders",
    replace: true
  });

  assert.deepEqual(navigations, [
    {
      to: "/orders",
      options: { replace: true }
    }
  ]);
  assert.deepEqual(result, {
    success: true,
    actionName: routeNavigateActionName,
    result: {
      to: "/orders",
      routeId: "/orders",
      replace: true
    }
  });

  const unknown = await runtime.runAction(routeNavigateActionName, {
    to: "/missing"
  });
  assert.equal(unknown.success, false);
  assert.equal(unknown.error?.message, 'Route "/missing" is not in the Modern.js route list.');
  assert.equal(navigations.length, 1);
});
