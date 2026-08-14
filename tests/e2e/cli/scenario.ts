import assert from "node:assert/strict";
import { test } from "node:test";
import { divebellTestCommands } from "@divebell/test";

import {
  createRuntimeSdkDemoFixture,
  isRefreshOrdersResult
} from "./fixtures/runtime-sdk-demo.js";
import type { DivebellE2eContext } from "../support/types.js";

export function registerCliE2e({ getEnvironment }: DivebellE2eContext): void {
  test("installs every official Extension once in one clean environment", async () => {
    const environment = getEnvironment();
    const listed = await environment.runCli(
      divebellTestCommands.extensions.list({
        extensionsDirectory: environment.extensionsDirectory
      })
    );
    const installedNames = listed.json.data.packages.map((item) => item.name).sort();
    const expectedNames = environment.officialExtensions.map((item) => item.name).sort();

    assert.deepEqual(installedNames, expectedNames);
    assert.ok(listed.json.data.packages.every((item) => item.extensions.length > 0));
    assert.ok(listed.json.data.packages.every((item) =>
      item.extensions.every((extension) =>
        extension.commands.length > 0 || extension.hooks.length > 0
      )
    ));
  });

  test("runs core Runtime SDK commands through the real CLI", async () => {
    const environment = getEnvironment();
    const fixture = await createRuntimeSdkDemoFixture();
    try {
      const runtimes = await environment.runCli(
        divebellTestCommands.runtimes({
          bridge: fixture.bridgeUrl
        })
      );
      assert.equal(runtimes.json.data.bridgeUrl, fixture.bridgeUrl);
      assert.deepEqual(
        runtimes.json.data.runtimes
          .map((runtime) => ({
            runtimeId: runtime.runtimeId,
            name: runtime.name,
            source: runtime.source,
            parentRuntimeId: runtime.parentRuntimeId,
            status: runtime.status
          }))
          .sort((left, right) => left.runtimeId.localeCompare(right.runtimeId)),
        [
          {
            runtimeId: fixture.childRuntimeId,
            name: "checkout",
            source: "runtime-sdk-demo",
            parentRuntimeId: fixture.runtimeId,
            status: "connected"
          },
          {
            runtimeId: fixture.runtimeId,
            name: "orders",
            source: "runtime-sdk-demo",
            parentRuntimeId: undefined,
            status: "connected"
          }
        ]
      );

      const targets = await environment.runCli(
        divebellTestCommands.targets({
          bridge: fixture.bridgeUrl,
          runtime: fixture.runtimeId
        })
      );
      assert.deepEqual(
        targets.json.data.result.map((target) => target.id).sort(),
        [
          "app:runtime-sdk-demo",
          "business:orders",
          "route:/runtime-sdk"
        ]
      );

      const snapshot = await environment.runCli(
        divebellTestCommands.snapshot({
          bridge: fixture.bridgeUrl,
          runtime: fixture.runtimeId,
          id: "business:orders"
        })
      );
      const ordersTarget = snapshot.json.data.result.targets["business:orders"];
      assert.equal(ordersTarget?.status, "ready");
      assert.ok(isRecord(ordersTarget?.data));
      assert.equal(ordersTarget.data.orders, 3);
      assert.equal(ordersTarget.data.updatedBy, "demo");

      const childSnapshot = await environment.runCli(
        divebellTestCommands.snapshot({
          bridge: fixture.bridgeUrl,
          runtime: fixture.childRuntimeId
        })
      );
      const checkoutTarget =
        childSnapshot.json.data.result.targets["microfrontend:checkout"];
      assert.ok(checkoutTarget);
      assert.equal(checkoutTarget.status, "mounted");

      const actions = await environment.runCli(
        divebellTestCommands.actions({
          bridge: fixture.bridgeUrl,
          runtime: fixture.runtimeId
        })
      );
      const refreshAction = actions.json.data.result.find(
        (action) => action.name === "demo.refresh-orders"
      );
      assert.equal(refreshAction?.enabled, true);
      assert.equal(refreshAction?.risk, "safe");

      const actionResult = await environment.runCli(
        divebellTestCommands.runAction("demo.refresh-orders", {
          bridge: fixture.bridgeUrl,
          runtime: fixture.runtimeId,
          payload: {
            amount: 2,
            source: "cli"
          }
        })
      );
      assert.equal(actionResult.json.data.result.success, true);
      assert.ok(isRefreshOrdersResult(actionResult.json.data.result.result));
      assert.equal(actionResult.json.data.result.result.orders, 5);
      assert.equal(actionResult.json.data.result.result.source, "cli");

      const waitResult = await environment.runCli(
        divebellTestCommands.waitFor("business:orders", "ready", {
          bridge: fixture.bridgeUrl,
          runtime: fixture.runtimeId,
          where: {
            orders: 5,
            updatedBy: "cli"
          },
          timeout: 500
        })
      );
      assert.equal(waitResult.json.data.result.success, true);
      const waitedTarget = waitResult.json.data.result.target;
      assert.ok(waitedTarget);
      assert.equal(waitedTarget.status, "ready");
      assert.ok(isRecord(waitedTarget.data));
      assert.equal(waitedTarget.data.orders, 5);
      assert.equal(waitedTarget.data.updatedBy, "cli");

      const events = await environment.runCli(
        divebellTestCommands.events({
          bridge: fixture.bridgeUrl,
          runtime: fixture.runtimeId,
          limit: 20
        })
      );
      assert.deepEqual(
        events.json.data.result.events
          .filter((event) => event.actionName === "demo.refresh-orders")
          .map((event) => event.type),
        [
          "action.started",
          "action.success"
        ]
      );
    } finally {
      await fixture.close();
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
