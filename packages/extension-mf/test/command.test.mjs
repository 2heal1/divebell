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
  assert.deepEqual(Object.keys(jsonRun.outputValue()), ["instances", "shared"]);
  assert.equal(jsonRun.outputValue().instances[0].instanceRef, "mf-1");
  assert.equal(jsonRun.outputValue().command, undefined);
  assert.equal(jsonRun.outputValue().compatibility, undefined);
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

test("unknown MF commands return the compatible unified help error", async () => {
  const run = createOptions(["mf", "shared", "check"], new Map(), undefined);
  await assert.rejects(
    () => runMfCommand(run.options),
    (error) => error.code === "MF_COMMAND_INVALID" &&
      error.message === "Unknown mf subcommand `shared check`. Available commands: status, module-info, trace, remote check, preload trace, shared status, shared trace or bridge trace." &&
      /openruntime mf status/.test(error.hint) &&
      /openruntime mf module-info/.test(error.hint) &&
      /openruntime mf bridge trace/.test(error.hint) &&
      /openruntime mf remote check/.test(error.hint) &&
      /openruntime mf shared status/.test(error.hint) &&
      /openruntime mf shared trace/.test(error.hint)
  );
});

test("mf without a subcommand lists the same eight commands without adding help", async () => {
  const run = createOptions(["mf"], new Map(), undefined);
  await assert.rejects(
    () => runMfCommand(run.options),
    (error) => error.code === "MF_COMMAND_REQUIRED" &&
      /mf requires a subcommand/.test(error.message) &&
      /status, module-info, trace, remote check, preload trace, shared status, shared trace or bridge trace/.test(error.message) &&
      !/mf help/.test(`${error.message} ${error.hint}`)
  );
});

test("MF presenter preserves status and module-info candidate commands", async () => {
  const duplicateState = runtimeState({
    instances: [
      instance({ instanceRef: "mf-1", name: "host", role: "consumer" }),
      instance({ instanceRef: "mf-2", name: "host", role: "consumer" })
    ]
  });
  const statusRun = createOptions(
    ["mf", "status", "host"],
    new Map(),
    browserRead(duplicateState)
  );
  await assert.rejects(
    () => runMfCommand(statusRun.options),
    (error) => error.code === "MF_INSTANCE_NAME_AMBIGUOUS" &&
      error.data.candidates[0].command === 'openruntime mf status --instance "mf-1"'
  );

  const moduleRun = createOptions(
    ["mf", "module-info"],
    new Map([["instance", ["stale-ref"]]]),
    browserRead(duplicateState)
  );
  await assert.rejects(
    () => runMfCommand(moduleRun.options),
    (error) => error.code === "MF_INSTANCE_REF_NOT_FOUND" &&
      /--role consumer/.test(error.hint) &&
      error.data.candidates[0].command === 'openruntime mf module-info --instance "mf-1"'
  );
});

test("representative status selectors and module-info still route and produce JSON", async () => {
  const host = instance({
    instanceRef: "mf-1",
    name: "host",
    role: "consumer",
    remotes: [{ name: "catalog" }]
  });
  const state = runtimeState({ instances: [host] });
  const statusRun = createOptions(
    ["mf", "status"],
    new Map([["role", ["consumer"]], ["instance", ["mf-1"]], ["json", ["true"]]]),
    browserRead(state)
  );
  assert.equal(await runMfCommand(statusRun.options), 0);
  assert.deepEqual(statusRun.outputValue().instances.map((item) => item.instanceRef), [
    "mf-1"
  ]);

  const moduleRun = createOptions(
    ["mf", "module-info", "catalog"],
    new Map([["mf", ["host"]], ["instance", ["mf-1"]], ["json", ["true"]]]),
    browserRead(state)
  );
  assert.equal(await runMfCommand(moduleRun.options), 0);
  assert.equal(moduleRun.outputValue().remote.status, "declared");
});

test("status JSON remains byte-for-byte compatible with the compact fixture", async () => {
  const state = runtimeState({
    instances: [instance({ instanceRef: "mf-1", name: "host", role: "consumer" })]
  });
  const run = createOptions(
    ["mf", "status"],
    new Map([["json", ["true"]]]),
    browserRead(state)
  );
  assert.equal(await runMfCommand(run.options), 0);
  assert.deepEqual(run.outputValue(), statusCompactFixture);
});

const statusCompactFixture = {
  instances: [{
    instanceRef: "mf-1",
    name: "host",
    role: "consumer",
    consumers: [],
    active: true
  }],
  shared: []
};

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
