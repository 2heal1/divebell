import assert from "node:assert/strict";
import test from "node:test";

import { runMfCommand } from "../dist/index.js";
import { browserRead, instance, runtimeState } from "./fixtures.mjs";

test("status returns structured data without requiring --json", async () => {
  const state = runtimeState({
    instances: [instance({ instanceRef: "mf-1", name: "host", role: "consumer" })]
  });
  const run = createOptions(["mf", "status"], new Map(), browserRead(state));
  assert.equal(await runMfCommand(run.options), 0);
  assert.equal(run.stdout(), "");
  assert.deepEqual(Object.keys(run.outputValue()), ["instances", "shared"]);
  assert.equal(run.outputValue().instances[0].instanceRef, "mf-1");
  assert.equal(run.outputValue().command, undefined);
  assert.equal(run.outputValue().compatibility, undefined);
});

test("status --verbose adds unloaded shared dependencies and function details", async () => {
  const state = runtimeState({
    instances: [instance({ instanceRef: "mf-1", name: "host", role: "consumer" })]
  });
  const globalShared = {
    default: {
      react: {
        "18.3.1": {
          from: "host",
          useIn: ["host"],
          loaded: true,
          loading: true,
          lib: {
            source: "() => react",
            location: {
              url: "https://cdn.test/assets/main.js",
              line: 120,
              column: 18,
              original: {
                source: "src/shared/react.ts",
                line: 14,
                column: 2
              }
            }
          }
        },
        "17.0.2": {
          from: "legacy",
          useIn: [],
          loaded: false,
          get: { source: "() => legacyReact" }
        }
      }
    }
  };
  const defaultRun = createOptions(
    ["mf", "status"],
    new Map(),
    browserRead(state, [], { globalShared })
  );
  assert.equal(await runMfCommand(defaultRun.options), 0);
  assert.deepEqual(
    Object.keys(defaultRun.outputValue().shared.default.react),
    ["18.3.1"]
  );
  assert.equal(
    defaultRun.outputValue().shared.default.react["18.3.1"].lib,
    undefined
  );
  assert.equal(
    defaultRun.outputValue().shared.default.react["18.3.1"].loading,
    undefined
  );

  const verboseRun = createOptions(
    ["mf", "status"],
    new Map([["verbose", ["true"]]]),
    browserRead(state, [], { globalShared })
  );
  assert.equal(await runMfCommand(verboseRun.options), 0);
  assert.deepEqual(
    Object.keys(verboseRun.outputValue().shared.default.react),
    ["17.0.2", "18.3.1"]
  );
  assert.match(
    verboseRun.outputValue().shared.default.react["17.0.2"].get.source,
    /legacyReact/
  );
  assert.deepEqual(
    verboseRun.outputValue().shared.default.react["18.3.1"].lib.location,
    {
      url: "https://cdn.test/assets/main.js",
      line: 120,
      column: 18,
      original: {
        source: "src/shared/react.ts",
        line: 14,
        column: 2
      }
    }
  );
  assert.equal(
    verboseRun.outputValue().shared.default.react["18.3.1"].loading,
    undefined
  );

  const disabledRun = createOptions(
    ["mf", "status"],
    new Map([["verbose", ["false"]]]),
    browserRead(state, [], { globalShared })
  );
  assert.equal(await runMfCommand(disabledRun.options), 0);
  assert.deepEqual(
    Object.keys(disabledRun.outputValue().shared.default.react),
    ["18.3.1"]
  );
});

test("status rejects an invalid --verbose value", async () => {
  const run = createOptions(
    ["mf", "status"],
    new Map([["verbose", ["sometimes"]]]),
    undefined
  );
  await assert.rejects(
    () => runMfCommand(run.options),
    (error) => error.code === "MF_COMMAND_OPTION_INVALID" &&
      /--verbose/.test(error.message)
  );
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
    (error) => error.code === "MF_OPEN_FLAG_REQUIRED" &&
      /require.*--mf/i.test(error.message) &&
      /divebell open <url> --mf/.test(error.hint)
  );
});

test("a compatible application reader still requires the page to be opened with --mf", async () => {
  const state = runtimeState({
    instances: [instance({
      instanceRef: "mf-1",
      name: "host",
      role: "consumer"
    })]
  });
  const run = createOptions(
    ["mf", "status"],
    new Map(),
    browserRead(state, [], {
      mode: "application",
      selectedScope: "runtime_host",
      availableScopes: ["runtime_host"],
      compatibleScopes: ["runtime_host"],
      marker: undefined
    })
  );
  await assert.rejects(
    () => runMfCommand(run.options),
    (error) => error.code === "MF_OPEN_FLAG_REQUIRED" &&
      /divebell open <url> --mf/.test(error.hint)
  );
});

test("missing Divebell page context has a dedicated recovery message", async () => {
  const run = createOptions(["mf", "status"], new Map(), undefined, {
    code: "OPEN_CONTEXT_REQUIRED",
    message: "No opened page context was found."
  });
  await assert.rejects(
    () => runMfCommand(run.options),
    (error) => error.code === "MF_PAGE_CONTEXT_REQUIRED" &&
      /divebell open <url> --mf/.test(error.hint)
  );
});

test("unknown MF commands return the compatible unified help error", async () => {
  const run = createOptions(["mf", "shared", "check"], new Map(), undefined);
  await assert.rejects(
    () => runMfCommand(run.options),
    (error) => error.code === "MF_COMMAND_INVALID" &&
      error.message === "Unknown mf subcommand `shared check`. Available commands: status, module-info, module-perf, remote status, remote trace, shared status, shared trace or bridge trace." &&
      /divebell mf status/.test(error.hint) &&
      /divebell mf module-info/.test(error.hint) &&
      /divebell mf module-perf/.test(error.hint) &&
      /divebell mf bridge trace/.test(error.hint) &&
      /divebell mf remote status/.test(error.hint) &&
      /divebell mf remote trace/.test(error.hint) &&
      /divebell mf shared status/.test(error.hint) &&
      /divebell mf shared trace/.test(error.hint)
  );
});

test("mf without a subcommand lists the same eight commands without adding help", async () => {
  const run = createOptions(["mf"], new Map(), undefined);
  await assert.rejects(
    () => runMfCommand(run.options),
    (error) => error.code === "MF_COMMAND_REQUIRED" &&
      /mf requires a subcommand/.test(error.message) &&
      /status, module-info, module-perf, remote status, remote trace, shared status, shared trace or bridge trace/.test(error.message) &&
      !/mf help/.test(`${error.message} ${error.hint}`)
  );
});

test("removed trace routes do not silently fall back to a new command", async () => {
  for (const command of [
    ["mf", "trace", "shop"],
    ["mf", "remote", "check", "shop"],
    ["mf", "preload", "trace", "shop"]
  ]) {
    const run = createOptions(command, new Map(), undefined);
    await assert.rejects(
      () => runMfCommand(run.options),
      (error) => error.code === "MF_COMMAND_INVALID"
    );
  }
});

test("module-perf rejects more than one positional target before reading the page", async () => {
  const run = createOptions(
    ["mf", "module-perf", "shop/Button", "shop/Card"],
    new Map(),
    undefined
  );
  await assert.rejects(
    () => runMfCommand(run.options),
    (error) => error.code === "MF_COMMAND_USAGE_INVALID" &&
      /at most one remote\/expose/.test(error.message) &&
      /divebell mf module-perf/.test(error.hint)
  );
});

test("module-perf validates the explicit terminal timeline view before reading the page", async () => {
  const missingReport = createOptions(
    ["mf", "module-perf"],
    new Map([["view", ["timeline"]]]),
    undefined
  );
  await assert.rejects(
    () => runMfCommand(missingReport.options),
    (error) => error.code === "MF_COMMAND_OPTION_INVALID" &&
      /requires --report/.test(error.message) &&
      /--report --view timeline/.test(error.hint)
  );

  const invalidView = createOptions(
    ["mf", "module-perf"],
    new Map([
      ["report", ["true"]],
      ["view", ["html"]]
    ]),
    undefined
  );
  await assert.rejects(
    () => runMfCommand(invalidView.options),
    (error) => error.code === "MF_COMMAND_OPTION_INVALID" &&
      /Invalid --view value/.test(error.message) &&
      /--view timeline/.test(error.hint)
  );
});

test("module-perf renders its terminal timeline through top-level stdout", async () => {
  const state = runtimeState({
    instances: [instance({
      instanceRef: "mf-1",
      name: "host",
      role: "consumer"
    })]
  });
  const reads = [browserRead(state), {
    schemaVersion: 1,
    installedAt: 1,
    page: {
      timeOrigin: 0,
      url: "https://app.test/",
      fp: 142,
      fcp: 231,
      lcp: 480,
      lcpStatus: "provisional"
    },
    resources: [],
    exposes: []
  }];
  let stdout = "";
  const result = await runMfCommand({
    args: {
      command: ["mf", "module-perf"],
      options: new Map([
        ["report", ["true"]],
        ["view", ["timeline"]]
      ])
    },
    stdout: {
      columns: 72,
      write(chunk) { stdout += chunk; }
    },
    fetcher: async () => new Response(),
    divebell: {
      browser: {
        async eval() { return reads.shift(); }
      }
    }
  });

  assert.equal(result.command, "mf module-perf --report");
  assert.equal(reads.length, 0);
  assert.match(stdout, /navigationStart = 0 ms/);
  assert.match(stdout, /FP 142 ms[\s\S]*FCP 231 ms[\s\S]*LCP 480 ms/);
  assert.doesNotMatch(stdout, /^\s*\{/);
});

test("module-perf timeline takes precedence over the legacy JSON output adapter", async () => {
  const state = runtimeState({
    instances: [instance({
      instanceRef: "mf-1",
      name: "host",
      role: "consumer"
    })]
  });
  const reads = [browserRead(state), {
    schemaVersion: 1,
    installedAt: 1,
    page: {
      timeOrigin: 0,
      url: "https://app.test/",
      fp: 142,
      fcp: 231,
      lcp: 480,
      lcpStatus: "provisional"
    },
    resources: [],
    exposes: []
  }];
  let stdout = "";
  let outputValue;
  const result = await runMfCommand({
    args: {
      command: ["mf", "module-perf"],
      options: new Map([
        ["report", ["true"]],
        ["view", ["timeline"]]
      ])
    },
    stdout: {
      columns: 72,
      write(chunk) { stdout += chunk; }
    },
    output: {
      ok(value) { outputValue = value; },
      needsInput() {},
      error() {}
    },
    fetcher: async () => new Response(),
    divebell: {
      browser: {
        async eval() { return reads.shift(); }
      }
    }
  });

  assert.equal(result, 0);
  assert.equal(outputValue, undefined);
  assert.equal(reads.length, 0);
  assert.match(stdout, /navigationStart = 0 ms/);
  assert.match(stdout, /FP 142 ms[\s\S]*FCP 231 ms[\s\S]*LCP 480 ms/);
  assert.doesNotMatch(stdout, /^\s*\{/);
});

test("candidate commands use the invoked mf or vmok command name", async () => {
  const duplicateState = runtimeState({
    instances: [
      instance({ instanceRef: "mf-1", name: "host", role: "consumer" }),
      instance({ instanceRef: "mf-2", name: "host", role: "consumer" })
    ]
  });
  for (const commandName of ["mf", "vmok"]) {
    const statusRun = createOptions(
      [commandName, "status", "host"],
      new Map(),
      browserRead(duplicateState)
    );
    await assert.rejects(
      () => runMfCommand(statusRun.options),
      (error) => error.code === "MF_INSTANCE_NAME_AMBIGUOUS" &&
        error.data.candidates[0].command ===
          `divebell ${commandName} status --instance "mf-1"`
    );

    const moduleRun = createOptions(
      [commandName, "module-info"],
      new Map([["instance", ["stale-ref"]]]),
      browserRead(duplicateState)
    );
    await assert.rejects(
      () => runMfCommand(moduleRun.options),
      (error) => error.code === "MF_INSTANCE_REF_NOT_FOUND" &&
        /--role consumer/.test(error.hint) &&
        error.data.candidates[0].command ===
          `divebell ${commandName} module-info --instance "mf-1"`
    );
  }
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
    new Map([["role", ["consumer"]], ["instance", ["mf-1"]]]),
    browserRead(state)
  );
  assert.equal(await runMfCommand(statusRun.options), 0);
  assert.deepEqual(statusRun.outputValue().instances.map((item) => item.instanceRef), [
    "mf-1"
  ]);

  const moduleRun = createOptions(
    ["mf", "module-info", "catalog"],
    new Map([["mf", ["host"]], ["instance", ["mf-1"]]]),
    browserRead(state)
  );
  assert.equal(await runMfCommand(moduleRun.options), 0);
  assert.equal(moduleRun.outputValue().remote.status, "declared");
  assert.equal(moduleRun.outputValue().compatibility, undefined);
  assert.equal(moduleRun.outputValue().capability, undefined);
});

test("status output remains byte-for-byte compatible with the compact fixture", async () => {
  const state = runtimeState({
    instances: [instance({ instanceRef: "mf-1", name: "host", role: "consumer" })]
  });
  const run = createOptions(
    ["mf", "status"],
    new Map(),
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
  shared: {}
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
      divebell: {
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
