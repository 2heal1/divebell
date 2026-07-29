import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { DivebellTestEnvironment } from "../src/environment.mjs";
import { createTroubleshootingRuntimeFixture } from "../src/runtime-fixture.mjs";

let environment;

before(async () => {
  environment = await DivebellTestEnvironment.create();
});

after(async () => {
  await environment?.close();
});

test("installs every official Extension once in one clean environment", async () => {
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

test("runs the installed troubleshooting Extension through the real CLI", async () => {
  const fixture = await createTroubleshootingRuntimeFixture();
  try {
    const passed = await environment.runCli([
      "verify",
      "--bridge",
      fixture.bridgeUrl,
      "--url",
      fixture.pageUrl,
      fixture.targetId,
      "ready",
      "--where",
      "orderCount=3",
      "--timeout",
      "500"
    ]);

    assert.equal(passed.json.status, "ok");
    assert.equal(passed.json.data.result.success, true);
    assert.equal(passed.json.data.result.evidence.level, "business");
    assert.equal(passed.json.data.result.wait.target.id, fixture.targetId);

    const failed = await environment.runCli([
      "verify",
      "--bridge",
      fixture.bridgeUrl,
      "--url",
      fixture.pageUrl,
      fixture.targetId,
      "error",
      "--timeout",
      "30"
    ], {
      expectedExitCode: 1
    });

    assert.equal(failed.json.status, "error");
    assert.equal(failed.json.error.code, "VERIFY_FAILED");
    assert.equal(failed.json.data.result.success, false);
    assert.match(failed.json.message, /did not reach the expected status/);
  } finally {
    await fixture.close();
  }
});
