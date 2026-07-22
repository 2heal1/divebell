import assert from "node:assert/strict";
import test from "node:test";

import { runMfCommand } from "../dist/index.js";
import { browserRead, instance, runtimeState } from "./fixtures.mjs";

test("status defaults to readable text and --json returns stable structured data", async () => {
  const state = runtimeState({
    instances: [instance({ instanceRef: "mf-1", name: "host", role: "consumer" })]
  });
  const textRun = createOptions(["mf", "status"], new Map(), browserRead(state));
  assert.equal(await runMfCommand(textRun.options), 0);
  assert.match(textRun.stdout(), /Module Federation status/);
  assert.match(textRun.stdout(), /mf-1/);

  const jsonRun = createOptions(["mf", "status"], new Map([["json", ["true"]]]), browserRead(state));
  assert.equal(await runMfCommand(jsonRun.options), 0);
  assert.equal(jsonRun.outputValue().schemaVersion, 1);
  assert.equal(jsonRun.outputValue().instances[0].instanceRef, "mf-1");
});

test("missing reader explains current evidence and the next open command", async () => {
  const run = createOptions(["mf", "status"], new Map(), {
    ok: false,
    reason: "unavailable",
    message: "No reader.",
    availableScopes: [],
    compatibleScopes: []
  });
  await assert.rejects(
    () => runMfCommand(run.options),
    (error) => error.code === "MF_OBSERVABILITY_UNAVAILABLE" &&
      /openruntime open/.test(error.hint)
  );
});

test("missing OpenRuntime page context has a dedicated recovery message", async () => {
  const run = createOptions(["mf", "status"], new Map(), undefined, {
    code: "OPEN_CONTEXT_REQUIRED",
    message: "No opened page context was found."
  });
  await assert.rejects(
    () => runMfCommand(run.options),
    (error) => error.code === "MF_PAGE_CONTEXT_REQUIRED" &&
      /openruntime open/.test(error.hint)
  );
});

function createOptions(command, argsOptions, browserValue, browserError) {
  let stdout = "";
  let outputValue;
  return {
    options: {
      args: { command, options: argsOptions },
      stdout: { write(chunk) { stdout += chunk; } },
      stderr: { write() {} },
      fetcher: async () => new Response(),
      openruntime: {
        browser: {
          async eval() {
            if (browserError !== undefined) {
              throw Object.assign(new Error(browserError.message), { code: browserError.code });
            }
            return browserValue;
          }
        }
      },
      output: {
        ok(value) { outputValue = value; },
        needsInput() {},
        error() {}
      }
    },
    stdout: () => stdout,
    outputValue: () => outputValue
  };
}
