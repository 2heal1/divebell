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
    this.debug = {
      enable: async (options = {}) => {
        this.requests.push({ method: "enable", options });
        return {
          enabled: true,
          connectionGeneration: 1,
          sessions: [{ sessionId: "cdp-page", tabId: "t1" }]
        };
      },
      sourceSearch: async (query, options = {}) => {
        this.requests.push({ method: "sourceSearch", query, options });
        return { matches: [] };
      }
    };
  }
}
