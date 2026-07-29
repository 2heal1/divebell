import assert from "node:assert/strict";
import { test } from "node:test";

import { createRuntimeSdkDemoFixture } from "./fixtures/runtime-sdk-demo.mjs";

export function registerCliE2e({ getEnvironment }) {
  test("installs every official Extension once in one clean environment", async () => {
    const environment = getEnvironment();
    const listed = await environment.runCli([
      "extensions",
      "list",
      "--extensions-dir",
      environment.extensionsDirectory
    ]);
    const installedNames = listed.json.packages.map((item) => item.name).sort();
    const expectedNames = environment.officialExtensions.map((item) => item.name).sort();

    assert.deepEqual(installedNames, expectedNames);
    assert.ok(listed.json.packages.every((item) => item.extensions.length > 0));
    assert.ok(listed.json.packages.every((item) =>
      item.extensions.every((extension) =>
        extension.commands.length > 0 || extension.hooks.length > 0
      )
    ));
  });

  test("runs core Runtime SDK commands through the real CLI", async () => {
    const environment = getEnvironment();
    const fixture = await createRuntimeSdkDemoFixture();
    try {
      const runtimes = await environment.runCli([
        "runtimes",
        "--bridge",
        fixture.bridgeUrl
      ]);
      assert.equal(runtimes.json.bridgeUrl, fixture.bridgeUrl);
      assert.deepEqual(
        runtimes.json.runtimes
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

      const targets = await environment.runCli([
        "targets",
        "--bridge",
        fixture.bridgeUrl,
        "--runtime",
        fixture.runtimeId
      ]);
      assert.deepEqual(
        targets.json.result.map((target) => target.id).sort(),
        [
          "app:runtime-sdk-demo",
          "business:orders",
          "route:/runtime-sdk"
        ]
      );

      const snapshot = await environment.runCli([
        "snapshot",
        "--bridge",
        fixture.bridgeUrl,
        "--runtime",
        fixture.runtimeId,
        "--id",
        "business:orders"
      ]);
      assert.equal(snapshot.json.result.targets["business:orders"].status, "ready");
      assert.equal(snapshot.json.result.targets["business:orders"].data.orders, 3);
      assert.equal(snapshot.json.result.targets["business:orders"].data.updatedBy, "demo");

      const childSnapshot = await environment.runCli([
        "snapshot",
        "--bridge",
        fixture.bridgeUrl,
        "--runtime",
        fixture.childRuntimeId
      ]);
      assert.equal(
        childSnapshot.json.result.targets["microfrontend:checkout"].status,
        "mounted"
      );

      const actions = await environment.runCli([
        "actions",
        "--bridge",
        fixture.bridgeUrl,
        "--runtime",
        fixture.runtimeId
      ]);
      const refreshAction = actions.json.result.find(
        (action) => action.name === "demo.refresh-orders"
      );
      assert.equal(refreshAction?.enabled, true);
      assert.equal(refreshAction?.risk, "safe");

      const actionResult = await environment.runCli([
        "run-action",
        "--bridge",
        fixture.bridgeUrl,
        "--runtime",
        fixture.runtimeId,
        "demo.refresh-orders",
        "--payload",
        "{\"amount\":2,\"source\":\"cli\"}"
      ]);
      assert.equal(actionResult.json.result.success, true);
      assert.equal(actionResult.json.result.result.orders, 5);
      assert.equal(actionResult.json.result.result.source, "cli");

      const waitResult = await environment.runCli([
        "wait-for",
        "--bridge",
        fixture.bridgeUrl,
        "--runtime",
        fixture.runtimeId,
        "business:orders",
        "ready",
        "--where",
        "orders=5",
        "--where",
        "updatedBy=cli",
        "--timeout",
        "500"
      ]);
      assert.equal(waitResult.json.result.success, true);
      assert.equal(waitResult.json.result.target.status, "ready");
      assert.equal(waitResult.json.result.target.data.orders, 5);
      assert.equal(waitResult.json.result.target.data.updatedBy, "cli");

      const events = await environment.runCli([
        "events",
        "--bridge",
        fixture.bridgeUrl,
        "--runtime",
        fixture.runtimeId,
        "--limit",
        "20"
      ]);
      assert.deepEqual(
        events.json.result.events
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
