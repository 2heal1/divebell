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

test("generated injection assets agree with their source metadata", () => {
  const bundle = readFileSync(new URL(
    "assets/observability-chrome-devtool.iife.js",
    packageRoot
  ), "utf8");
  const installer = readFileSync(new URL("assets/install-observability.js", packageRoot), "utf8");
  const metadata = JSON.parse(readFileSync(new URL(
    "assets/observability-build.json",
    packageRoot
  ), "utf8"));
  assert.equal(createHash("sha256").update(bundle).digest("hex"), metadata.bundleSha256);
  assert.match(installer, new RegExp(`PLUGIN_VERSION = ${JSON.stringify(metadata.packageVersion)}`));
  assert.match(metadata.sourceRevision, /^[0-9a-f]{40}$/);
  assert.equal(metadata.packageName, "@module-federation/observability-plugin");
  assert.doesNotMatch(`${bundle}\n${installer}\n${JSON.stringify(metadata)}`, /\/Users\/|outter\/core/);
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
