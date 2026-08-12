import assert from "node:assert/strict";
import test from "node:test";

import { DebugClient } from "../dist/debug-client.js";

test("uses stable tab IDs without forwarding CDP IDs as daemon sessions", async () => {
  const browser = new RecordingBrowser();
  const debug = new DebugClient(browser);

  await debug.enable();
  const result = await debug.sourceSearch("rendererPackageName", "cdp-page");

  assert.deepEqual(result.matches, []);
  assert.equal(browser.requests.length, 2);
  assert.equal(browser.requests[0].options.tab, undefined);
  assert.equal(browser.requests[1].options.tab, "t1");
  assert.equal(browser.requests[1].options["cdp-session"], undefined);
});

class RecordingBrowser {
  constructor() {
    this.requests = [];
  }

  async run(command, request) {
    assert.equal(command, "debug");
    this.requests.push(request);
    if (request.args[0] === "enable") {
      return JSON.stringify({
        enabled: true,
        connectionGeneration: 1,
        sessions: [{ sessionId: "cdp-page", tabId: "t1" }]
      });
    }
    return JSON.stringify({ matches: [] });
  }
}
