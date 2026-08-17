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

  async raw(command) {
    const request = parseRawDebugCommand(command);
    return {
      exitCode: 0,
      stdout: await this.run("debug", request),
      stderr: ""
    };
  }
}

function parseRawDebugCommand(command) {
  assert.equal(command[0], "debug");
  const args = [];
  const options = {};
  for (let index = 1; index < command.length; index += 1) {
    const value = command[index];
    if (!value.startsWith("--")) {
      args.push(value);
      continue;
    }
    const name = value.slice(2);
    const next = command[index + 1];
    options[name] = next === undefined || next.startsWith("--")
      ? true
      : command[++index];
  }
  return { args, options };
}
