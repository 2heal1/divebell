import assert from "node:assert/strict";
import { test } from "node:test";

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
}
