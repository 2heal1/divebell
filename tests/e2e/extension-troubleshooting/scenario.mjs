import assert from "node:assert/strict";
import { test } from "node:test";

import { createTroubleshootingRuntimeFixture } from "../support/runtime-fixture.mjs";

export function registerTroubleshootingExtensionE2e({ getEnvironment }) {
  test("runs the installed troubleshooting Extension through the real CLI", async () => {
    const environment = getEnvironment();
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
}
