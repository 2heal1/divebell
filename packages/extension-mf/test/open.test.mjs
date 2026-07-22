import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import test from "node:test";

import { createOpenRuntimeCli } from "@openruntime/cli";
import { MF_BROWSER_READ_SCRIPT } from "../dist/reader.js";
import { openMfObservability } from "../dist/open.js";
import extension from "../dist/extension.js";

const packageRoot = new URL("..", import.meta.url);

test("navigation injection sources are unchanged by the command refactor", () => {
  assert.equal(sourceHash("assets/install-observability.js"), "a086beb71229d293da166c223aa7b2bc08f41e6ab932fd0f40dda5e51c019edf");
  assert.equal(sourceHash("assets/observability-chrome-devtool.iife.js"), "4444aae2dbbfdce1b0084d6387d95c6bab6373c73f65fb96cc8913be864da177");
  assert.equal(sourceHash("src/open.ts"), "221aca9bfcd3bdecc25aedffe70d50c4b863fc98b5bc43e541972236ecc904ed");
});

test("open hook returns one self-contained script built from the public chrome-devtool entry", async () => {
  const result = await openMfObservability();
  assert.equal(result.scripts.length, 1);
  const source = result.scripts[0];
  assert.match(source, /ChromeObservabilityPlugin/);
  assert.match(source, /getRuntimeState/);
  assert.match(source, /openruntime\/extension-mf/);
  assert.doesNotMatch(source, /\brequire\s*\(/);
  assert.doesNotMatch(source, /\bimport\s*\(/);
  assert.doesNotMatch(source, /<script|cdn\.jsdelivr|unpkg\.com/i);
});

function sourceHash(relativePath) {
  return createHash("sha256")
    .update(readFileSync(new URL(relativePath, packageRoot)))
    .digest("hex");
}

test("injection runs before business setup and observes more than one later MF instance", async () => {
  const [{ scripts }] = await Promise.all([openMfObservability()]);
  const context = vm.createContext({
    console: { log() {}, info() {}, warn() {}, error() {} },
    URL,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    postMessage() {}
  });
  context.globalThis = context;
  context.window = context;
  context.top = context;
  vm.runInContext(scripts[0], context, { timeout: 5_000 });

  assert.equal(context.__MF_OBSERVABILITY_INJECTION__.timing, "before-runtime");
  assert.equal(context.__FEDERATION__.__GLOBAL_PLUGIN__.length, 1);
  const plugin = context.__FEDERATION__.__GLOBAL_PLUGIN__[0];
  const first = {
    name: "host-a",
    version: "2.5.4",
    options: { name: "host-a", version: "1.0.0", remotes: [{ name: "remote-a" }] },
    moduleCache: new Map(),
    shareScopeMap: {}
  };
  const second = {
    name: "host-b",
    version: "2.5.4",
    options: { name: "host-b", version: "1.0.0", remotes: [{ name: "remote-b" }] },
    moduleCache: new Map(),
    shareScopeMap: {}
  };
  context.__FEDERATION__.__INSTANCES__ = [first, second];
  plugin.apply(first);
  plugin.apply(second);

  const result = vm.runInContext(MF_BROWSER_READ_SCRIPT, context, { timeout: 5_000 });
  assert.equal(result.ok, true);
  assert.equal(result.mode, "injected");
  assert.equal(result.state.instances.length, 2);
  assert.notEqual(result.state.instances[0].instanceRef, result.state.instances[1].instanceRef);
});

test("late installation marks history timing instead of claiming nothing happened", async () => {
  const { scripts } = await openMfObservability();
  const context = vm.createContext({
    console: { log() {}, info() {}, warn() {}, error() {} },
    URL,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    postMessage() {},
    __FEDERATION__: {
      __INSTANCES__: [{ name: "already-running" }],
      __GLOBAL_PLUGIN__: []
    }
  });
  context.globalThis = context;
  context.window = context;
  context.top = context;
  vm.runInContext(scripts[0], context, { timeout: 5_000 });
  assert.equal(context.__MF_OBSERVABILITY_INJECTION__.timing, "late");
});

test("OpenRuntime open passes the MF script as an init script before navigation", async () => {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "openruntime-mf-open-"));
  const cli = createOpenRuntimeCli({ extensions: [extension] });
  let initScriptChecked = false;
  let stdout = "";
  let stderr = "";
  try {
    const exitCode = await cli.run(["open", "https://app.test", "--no-bridge"], {
      stdout: { write(chunk) { stdout += chunk; } },
      stderr: { write(chunk) { stderr += chunk; } },
      operationLogDirectory,
      browserRunner: {
        async run(args) {
          assert.equal(args[0], "open");
          assert.equal(args[2], "--init-script");
          const initScriptPath = args[3];
          assert.equal(typeof initScriptPath, "string");
          const context = vm.createContext({
            console: { log() {}, info() {}, warn() {}, error() {} },
            URL,
            setTimeout,
            clearTimeout,
            queueMicrotask,
            postMessage() {}
          });
          context.globalThis = context;
          context.window = context;
          context.top = context;
          vm.runInContext(readFileSync(initScriptPath, "utf8"), context, { timeout: 5_000 });
          assert.equal(context.__MF_OBSERVABILITY_INJECTION__.timing, "before-runtime");
          context.__BUSINESS_SCRIPT_STARTED__ = true;
          assert.equal(context.__FEDERATION__.__GLOBAL_PLUGIN__.length, 1);
          initScriptChecked = true;
          return { exitCode: 0, stdout: "", stderr: "" };
        }
      }
    });
    assert.equal(exitCode, 0, stderr);
    assert.equal(initScriptChecked, true);
    assert.equal(JSON.parse(stdout).status, "ok");
  } finally {
    rmSync(operationLogDirectory, { recursive: true, force: true });
  }
});
