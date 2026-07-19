import assert from "node:assert/strict";
import { test } from "@rstest/core";

import {
  createOpenRuntime,
  getOpenRuntimeFromWindow,
  getOpenRuntimeRegistryFromWindow,
  installOpenRuntimeOnWindow,
  uninstallOpenRuntimeFromWindow,
  type OpenRuntimeWindowHost
} from "../../dist/index.js";
import { createClock } from "../helpers/runtime.ts";

test("installs and reads the window API host", () => {
  const host: OpenRuntimeWindowHost = {};
  const runtime = createOpenRuntime({ clock: createClock() });

  installOpenRuntimeOnWindow(runtime, host);

  assert.equal(getOpenRuntimeFromWindow(host), runtime);
  assert.equal(host.__OPEN_RUNTIME__, runtime);
  assert.equal(getOpenRuntimeRegistryFromWindow(host)?.list()[0]?.runtime, runtime);
});

test("registers multiple window runtimes without replacing the default instance", () => {
  const host: OpenRuntimeWindowHost = {};
  const main = createOpenRuntime({ clock: createClock() });
  const child = createOpenRuntime({ clock: createClock() });
  const events: string[] = [];

  installOpenRuntimeOnWindow(main, host, {
    runtimeId: "runtime-main",
    name: "main"
  });
  const registry = getOpenRuntimeRegistryFromWindow(host);
  registry?.subscribe((event) => events.push(`${event.type}:${event.instance.runtimeId}`));
  installOpenRuntimeOnWindow(child, host, {
    runtimeId: "runtime-child",
    name: "orders",
    parentRuntimeId: "runtime-main"
  });

  assert.equal(getOpenRuntimeFromWindow(host), main);
  assert.deepEqual(registry?.list().map((instance) => ({
    runtimeId: instance.runtimeId,
    name: instance.name,
    parentRuntimeId: instance.parentRuntimeId
  })), [
    { runtimeId: "runtime-main", name: "main", parentRuntimeId: undefined },
    { runtimeId: "runtime-child", name: "orders", parentRuntimeId: "runtime-main" }
  ]);
  assert.deepEqual(events, ["registered:runtime-child"]);

  assert.equal(uninstallOpenRuntimeFromWindow(child, host), true);
  assert.deepEqual(events, ["registered:runtime-child", "unregistered:runtime-child"]);
  assert.equal(registry?.list().length, 1);
});

test("promotes the next runtime when the default instance is uninstalled", () => {
  const host: OpenRuntimeWindowHost = {};
  const main = installOpenRuntimeOnWindow(createOpenRuntime(), host, { runtimeId: "runtime-main" });
  const child = installOpenRuntimeOnWindow(createOpenRuntime(), host, { runtimeId: "runtime-child" });

  assert.equal(uninstallOpenRuntimeFromWindow(main, host), true);
  assert.equal(getOpenRuntimeFromWindow(host), child);
  assert.equal(getOpenRuntimeRegistryFromWindow(host)?.list()[0]?.runtimeId, "runtime-child");
});

test("rejects duplicate runtime ids and deduplicates the same instance", () => {
  const host: OpenRuntimeWindowHost = {};
  const first = createOpenRuntime();
  const second = createOpenRuntime();

  installOpenRuntimeOnWindow(first, host, { runtimeId: "runtime-fixed" });
  installOpenRuntimeOnWindow(first, host, { runtimeId: "runtime-fixed" });
  assert.equal(getOpenRuntimeRegistryFromWindow(host)?.list().length, 1);
  assert.throws(
    () => installOpenRuntimeOnWindow(second, host, { runtimeId: "runtime-fixed" }),
    /already registered/
  );
});
