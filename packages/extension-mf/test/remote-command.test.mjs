import assert from "node:assert/strict";
import test from "node:test";

import { runMfCommand } from "../dist/index.js";
import { browserRead } from "./fixtures.mjs";
import {
  consumer,
  loadTrace,
  preloadTrace,
  stateWithConsumer
} from "./remote-fixtures.mjs";

test("trace, remote check, and preload trace return structured output by default", async () => {
  const state = stateWithConsumer();
  const read = browserRead(state, [loadTrace(), preloadTrace()]);
  const trace = createOptions(
    ["mf", "trace", "shop/Button"],
    new Map([["trace-id", ["trace-load-1"]]]),
    read
  );
  assert.equal(await runMfCommand(trace.options), 0);
  assert.equal(trace.outputValue().command, "mf trace");
  assert.equal(trace.outputValue().traces[0].traceId, "trace-load-1");
  assert.equal(trace.outputValue().compatibility, undefined);
  assert.equal(trace.outputValue().capability, undefined);
  assert.equal(
    trace.outputValue().traces[0].startedAt,
    "1970-01-01 00:00:01.000 UTC"
  );
  assert.equal(
    trace.outputValue().traces[0].stages[0].startedAt,
    "1970-01-01 00:00:01.000 UTC"
  );
  const manifestStage = trace.outputValue().traces[0].stages.find(
    (stage) => stage.name === "manifest"
  );
  assert.match(manifestStage.resources[0].startedAt, / UTC$/);
  assert.match(manifestStage.resources[0].endedAt, / UTC$/);
  assert.equal(typeof trace.outputValue().traces[0].duration, "number");

  const check = createOptions(
    ["mf", "remote", "check", "shop"],
    new Map([["instance", ["mf-1"]]]),
    read
  );
  assert.equal(await runMfCommand(check.options), 0);
  assert.equal(check.outputValue().command, "mf remote check");
  assert.equal(check.outputValue().remote.declared, true);
  assert.equal(check.outputValue().compatibility, undefined);
  assert.equal(check.outputValue().capability, undefined);

  const preload = createOptions(
    ["mf", "preload", "trace", "shop"],
    new Map(),
    read
  );
  assert.equal(await runMfCommand(preload.options), 0);
  assert.equal(preload.stdout(), "");
  assert.equal(preload.outputValue().command, "mf preload trace");
  assert.equal(preload.outputValue().traces[0].traceId, "trace-preload-1");
  assert.equal(preload.outputValue().compatibility, undefined);
  assert.equal(preload.outputValue().capability, undefined);
  assert.match(preload.outputValue().traces[0].startedAt, / UTC$/);
  assert.doesNotMatch(JSON.stringify(preload.outputValue()), /trace-load-1/);
});

test("same-name MF instances return copyable command candidates", async () => {
  const first = consumer({ instanceRef: "mf-1", name: "host" });
  const second = consumer({ instanceRef: "mf-2", name: "host" });
  const state = stateWithConsumer({ instances: [first, second], relationships: [] });
  const run = createOptions(
    ["mf", "trace", "shop/Button"],
    new Map([["mf", ["host"]]]),
    browserRead(state, [
      loadTrace({ traceId: "trace-a", instanceRef: "mf-1" }),
      loadTrace({ traceId: "trace-b", instanceRef: "mf-2", base: 2000 })
    ])
  );
  await assert.rejects(
    () => runMfCommand(run.options),
    (error) => error.code === "MF_CONSUMER_AMBIGUOUS" &&
      error.data.candidates[0].command ===
        'openruntime mf trace "shop/Button" --instance "mf-1"' &&
      error.data.candidates[1].command ===
        'openruntime mf trace "shop/Button" --instance "mf-2"'
  );
});

test("concurrent traces return copyable --trace-id candidates", async () => {
  const run = createOptions(
    ["mf", "trace", "shop/Button"],
    new Map(),
    browserRead(stateWithConsumer(), [
      loadTrace({ traceId: "trace-a", base: 1000 }),
      loadTrace({ traceId: "trace-b", base: 2000 })
    ])
  );
  await assert.rejects(
    () => runMfCommand(run.options),
    (error) => error.code === "MF_REMOTE_TRACE_AMBIGUOUS" &&
      error.data.candidates[0].traceId === "trace-a" &&
      error.data.candidates[0].command ===
        'openruntime mf trace "shop/Button" --instance "mf-1" --trace-id "trace-a"' &&
      error.data.candidates[1].command ===
        'openruntime mf trace "shop/Button" --instance "mf-1" --trace-id "trace-b"'
  );
});

test("remote check requires one remote target", async () => {
  const missing = createOptions(
    ["mf", "remote", "check"],
    new Map(),
    browserRead(stateWithConsumer())
  );
  await assert.rejects(
    () => runMfCommand(missing.options),
    (error) => error.code === "MF_COMMAND_USAGE_INVALID" &&
      /requires exactly one remote/.test(error.message)
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
          async eval() { return browserValue; }
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
