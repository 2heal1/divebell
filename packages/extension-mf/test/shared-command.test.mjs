import assert from "node:assert/strict";
import test from "node:test";

import { runMfCommand } from "../dist/index.js";
import { createSharedCommandPresenter } from "../dist/cli/shared.js";
import { browserRead, instance, runtimeState } from "./fixtures.mjs";
import {
  shareScope,
  sharedPackage,
  sharedReport,
  sharedVersion
} from "./shared-fixtures.mjs";

test("shared presenter emits copyable status and trace selectors", () => {
  const presenter = createSharedCommandPresenter(["openruntime", "mf"]);
  assert.equal(
    presenter.status({ package: "react", mf: "host", instanceRef: "mf-1", scope: "default" }),
    'openruntime mf shared status "react" --mf "host" --instance "mf-1" --scope "default"'
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
  const state = runtimeState({
    instances: [instance({
      instanceRef: "mf-1",
      name: "host",
      role: "consumer",
      shareScopes: [shareScope("default", [sharedPackage("react", [
        sharedVersion("18.3.1", { loaded: true, singleton: true })
      ])])]
    })]
  });
  const jsonRun = createOptions(
    ["mf", "shared", "status", "react"],
    new Map([["scope", ["default"]]]),
    browserRead(state)
  );
  assert.equal(await runMfCommand(jsonRun.options), 0);
  assert.deepEqual(jsonRun.outputValue(), {
    schemaVersion: 1,
    command: "mf shared status",
    supported: true,
    filters: { package: "react", scope: "default" },
    instances: [{
      instanceRef: "mf-1",
      mfName: "host",
      runtimeVersion: "2.5.4",
      scopes: [{
        scope: "default",
        packages: [{
          package: "react",
          availableVersions: ["18.3.1"],
          loadedVersions: ["18.3.1"],
          versions: [{
            version: "18.3.1",
            provider: "host",
            loaded: true,
            singleton: true,
            eager: false,
            strategy: "loaded-first"
          }],
          conflicts: []
        }]
      }]
    }],
    warnings: [],
    recommendedActions: []
  });

  const textRun = createOptions(
    ["mf", "shared", "status"],
    new Map(),
    browserRead(state)
  );
  assert.equal(await runMfCommand(textRun.options), 0);
  assert.equal(textRun.stdout(), "");
  assert.equal(textRun.outputValue().command, "mf shared status");
  assert.equal(textRun.outputValue().instances[0].instanceRef, "mf-1");
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
