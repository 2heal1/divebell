import assert from "node:assert/strict";
import { test } from "@rstest/core";
import { createOpenRuntime } from "@openruntime/core";

import { openRuntimeModernPlugin, type ModernRenderContext } from "../../dist/index.js";
import { createModernApiHarness } from "../helpers/modern-api.js";

test("registers fixed app and route targets during plugin setup", () => {
  const runtime = createOpenRuntime();
  createModernApiHarness(openRuntimeModernPlugin({ runtime }));

  const appTarget = runtime.getTargets({ id: "modern:app" })[0];
  assert.ok(appTarget);
  const routeTarget = runtime.getTargets({ id: "modern:route" })[0];
  assert.ok(routeTarget);
  assert.deepEqual(routeTarget.data, {
    routes: []
  });

  const snapshot = runtime.getSnapshot();
  assert.equal(snapshot.targets["modern:app"]?.status, "initializing");
  assert.equal(snapshot.targets["modern:route"], undefined);
  assert.equal(snapshot.targets["modern:ssr"], undefined);
  assert.equal(snapshot.targets["modern:hydration"], undefined);
});

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
        hasRouteComponent: true,
        hasLazyModule: false,
        path: "/",
        pathname: "/",
        modernRouteId: "root"
      },
      {
        routeId: "/settings",
        hasLoader: false,
        hasRouteComponent: true,
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

test("does not connect the bridge while running without a browser host", () => {
  const runtime = createOpenRuntime();
  const { handlers } = createModernApiHarness(openRuntimeModernPlugin({
    runtime,
    bridge: {
      port: 17321
    }
  }));

  assert.doesNotThrow(() => {
    handlers.onBeforeRender?.({
      routes: [
        {
          id: "root",
          path: "/",
          Component: true
        }
      ]
    });
  });
});

test("injects the same render context through stream SSR", () => {
  const { handlers } = createModernApiHarness(openRuntimeModernPlugin());
  const context: ModernRenderContext = {
    routes: [
      {
        id: "root",
        path: "/",
        Component: true
      }
    ],
    ssrContext: {
      request: {
        pathname: "/",
        host: "localhost:19083",
        url: "http://localhost:19083/"
      },
      htmlModifiers: []
    }
  };

  handlers.onBeforeRender?.(context);
  const extender = handlers.extendStreamSSR?.();
  assert.ok(extender);
  extender.init?.({
    rootElement: {
      props: {
        children: {
          props: {
            value: context
          }
        }
      }
    },
    forceStream2String: false
  });

  const streamScript = extender.getStyleTags?.() ?? "";
  assert.match(streamScript, /id="__OPEN_RUNTIME_CONTEXT__"/);
  const renderContext = readRenderContextFromScript(streamScript);
  assert.match(renderContext.runtimeId, /^runtime-/);
  assert.match(renderContext.renderId, /^render-/);
  assert.equal(renderContext.source, "modern.js");

  const stringHtml = context.ssrContext?.htmlModifiers?.[0]?.("<html><head></head><body></body></html>");
  assert.ok(stringHtml);
  assert.match(stringHtml, new RegExp(renderContext.runtimeId));
  assert.match(stringHtml, new RegExp(renderContext.renderId));
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
        hasRouteComponent: true,
        hasLazyModule: false,
        path: "/",
        pathname: "/",
        modernRouteId: "page"
      }
    ]
  });
});

function readRenderContextFromScript(script: string): {
  runtimeId: string;
  renderId: string;
  source: string;
} {
  const match = script.match(/<script[^>]*>(.*)<\/script>/);
  const payload = match?.[1];
  assert.ok(payload);
  const value = JSON.parse(payload) as Partial<{
    runtimeId: string;
    renderId: string;
    source: string;
  }>;
  const { runtimeId, renderId, source } = value;
  if (typeof runtimeId !== "string" || typeof renderId !== "string" || typeof source !== "string") {
    throw new Error(`Invalid render context script: ${script}`);
  }
  return {
    runtimeId,
    renderId,
    source
  };
}
