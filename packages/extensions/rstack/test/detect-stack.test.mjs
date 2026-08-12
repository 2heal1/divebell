import assert from "node:assert/strict";
import test from "node:test";

import { detectRstackStack } from "../dist/index.js";

const HMR_SOURCE = `
var currentStatus = "idle";
var registeredStatusHandlers = [];
function setStatus(newStatus) {
  currentStatus = newStatus;
  return Promise.all(registeredStatusHandlers.map(function (handler) {
    return handler(newStatus);
  })).then(function () {});
}
function hotCheck() {
  throw new Error("check() is only allowed in idle status");
}
`;

const RSPACK_LOAD_SCRIPT_SOURCE = `
function loadScript(url, done, key) {
  var script = document.createElement("script");
  script.setAttribute("data-rspack", "campaign-list:" + key);
  script.src = url;
  document.head.appendChild(script);
}
`;

const EXTENSION_OBSERVER_SOURCE = `
const marker = node.getAttribute("data-rspack");
for (const script of node.querySelectorAll("script[data-rspack]")) {}
`;

test("detectStack recommends rstack when data-rspack was observed while loading", async () => {
  const browser = new DetectBrowser({ observedDataRspack: true });
  const result = await detectRstackStack({ browser }, "rstack");
  assert.equal(result?.id, "rspack-hmr");
  assert.equal(result?.command, "rstack");
  assert.match(result?.evidence[0] ?? "", /script\[data-rspack\] observed/u);
  assert.equal(browser.enabled, false);
});

test("detectStack falls back to the compiled Rspack load-script marker", async () => {
  const browser = new DetectBrowser({ sourceMarker: true });
  const result = await detectRstackStack({ browser }, "rstack");
  assert.equal(result?.id, "rspack-hmr");
  assert.match(result?.evidence[0] ?? "", /compiled Rspack load-script marker/u);
  assert.equal(browser.enabled, false);
});

test("detectStack does not call a generic compatible HMR runtime Rstack", async () => {
  const browser = new DetectBrowser();
  const result = await detectRstackStack({ browser }, "rstack");
  assert.equal(result, undefined);
  assert.equal(browser.enabled, false);
});

class DetectBrowser {
  enabled = false;

  constructor({ observedDataRspack = false, sourceMarker = false } = {}) {
    this.observedDataRspack = observedDataRspack;
    this.sourceMarker = sourceMarker;
  }

  async eval() {
    return this.observedDataRspack
      ? {
          schemaVersion: 1,
          dataRspackScriptCount: 1,
          hotUpdateScriptCount: 0,
          observedAt: 1
        }
      : null;
  }

  async run(command, request = {}) {
    assert.equal(command, "debug");
    const args = request.args ?? [];
    if (args[0] === "status") {
      return json({
        connectionGeneration: 1,
        enabledSessions: this.enabled ? 1 : 0,
        sessions: [{
          sessionId: "page",
          documentGeneration: 1,
          enabled: this.enabled,
          tabId: "tab"
        }]
      });
    }
    if (args[0] === "enable") {
      this.enabled = true;
      return json({
        enabled: true,
        connectionGeneration: 1,
        sessions: [{ sessionId: "page", tabId: "tab" }]
      });
    }
    if (args[0] === "disable") {
      this.enabled = false;
      return json({ disabled: true });
    }
    if (args[0] === "source" && args[1] === "search") {
      if (args[2] === "data-rspack") {
        return json({
          matches: [
            {
              scriptId: "extension-init",
              sessionId: "page",
              url: "",
              line: 1,
              column: 1
            },
            ...(this.sourceMarker ? [{
                scriptId: "rspack-load-script",
                sessionId: "page",
                url: "http://localhost/runtime.js",
                line: 1,
                column: 1
              }] : [])
          ]
        });
      }
      return json({
        matches: args[2] === "check() is only allowed in idle status"
          ? [{
              scriptId: "runtime",
              sessionId: "page",
              url: "http://localhost/runtime.js",
              line: 1,
              column: 1
            }]
          : []
      });
    }
    if (args[0] === "source") {
      const scriptId = args[1];
      return json({
        script: {
          connectionGeneration: 1,
          sessionId: "page",
          documentGeneration: 1,
          scriptId,
          url: "http://localhost/runtime.js",
          scriptInstanceKey: null
        },
        scriptSource: scriptId === "rspack-load-script"
          ? RSPACK_LOAD_SCRIPT_SOURCE
          : scriptId === "extension-init"
            ? EXTENSION_OBSERVER_SOURCE
          : HMR_SOURCE
      });
    }
    throw new Error(`Unexpected debug request: ${JSON.stringify(args)}`);
  }
}

function json(value) {
  return JSON.stringify(value);
}
