import assert from "node:assert/strict";
import { test } from "@rstest/core";

import {
  createDivebell,
  getDivebellFromWindow,
  getDivebellRegistryFromWindow,
  installDivebellOnWindow,
  uninstallDivebellFromWindow,
  type DivebellWindowHost
} from "../../dist/index.js";
import { createClock } from "../helpers/runtime.ts";

test("installs and reads the window API host", () => {
  const host: DivebellWindowHost = {};
  const runtime = createDivebell({ clock: createClock() });

  installDivebellOnWindow(runtime, host);

  assert.equal(getDivebellFromWindow(host), runtime);
  assert.equal(host.__DIVEBELL__, runtime);
  assert.equal(getDivebellRegistryFromWindow(host)?.list()[0]?.runtime, runtime);
});

test("registers multiple window runtimes without replacing the default instance", () => {
  const host: DivebellWindowHost = {};
  const main = createDivebell({ clock: createClock() });
  const child = createDivebell({ clock: createClock() });
  const events: string[] = [];

  installDivebellOnWindow(main, host, {
    runtimeId: "runtime-main",
    name: "main"
  });
  const registry = getDivebellRegistryFromWindow(host);
  registry?.subscribe((event) => events.push(`${event.type}:${event.instance.runtimeId}`));
  installDivebellOnWindow(child, host, {
    runtimeId: "runtime-child",
    name: "orders",
    parentRuntimeId: "runtime-main"
  });

  assert.equal(getDivebellFromWindow(host), main);
  assert.deepEqual(registry?.list().map((instance) => ({
    runtimeId: instance.runtimeId,
    name: instance.name,
    parentRuntimeId: instance.parentRuntimeId
  })), [
    { runtimeId: "runtime-main", name: "main", parentRuntimeId: undefined },
    { runtimeId: "runtime-child", name: "orders", parentRuntimeId: "runtime-main" }
  ]);
  assert.deepEqual(events, ["registered:runtime-child"]);

  assert.equal(uninstallDivebellFromWindow(child, host), true);
  assert.deepEqual(events, ["registered:runtime-child", "unregistered:runtime-child"]);
  assert.equal(registry?.list().length, 1);
});

test("promotes the next runtime when the default instance is uninstalled", () => {
  const host: DivebellWindowHost = {};
  const main = installDivebellOnWindow(createDivebell(), host, { runtimeId: "runtime-main" });
  const child = installDivebellOnWindow(createDivebell(), host, { runtimeId: "runtime-child" });

  assert.equal(uninstallDivebellFromWindow(main, host), true);
  assert.equal(getDivebellFromWindow(host), child);
  assert.equal(getDivebellRegistryFromWindow(host)?.list()[0]?.runtimeId, "runtime-child");
});

test("rejects duplicate runtime ids and deduplicates the same instance", () => {
  const host: DivebellWindowHost = {};
  const first = createDivebell();
  const second = createDivebell();

  installDivebellOnWindow(first, host, { runtimeId: "runtime-fixed" });
  installDivebellOnWindow(first, host, { runtimeId: "runtime-fixed" });
  assert.equal(getDivebellRegistryFromWindow(host)?.list().length, 1);
  assert.throws(
    () => installDivebellOnWindow(second, host, { runtimeId: "runtime-fixed" }),
    /already registered/
  );
});
