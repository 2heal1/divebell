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

test("remote trace returns a compact lifecycle with results, resources, and preload evidence", async () => {
  const state = stateWithConsumer();
  const read = browserRead(state, [
    preloadTrace({ base: 500 }),
    loadTrace()
  ]);
  const trace = createOptions(
    ["mf", "remote", "trace", "shop/Button"],
    new Map([["trace-id", ["trace-load-1"]]]),
    read
  );
  assert.equal(await runMfCommand(trace.options), 0);
  assert.deepEqual(Object.keys(trace.outputValue()), ["result", "traces"]);
  assert.equal(trace.outputValue().result, "success");
  const load = trace.outputValue().traces[0];
  assert.equal(load.traceId, "trace-load-1");
  assert.equal(load.operation, "loadRemote");
  assert.deepEqual(load.instance, { ref: "mf-1", name: "host" });
  assert.deepEqual(load.target, {
    remote: "@scope/catalog",
    alias: "shop",
    expose: "./Button"
  });
  assert.deepEqual(load.preload, {
    status: "success",
    traceId: "trace-preload-1",
    timing: "before-load",
    startedAt: "1970-01-01 00:00:00.500 UTC",
    endedAt: "1970-01-01 00:00:00.512 UTC",
    duration: 12
  });
  assert.equal(
    load.result.startedAt,
    "1970-01-01 00:00:01.000 UTC"
  );
  assert.equal(load.result.status, "success");
  assert.equal(typeof load.result.duration, "number");
  assert.deepEqual(load.lifecycle.map((stage) => stage.phase), [
    "request",
    "matchRemote",
    "manifest",
    "remoteEntry",
    "containerInit",
    "expose",
    "factory",
    "result"
  ]);
  assert.equal(
    load.lifecycle[0].startedAt,
    "1970-01-01 00:00:01.000 UTC"
  );
  const manifestStage = load.lifecycle.find(
    (stage) => stage.phase === "manifest"
  );
  assert.equal(manifestStage.result, "success");
  assert.equal(manifestStage.startedBy, "beforeLoadResource");
  assert.equal(manifestStage.endedBy, "afterLoadResource");
  assert.match(manifestStage.resources[0].startedAt, / UTC$/);
  assert.match(manifestStage.resources[0].endedAt, / UTC$/);
  assert.equal(manifestStage.resources[0].loadedBy, "loadRemote");
  assert.equal(manifestStage.resources[0].result, "success");
  assert.equal(manifestStage.label, undefined);
  assert.equal(manifestStage.remote, undefined);

  const status = createOptions(
    ["mf", "remote", "status", "shop"],
    new Map([["instance", ["mf-1"]]]),
    read
  );
  assert.equal(await runMfCommand(status.options), 0);
  assert.deepEqual(Object.keys(status.outputValue()), ["consumer", "remote"]);
  assert.deepEqual(status.outputValue().remote, {
    name: "@scope/catalog",
    alias: "shop",
    declared: true,
    loaded: true,
    loadedExposes: ["./Button"],
    relationship: "resolved",
    producerInstanceRef: "mf-producer",
    latestResult: "success",
    latestTraceId: "trace-load-1"
  });

  const preload = createOptions(
    ["mf", "remote", "trace", "shop"],
    new Map([["preload", ["true"]]]),
    read
  );
  assert.equal(await runMfCommand(preload.options), 0);
  assert.equal(preload.stdout(), "");
  assert.equal(preload.outputValue().result, "success");
  assert.equal(preload.outputValue().traces[0].traceId, "trace-preload-1");
  assert.equal(preload.outputValue().traces[0].operation, "preloadRemote");
  assert.equal(preload.outputValue().traces[0].preload, undefined);
  assert.match(preload.outputValue().traces[0].result.startedAt, / UTC$/);
  assert.deepEqual(
    preload.outputValue().traces[0].lifecycle.map((stage) => stage.phase),
    ["preloadTarget", "manifest", "resources", "result"]
  );
  assert.doesNotMatch(JSON.stringify(preload.outputValue()), /trace-load-1/);
});

test("remote trace reports preload as not observed instead of claiming it did not happen", async () => {
  const run = createOptions(
    ["mf", "remote", "trace", "shop/Button"],
    new Map([["trace-id", ["trace-load-1"]]]),
    browserRead(stateWithConsumer(), [loadTrace()])
  );
  assert.equal(await runMfCommand(run.options), 0);
  assert.deepEqual(run.outputValue().traces[0].preload, {
    status: "not-observed"
  });
});

test("remote trace distinguishes an overlapping preload from one completed before load", async () => {
  const run = createOptions(
    ["mf", "remote", "trace", "shop/Button"],
    new Map([["trace-id", ["trace-load-1"]]]),
    browserRead(stateWithConsumer(), [
      preloadTrace({ base: 995 }),
      loadTrace()
    ])
  );
  assert.equal(await runMfCommand(run.options), 0);
  assert.equal(
    run.outputValue().traces[0].preload.timing,
    "overlapping"
  );
});

test("remote trace keeps a failed lifecycle result and its related resource error", async () => {
  const run = createOptions(
    ["mf", "remote", "trace", "shop/Button"],
    new Map([["trace-id", ["trace-load-1"]]]),
    browserRead(stateWithConsumer(), [
      loadTrace({ remoteEntryOutcome: "error" })
    ])
  );
  assert.equal(await runMfCommand(run.options), 0);
  const output = run.outputValue();
  assert.equal(output.result, "error");
  assert.equal(output.traces[0].result.status, "error");
  const remoteEntry = output.traces[0].lifecycle.find(
    (stage) => stage.phase === "remoteEntry"
  );
  assert.equal(remoteEntry.result, "error");
  assert.equal(remoteEntry.resources[0].result, "error");
  assert.equal(remoteEntry.resources[0].httpStatus, 504);
  assert.doesNotMatch(JSON.stringify(output), /demo-secret|token=/);
});

test("same-name MF instances return copyable command candidates", async () => {
  const first = consumer({ instanceRef: "mf-1", name: "host" });
  const second = consumer({ instanceRef: "mf-2", name: "host" });
  const state = stateWithConsumer({ instances: [first, second], relationships: [] });
  const run = createOptions(
    ["mf", "remote", "trace", "shop/Button"],
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
        'openruntime mf remote trace "shop/Button" --instance "mf-1"' &&
      error.data.candidates[1].command ===
        'openruntime mf remote trace "shop/Button" --instance "mf-2"'
  );
});

test("concurrent traces return copyable --trace-id candidates", async () => {
  const run = createOptions(
    ["mf", "remote", "trace", "shop/Button"],
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
        'openruntime mf remote trace "shop/Button" --instance "mf-1" --trace-id "trace-a"' &&
      error.data.candidates[1].command ===
        'openruntime mf remote trace "shop/Button" --instance "mf-1" --trace-id "trace-b"'
  );
});

test("remote status requires one remote target", async () => {
  const missing = createOptions(
    ["mf", "remote", "status"],
    new Map(),
    browserRead(stateWithConsumer())
  );
  await assert.rejects(
    () => runMfCommand(missing.options),
    (error) => error.code === "MF_COMMAND_USAGE_INVALID" &&
      /requires exactly one remote/.test(error.message)
  );
});

test("remote trace validates the --preload boolean value", async () => {
  const run = createOptions(
    ["mf", "remote", "trace", "shop"],
    new Map([["preload", ["sometimes"]]]),
    browserRead(stateWithConsumer())
  );
  await assert.rejects(
    () => runMfCommand(run.options),
    (error) => error.code === "MF_COMMAND_OPTION_INVALID" &&
      /Invalid --preload value/.test(error.message)
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
