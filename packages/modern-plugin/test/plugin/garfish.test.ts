import assert from "node:assert/strict";
import { test } from "@rstest/core";
import { createDivebell } from "@divebell/core";

import {
  createDivebellGarfishCustomLoader,
  createDivebellGarfishPlugin,
  createDivebellGarfishReporter,
  modernGarfishTargetIds
} from "../../dist/index.js";

interface GarfishAppData {
  name: string;
  status: string;
  phase: string;
  entry?: string;
  activeWhen?: string;
  scriptUrl?: string;
  provider?: {
    renderCalled?: boolean;
    renderCallCount?: number;
    destroyCalled?: boolean;
    destroyCallCount?: number;
  };
}

interface GarfishRootData {
  appCount: number;
  apps: GarfishAppData[];
  errorAppNames: string[];
  mountedAppNames: string[];
}

test("records Garfish app lifecycle state in Divebell targets", () => {
  const runtime = createDivebell();
  const plugin = createDivebellGarfishPlugin({ runtime })({});

  plugin.registerApp?.({
    orders: {
      name: "orders",
      entry: "http://localhost:3001/index.js",
      activeWhen: "/orders"
    }
  });
  plugin.beforeLoad?.({ name: "orders" });
  plugin.afterLoad?.({ name: "orders" }, { appId: "app-1", mounted: false });
  plugin.beforeEval?.({ name: "orders" }, "", {}, "http://localhost:3001/index.js", { async: false });
  plugin.afterEval?.({ name: "orders" }, "", {}, "http://localhost:3001/index.js", { async: false });
  plugin.beforeMount?.({ name: "orders" }, { appId: "app-1", mounted: false }, false);
  plugin.afterMount?.({ name: "orders" }, { appId: "app-1", mounted: true, display: true }, false);

  const targetId = modernGarfishTargetIds.app("orders");
  const target = runtime.getTargets({ id: targetId })[0];
  assert.ok(target);
  assert.equal(target.type, "modern.garfish.app");

  const snapshot = runtime.getSnapshot();
  assert.equal(snapshot.targets[targetId]?.status, "mounted");
  assert.deepEqual(snapshot.targets[targetId]?.data, {
    name: "orders",
    status: "mounted",
    phase: "mount",
    updatedAt: (snapshot.targets[targetId]?.data as GarfishAppData & { updatedAt: number }).updatedAt,
    lifecycle: "afterMount",
    entry: "http://localhost:3001/index.js",
    activeWhen: "/orders",
    scriptUrl: "http://localhost:3001/index.js",
    execOptions: {
      async: false
    },
    appInstance: {
      appId: "app-1",
      mounted: true,
      display: true
    }
  });

  const root = snapshot.targets["modern:garfish"];
  assert.equal(root?.status, "mounted");
  const rootData = root?.data as GarfishRootData;
  assert.equal(rootData.appCount, 1);
  assert.deepEqual(rootData.mountedAppNames, ["orders"]);
});

test("records Garfish errors on app and aggregate targets", () => {
  const runtime = createDivebell();
  const plugin = createDivebellGarfishPlugin({ runtime })({});

  plugin.errorExecCode?.(
    new Error("script failed"),
    { name: "orders" },
    "",
    {},
    "http://localhost:3001/index.js",
    { async: true }
  );

  const targetId = modernGarfishTargetIds.app("orders");
  const snapshot = runtime.getSnapshot();
  assert.equal(snapshot.targets[targetId]?.status, "error");
  assert.equal(snapshot.targets[targetId]?.error?.message, "script failed");
  assert.equal(snapshot.targets[targetId]?.error?.code, "garfish_exec_error");
  assert.equal(snapshot.targets["modern:garfish"]?.status, "error");
  assert.equal(snapshot.targets["modern:garfish"]?.error?.message, "script failed");
  assert.deepEqual((snapshot.targets["modern:garfish"]?.data as GarfishRootData).errorAppNames, ["orders"]);
});

test("custom loader records provider render and destroy calls without treating render as business ready", async () => {
  const runtime = createDivebell();
  const reporter = createDivebellGarfishReporter({ runtime });
  const loader = createDivebellGarfishCustomLoader({ reporter });
  let renderCalls = 0;
  let destroyCalls = 0;

  const result = await loader(
    {
      render() {
        renderCalls += 1;
      },
      destroy() {
        destroyCalls += 1;
      }
    },
    { name: "orders" }
  );

  result?.mount?.({ appName: "orders", basename: "/orders" });
  assert.equal(renderCalls, 1);

  const targetId = modernGarfishTargetIds.app("orders");
  let appData = runtime.getSnapshot().targets[targetId]?.data as GarfishAppData;
  assert.equal(runtime.getSnapshot().targets[targetId]?.status, "rendering");
  assert.equal(appData.provider?.renderCalled, true);
  assert.equal(appData.provider?.renderCallCount, 1);

  result?.unmount?.({ appName: "orders" });
  assert.equal(destroyCalls, 1);

  appData = runtime.getSnapshot().targets[targetId]?.data as GarfishAppData;
  assert.equal(runtime.getSnapshot().targets[targetId]?.status, "unmounting");
  assert.equal(appData.provider?.destroyCalled, true);
  assert.equal(appData.provider?.destroyCallCount, 1);
});
