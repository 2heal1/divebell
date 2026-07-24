import assert from "node:assert/strict";
import test from "node:test";

import { runMfCommand } from "../dist/index.js";
import { capability } from "./fixtures.mjs";
import {
  bridgeInstance,
  bridgeReport,
  bridgeSnapshot,
  bridgeState
} from "./bridge-fixtures.mjs";

test("bridge trace JSON is stable and preserves explicit lifecycle semantics", async () => {
  const browserValue = bridgeSnapshot({
    instances: [bridgeInstance()],
    reports: [bridgeReport({ invoked: true, commit: false })]
  });
  const options = new Map([
    ["instance", ["mf-1"]],
    ["bridge", ["bridge-1"]],
    ["operation", ["bridge-op-1"]]
  ]);
  const first = createOptions(["mf", "bridge", "trace", "shop"], options, browserValue);
  const second = createOptions(["mf", "bridge", "trace", "shop"], options, browserValue);
  assert.equal(await runMfCommand(first.options), 0);
  assert.equal(await runMfCommand(second.options), 0);
  assert.equal(JSON.stringify(first.outputValue()), JSON.stringify(second.outputValue()));
  const result = first.outputValue();
  assert.deepEqual(Object.keys(result), [
    "schemaVersion",
    "command",
    "compatibility",
    "capability",
    "selection",
    "operations",
    "currentStates",
    "candidates",
    "instanceCandidates",
    "warnings",
    "recommendedActions"
  ]);
  assert.equal(result.selection.kind, "operation");
  assert.equal(result.operations[0].called, true);
  assert.equal(result.operations[0].returned, true);
  assert.equal(result.operations[0].commitObserved, false);
  assert.equal(result.operations[0].applicationReadiness, "not-observed");
});

test("default bridge output preserves instance, sides, timing, outcome, and conservative readiness", async () => {
  const browserValue = bridgeSnapshot({
    instances: [bridgeInstance()],
    reports: [
      bridgeReport({ invoked: true, commit: true }),
      bridgeReport({ traceId: "producer", bridge: { side: "producer" } })
    ]
  });
  const run = createOptions(
    ["mf", "bridge", "trace"],
    new Map([ ["operation", ["bridge-op-1"]] ]),
    browserValue
  );
  assert.equal(await runMfCommand(run.options), 0);
  assert.equal(run.stdout(), "");
  const result = run.outputValue();
  assert.equal(result.operations[0].instance.instanceRef, "mf-1");
  assert.equal(
    result.operations[0].sides.find((side) => side.side === "consumer").framework,
    "react"
  );
  assert.equal(
    result.operations[0].sides.find((side) => side.side === "producer").framework,
    "react"
  );
  assert.equal(result.operations[0].duration, 10);
  assert.equal(result.operations[0].outcome, "success");
  assert.equal(result.operations[0].commitObserved, true);
  assert.equal(result.operations[0].applicationReadiness, "not-observed");
});

test("ambiguous remote results include copyable --operation candidate commands", async () => {
  const browserValue = bridgeSnapshot({
    instances: [bridgeInstance()],
    reports: [
      bridgeReport({ bridge: { operationId: "op-one", bridgeId: "bridge-one" } }),
      bridgeReport({ bridge: { operationId: "op-two", bridgeId: "bridge-two" } })
    ]
  });
  const run = createOptions(
    ["mf", "bridge", "trace", "shop"],
    new Map([["json", ["true"]]]),
    browserValue
  );
  assert.equal(await runMfCommand(run.options), 0);
  const result = run.outputValue();
  assert.equal(result.selection.kind, "candidates");
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.operationId).sort(),
    ["op-one", "op-two"]
  );
  for (const candidate of result.candidates) {
    assert.match(candidate.command, /^openruntime mf bridge trace "catalog"/);
    assert.match(candidate.command, /--instance "mf-1"/);
    assert.match(candidate.command, new RegExp(`--bridge ${JSON.stringify(candidate.bridgeId)}`));
    assert.match(candidate.command, new RegExp(`--operation ${JSON.stringify(candidate.operationId)}`));
  }
});

test("same-name MF instances return instanceRef commands instead of selecting the first", async () => {
  const browserValue = bridgeSnapshot({
    instances: [
      bridgeInstance({ instanceRef: "mf-1", name: "host" }),
      bridgeInstance({ instanceRef: "mf-2", name: "host" })
    ],
    reports: [
      bridgeReport({ instanceRef: "mf-1", bridge: { operationId: "op-one" } }),
      bridgeReport({ instanceRef: "mf-2", bridge: { operationId: "op-two" } })
    ]
  });
  const run = createOptions(
    ["mf", "bridge", "trace"],
    new Map([["mf", ["host"]], ["json", ["true"]]]),
    browserValue
  );
  assert.equal(await runMfCommand(run.options), 0);
  assert.equal(run.outputValue().selection.kind, "candidates");
  assert.deepEqual(
    run.outputValue().instanceCandidates.map((candidate) => candidate.command),
    [
      'openruntime mf bridge trace --instance "mf-1"',
      'openruntime mf bridge trace --instance "mf-2"'
    ]
  );
});

test("unavailable bridgeTrace is not reported as absence of Bridge usage", async () => {
  const browserValue = bridgeSnapshot({
    instances: [bridgeInstance({ states: [bridgeState()] })],
    bridgeCapability: capability(false, "unavailable", "Lifecycle hooks unavailable.")
  });
  const run = createOptions(
    ["mf", "bridge", "trace"],
    new Map([["json", ["true"]]]),
    browserValue
  );
  assert.equal(await runMfCommand(run.options), 0);
  assert.equal(run.outputValue().selection.kind, "unsupported");
  assert.equal(run.outputValue().currentStates[0].bridgeId, "bridge-1");
  assert.match(run.outputValue().warnings.join(" "), /Lifecycle hooks unavailable/);
  assert.doesNotMatch(run.outputValue().warnings.join(" "), /does not use Bridge/i);
});

test("bridge trace rejects more than one positional remote", async () => {
  const run = createOptions(
    ["mf", "bridge", "trace", "catalog", "checkout"],
    new Map(),
    undefined
  );
  await assert.rejects(
    () => runMfCommand(run.options),
    (error) => error.code === "MF_COMMAND_USAGE_INVALID" &&
      /at most one remote/.test(error.message)
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
        browser: { async eval() { return browserValue; } }
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
