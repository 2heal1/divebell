import assert from "node:assert/strict";
import test from "node:test";

import { runMfCommand } from "../dist/index.js";
import { browserRead, capability, instance, runtimeState } from "./fixtures.mjs";
import { bridgeInfo, bridgeReport, bridgeState } from "./bridge-fixtures.mjs";
import { catalogRemote, loadTrace, preloadTrace } from "./remote-fixtures.mjs";
import {
  shareScope,
  sharedPackage,
  sharedReport,
  sharedVersion
} from "./shared-fixtures.mjs";

const idleRemote = {
  name: "idle",
  entry: "https://cdn.test/idle/mf-manifest.json",
  type: "global"
};

test("all eight commands execute against one combined Remote, Shared, and Bridge snapshot", async () => {
  const snapshot = combinedSnapshot();
  const cases = [
    { command: ["mf", "status"], expected: "mf status", compactStatus: true },
    {
      command: ["mf", "module-info", "shop"],
      options: [["instance", ["mf-1"]]],
      expected: "mf module-info"
    },
    {
      command: ["mf", "trace", "shop/Button"],
      options: [["instance", ["mf-1"]], ["trace-id", ["remote-load"]]],
      expected: "mf trace"
    },
    {
      command: ["mf", "remote", "check", "shop"],
      options: [["instance", ["mf-1"]]],
      expected: "mf remote check"
    },
    {
      command: ["mf", "preload", "trace", "shop"],
      options: [["instance", ["mf-1"]], ["trace-id", ["remote-preload"]]],
      expected: "mf preload trace"
    },
    {
      command: ["mf", "shared", "status", "react"],
      options: [["instance", ["mf-1"]], ["scope", ["default"]]],
      expected: "mf shared status"
    },
    {
      command: ["mf", "shared", "trace", "react"],
      options: [["instance", ["mf-1"]], ["operation", ["shared-op"]]],
      expected: "mf shared trace"
    },
    {
      command: ["mf", "bridge", "trace", "shop"],
      options: [["instance", ["mf-1"]], ["operation", ["bridge-op"]]],
      expected: "mf bridge trace"
    }
  ];

  for (const item of cases) {
    const run = createOptions(
      item.command,
      new Map(item.options ?? []),
      snapshot
    );
    assert.equal(await runMfCommand(run.options), 0, item.expected);
    if (item.compactStatus) {
      assert.deepEqual(Object.keys(run.outputValue()), ["instances", "shared"]);
    } else {
      assert.equal(run.outputValue().command, item.expected);
    }
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(run.outputValue())));
  }
});

test("combined structured output keeps Remote, Shared, preload, and Bridge evidence isolated", async () => {
  const snapshot = combinedSnapshot();
  const remote = createOptions(
    ["mf", "trace", "shop/Button"],
    new Map([["trace-id", ["remote-load"]]]),
    snapshot
  );
  const preload = createOptions(
    ["mf", "preload", "trace", "shop"],
    new Map([["trace-id", ["remote-preload"]]]),
    snapshot
  );
  const shared = createOptions(
    ["mf", "shared", "trace", "react"],
    new Map([["operation", ["shared-op"]]]),
    snapshot
  );
  const bridge = createOptions(
    ["mf", "bridge", "trace", "shop"],
    new Map([["operation", ["bridge-op"]]]),
    snapshot
  );

  for (const run of [remote, preload, shared, bridge]) {
    assert.equal(await runMfCommand(run.options), 0);
    assert.equal(run.stdout(), "");
  }
  const remoteOutput = JSON.stringify(remote.outputValue());
  const preloadOutput = JSON.stringify(preload.outputValue());
  const sharedOutput = JSON.stringify(shared.outputValue());
  const bridgeOutput = JSON.stringify(bridge.outputValue());
  assert.match(remoteOutput, /remote-load/);
  assert.doesNotMatch(remoteOutput, /remote-preload|shared-op|bridge-op/);
  assert.match(preloadOutput, /remote-preload/);
  assert.doesNotMatch(preloadOutput, /remote-load|shared-op|bridge-op/);
  assert.match(sharedOutput, /shared-op/);
  assert.doesNotMatch(sharedOutput, /remote-load|remote-preload|bridge-op/);
  assert.match(bridgeOutput, /bridge-op/);
  assert.doesNotMatch(bridgeOutput, /remote-load|remote-preload|shared-op/);
});

test("pending, unknown, partial, and unavailable remain distinct in one snapshot", async () => {
  const snapshot = combinedSnapshot({
    remoteReport: loadTrace({ traceId: "remote-pending", pending: true }),
    sharedTraceCapability: capability(true, "partial", "Earlier Shared events are missing."),
    bridgeTraceCapability: capability(false, "unavailable", "Bridge hooks are unavailable.")
  });
  const pending = await runJson(
    ["mf", "trace", "shop/Button"],
    [["trace-id", ["remote-pending"]]],
    snapshot
  );
  const unknown = await runJson(
    ["mf", "remote", "check", "idle"],
    [["instance", ["mf-1"]]],
    snapshot
  );
  const partial = await runJson(
    ["mf", "shared", "trace", "react"],
    [["operation", ["shared-op"]]],
    snapshot
  );
  const unavailable = await runJson(
    ["mf", "bridge", "trace", "shop"],
    [],
    snapshot
  );

  assert.equal(pending.outcome, "pending");
  assert.equal(unknown.remote.outcome, "unknown");
  assert.equal(partial.supported, true);
  assert.equal(partial.capability.completeness, "partial");
  assert.equal(unavailable.capability.completeness, "unavailable");
  assert.equal(unavailable.selection.kind, "unsupported");
});

function combinedSnapshot(options = {}) {
  const bridgeCurrent = bridgeState({
    operationId: "bridge-op",
    lastOperationId: "bridge-op",
    remote: catalogRemote.name,
    moduleName: `${catalogRemote.name}/App`
  });
  const host = instance({
    instanceRef: "mf-1",
    name: "host",
    role: "consumer",
    remotes: [catalogRemote, idleRemote],
    loadedProducers: [catalogRemote],
    shareScopes: [shareScope("default", [
      sharedPackage("react", [sharedVersion("18.3.1", { loaded: true, singleton: true })])
    ])],
    bridge: {
      available: true,
      lifecycleCount: 4,
      remote: catalogRemote.name,
      states: [bridgeCurrent],
      commitObserved: false,
      routeSyncObserved: false
    }
  });
  const producer = instance({
    instanceRef: "mf-2",
    name: "catalog",
    role: "producer"
  });
  const state = runtimeState({
    capabilities: {
      ...runtimeState().capabilities,
      bridgeTrace: options.bridgeTraceCapability ?? capability(true, "complete"),
      sharedTrace: options.sharedTraceCapability ?? capability(true, "complete")
    },
    instances: [host, producer],
    relationships: [{
      consumerInstanceRef: "mf-1",
      producerInstanceRef: "mf-2",
      remote: catalogRemote,
      evidence: ["moduleCache.remoteInfo"],
      status: "resolved"
    }]
  });
  const remoteReport = options.remoteReport ?? loadTrace({ traceId: "remote-load" });
  return browserRead(state, [
    remoteReport,
    preloadTrace({ traceId: "remote-preload" }),
    sharedReport({ operationId: "shared-op", traceId: "shared-trace" }),
    bridgeReport({
      traceId: "bridge-trace",
      bridge: bridgeInfo({
        operationId: "bridge-op",
        remote: catalogRemote.name,
        moduleName: `${catalogRemote.name}/App`
      })
    })
  ], {
    globalShared: {
      default: {
        react: {
          "18.3.1": {
            from: "host",
            useIn: ["host", "catalog"],
            loaded: true
          }
        }
      }
    }
  });
}

async function runJson(command, optionEntries, browserValue) {
  const run = createOptions(
    command,
    new Map(optionEntries),
    browserValue
  );
  assert.equal(await runMfCommand(run.options), 0);
  return run.outputValue();
}

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
