import assert from "node:assert/strict";
import test from "node:test";

import { runMfCommand } from "../dist/index.js";
import { createSharedCommandPresenter } from "../dist/cli/shared.js";
import { browserRead, instance, runtimeState } from "./fixtures.mjs";
import { sharedReport } from "./shared-fixtures.mjs";

test("shared presenter emits copyable status and trace selectors", () => {
  const presenter = createSharedCommandPresenter(["openruntime", "mf"]);
  assert.equal(
    presenter.status({
      package: "react",
      scope: "default",
      version: "18.3.1",
      verbose: true
    }),
    'openruntime mf shared status "react" --scope "default" --version "18.3.1" --verbose'
  );
  assert.equal(
    presenter.trace({
      package: "react",
      instanceRef: "mf-1",
      scope: "default",
      operationId: "loadShare-42"
    }),
    'openruntime mf shared trace "react" --instance "mf-1" --scope "default" --operation "loadShare-42"'
  );
});

test("shared status returns stable structured output by default", async () => {
  const state = runtimeState();
  const globalShared = {
    default: {
      react: {
        "17.0.2": {
          from: "legacy",
          useIn: [],
          loaded: false,
          get: { source: "() => legacyReact" }
        },
        "18.3.1": {
          from: "host",
          useIn: ["host"],
          loaded: true,
          loading: true,
          strategy: "loaded-first",
          lib: { source: "() => react" }
        }
      }
    }
  };
  const jsonRun = createOptions(
    ["mf", "shared", "status", "react"],
    new Map([
      ["scope", ["default"]],
      ["version", ["18.3.1"]]
    ]),
    browserRead(state, [], { globalShared })
  );
  assert.equal(await runMfCommand(jsonRun.options), 0);
  assert.deepEqual(jsonRun.outputValue(), {
    shared: {
      default: {
        react: {
          "18.3.1": {
            from: "host",
            useIn: ["host"],
            loaded: true,
            strategy: "loaded-first"
          }
        }
      }
    }
  });
  assert.equal(jsonRun.outputValue().instances, undefined);
  assert.equal(
    jsonRun.outputValue().shared.default.react["18.3.1"].loading,
    undefined
  );

  const verboseRun = createOptions(
    ["mf", "shared", "status", "react"],
    new Map([
      ["scope", ["default"]],
      ["version", ["17.0.2"]],
      ["verbose", ["true"]]
    ]),
    browserRead(state, [], { globalShared })
  );
  assert.equal(await runMfCommand(verboseRun.options), 0);
  assert.equal(verboseRun.stdout(), "");
  assert.deepEqual(
    verboseRun.outputValue().shared.default.react["17.0.2"],
    {
      from: "legacy",
      useIn: [],
      loaded: false,
      get: { source: "() => legacyReact" }
    }
  );
});

test("shared status rejects instance selectors and invalid verbose values", async () => {
  for (const option of ["mf", "instance"]) {
    const run = createOptions(
      ["mf", "shared", "status", "react"],
      new Map([[option, ["host"]]]),
      browserRead(runtimeState())
    );
    await assert.rejects(
      () => runMfCommand(run.options),
      (error) =>
        error.code === "MF_COMMAND_OPTION_INVALID" &&
        new RegExp(`--${option}`).test(error.message)
    );
  }

  const invalidVerbose = createOptions(
    ["mf", "shared", "status", "react"],
    new Map([["verbose", ["sometimes"]]]),
    browserRead(runtimeState())
  );
  await assert.rejects(
    () => runMfCommand(invalidVerbose.options),
    (error) =>
      error.code === "MF_COMMAND_OPTION_INVALID" &&
      /--verbose/.test(error.message)
  );
});

test("ambiguous shared trace returns copyable operation commands", async () => {
  const state = runtimeState({
    instances: [instance({ instanceRef: "mf-1", name: "host", role: "consumer" })]
  });
  const reports = [
    sharedReport({ operationId: "op-a", traceId: "trace-a", startedAt: 100 }),
    sharedReport({ operationId: "op-b", traceId: "trace-b", startedAt: 200 })
  ];
  const jsonRun = createOptions(
    ["mf", "shared", "trace", "react"],
    new Map(),
    browserRead(state, reports)
  );
  assert.equal(await runMfCommand(jsonRun.options), 0);
  const value = jsonRun.outputValue();
  assert.equal(value.selection.kind, "ambiguous");
  assert.deepEqual(value.candidates.map((candidate) => candidate.operationId), ["op-a", "op-b"]);
  assert.equal(
    value.candidates[0].command,
    'openruntime mf shared trace "react" --instance "mf-1" --scope "default" --operation "op-a"'
  );

  const textRun = createOptions(
    ["mf", "shared", "trace", "react"],
    new Map(),
    browserRead(state, reports)
  );
  assert.equal(await runMfCommand(textRun.options), 0);
  assert.equal(textRun.stdout(), "");
  assert.equal(textRun.outputValue().selection.kind, "ambiguous");
  assert.match(textRun.outputValue().candidates[0].command, /--operation "op-a"/);
});

test("shared trace command applies instance, scope, operation, and trace-id selectors", async () => {
  const instances = [
    instance({ instanceRef: "mf-1", name: "host", role: "consumer" }),
    instance({ instanceRef: "mf-2", name: "host", role: "consumer" })
  ];
  const reports = [
    sharedReport({ instanceRef: "mf-1", operationId: "op-a", traceId: "trace-a" }),
    sharedReport({ instanceRef: "mf-2", operationId: "op-b", traceId: "trace-b" })
  ];
  const run = createOptions(
    ["mf", "shared", "trace", "react"],
    new Map([
      ["instance", ["mf-2"]],
      ["scope", ["default"]],
      ["operation", ["op-b"]],
      ["trace-id", ["trace-b"]],
      ["json", ["true"]]
    ]),
    browserRead(runtimeState({ instances }), reports)
  );
  assert.equal(await runMfCommand(run.options), 0);
  assert.equal(run.outputValue().selection.kind, "detail");
  assert.equal(run.outputValue().operations[0].instanceRef, "mf-2");
  assert.equal(run.outputValue().operations[0].operationId, "op-b");
});

test("shared trace defaults to the top-level consumer", async () => {
  const instances = [
    instance({ instanceRef: "mf-1", name: "parent", role: "consumer" }),
    instance({ instanceRef: "mf-2", name: "child", role: "mixed" })
  ];
  const state = runtimeState({
    instances,
    relationships: [{
      consumerInstanceRef: "mf-1",
      producerInstanceRef: "mf-2",
      remote: { name: "child" },
      evidence: ["loadRemote"],
      status: "resolved"
    }]
  });
  const reports = [
    sharedReport({
      instanceRef: "mf-1",
      operationId: "parent-op",
      traceId: "parent-trace"
    }),
    sharedReport({
      instanceRef: "mf-2",
      operationId: "child-op",
      traceId: "child-trace"
    })
  ];
  const run = createOptions(
    ["mf", "shared", "trace", "react"],
    new Map(),
    browserRead(state, reports)
  );
  assert.equal(await runMfCommand(run.options), 0);
  assert.equal(run.outputValue().selection.kind, "detail");
  assert.equal(run.outputValue().operations[0].instanceRef, "mf-1");
  assert.equal(run.outputValue().operations[0].operationId, "parent-op");
});

test("remote trace rejects shared-only selectors", async () => {
  const run = createOptions(
    ["mf", "remote", "trace", "react"],
    new Map([["scope", ["default"]]]),
    browserRead(runtimeState())
  );
  await assert.rejects(
    () => runMfCommand(run.options),
    (error) =>
      error.code === "MF_COMMAND_OPTION_INVALID" &&
      /--scope is not available for remote traces/.test(error.message) &&
      /mf shared trace/.test(error.hint)
  );
});

test("remote trace rejects the removed --shared mode", async () => {
  const run = createOptions(
    ["mf", "remote", "trace", "react"],
    new Map([["shared", ["true"]]]),
    browserRead(runtimeState())
  );
  await assert.rejects(
    () => runMfCommand(run.options),
    (error) =>
      error.code === "MF_COMMAND_OPTION_INVALID" &&
      /--shared is not available/.test(error.message) &&
      /mf shared trace/.test(error.hint)
  );
});

function createOptions(command, argsOptions, browserValue) {
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
