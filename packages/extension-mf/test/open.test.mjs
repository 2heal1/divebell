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
const injectedMfVersion =
  "0.0.0-feat-operate-openruntime-20260722064424";

test("generated injection assets agree with their source metadata", () => {
  const bundle = readFileSync(new URL(
    "assets/observability-chrome-devtool.iife.js",
    packageRoot
  ), "utf8");
  const installer = readFileSync(new URL("assets/install-observability.js", packageRoot), "utf8");
  const observabilityMetadata = JSON.parse(readFileSync(new URL(
    "assets/observability-build.json",
    packageRoot
  ), "utf8"));
  const runtimeInstaller = readFileSync(
    new URL("assets/install-runtime-debug.js", packageRoot),
    "utf8"
  );
  const runtimeMetadata = JSON.parse(readFileSync(new URL(
    "assets/runtime-debug-build.json",
    packageRoot
  ), "utf8"));
  assert.equal(
    createHash("sha256").update(bundle).digest("hex"),
    observabilityMetadata.bundleSha256
  );
  assert.equal(
    createHash("sha256").update(runtimeInstaller).digest("hex"),
    runtimeMetadata.bundleSha256
  );
  assert.match(
    installer,
    new RegExp(`PLUGIN_VERSION = ${JSON.stringify(observabilityMetadata.packageVersion)}`)
  );
  assert.match(
    runtimeInstaller,
    new RegExp(`RUNTIME_VERSION = ${JSON.stringify(runtimeMetadata.packageVersion)}`)
  );
  assert.match(observabilityMetadata.sourceRevision, /^[0-9a-f]{40}$/);
  assert.equal(runtimeMetadata.sourceRevision, observabilityMetadata.sourceRevision);
  assert.equal(observabilityMetadata.packageName, "@module-federation/observability-plugin");
  assert.equal(runtimeMetadata.runtimePackageName, "@module-federation/runtime");
  assert.equal(runtimeMetadata.packageName, "@module-federation/runtime-core");
  assert.equal(runtimeMetadata.runtimePackageVersion, injectedMfVersion);
  assert.equal(runtimeMetadata.packageVersion, injectedMfVersion);
  assert.equal(observabilityMetadata.packageVersion, injectedMfVersion);
  assert.doesNotMatch(
    `${bundle}\n${installer}\n${runtimeInstaller}\n${JSON.stringify({
      observabilityMetadata,
      runtimeMetadata
    })}`,
    /\/Users\/|outter\/core/
  );
});

test("open hook returns one self-contained script with matched Runtime and Observability installers", async () => {
  const result = await openMfObservability();
  assert.equal(result.scripts.length, 1);
  const source = result.scripts[0];
  assert.match(source, /ModuleFederationDebugRuntime/);
  assert.match(source, /__DEBUG_CONSTRUCTOR__/);
  assert.match(source, /ChromeObservabilityPlugin/);
  assert.match(source, /getRuntimeState/);
  assert.match(source, /openruntime\/extension-mf/);
  assert.doesNotMatch(source, /\brequire\s*\(/);
  assert.doesNotMatch(source, /^\s*import\s/m);
  assert.doesNotMatch(source, /https?:\/\/(?:cdn\.jsdelivr\.net|unpkg\.com)/i);
});

test("injection installs the debug constructor before business setup and observes later MF instances", async () => {
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

  assert.equal(context.__MF_RUNTIME_DEBUG_INJECTION__.timing, "before-runtime");
  assert.equal(
    context.__MF_RUNTIME_DEBUG_INJECTION__.runtimeVersion,
    injectedMfVersion
  );
  assert.equal(typeof context.__FEDERATION__.__DEBUG_CONSTRUCTOR__, "function");
  assert.equal(
    context.__FEDERATION__.__DEBUG_CONSTRUCTOR_VERSION__,
    injectedMfVersion
  );
  const applicationFallback = function ApplicationModuleFederation() {};
  const ConstructorUsedByApplication =
    context.__FEDERATION__.__DEBUG_CONSTRUCTOR__ ?? applicationFallback;
  const debugInstance = new ConstructorUsedByApplication({
    name: "debug-host",
    version: "1.0.0",
    remotes: []
  });
  assert.equal(debugInstance.constructor, context.__FEDERATION__.__DEBUG_CONSTRUCTOR__);
  assert.equal(debugInstance.name, "debug-host");
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
  assert.equal(result.state.instances.length, 3);
  assert.deepEqual(
    [...result.state.instances.map((instance) => instance.name)].sort(),
    ["debug-host", "host-a", "host-b"]
  );
  assert.equal(
    new Set(result.state.instances.map((instance) => instance.instanceRef)).size,
    3
  );
});

test("repeated injection keeps the matching debug constructor and global plugin", async () => {
  const { scripts } = await openMfObservability();
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
  const firstConstructor = context.__FEDERATION__.__DEBUG_CONSTRUCTOR__;
  const firstPlugin = context.__FEDERATION__.__GLOBAL_PLUGIN__[0];
  vm.runInContext(scripts[0], context, { timeout: 5_000 });

  assert.equal(context.__MF_RUNTIME_DEBUG_INJECTION__.status, "already-installed");
  assert.equal(context.__MF_OBSERVABILITY_INJECTION__.status, "already-installed");
  assert.equal(context.__FEDERATION__.__DEBUG_CONSTRUCTOR__, firstConstructor);
  assert.equal(context.__FEDERATION__.__GLOBAL_PLUGIN__.length, 1);
  assert.equal(context.__FEDERATION__.__GLOBAL_PLUGIN__[0], firstPlugin);
});

test("injection replaces a mismatched debug constructor before Runtime creates instances", async () => {
  const { scripts } = await openMfObservability();
  const oldConstructor = function OldModuleFederation() {};
  const context = vm.createContext({
    console: { log() {}, info() {}, warn() {}, error() {} },
    URL,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    postMessage() {},
    __FEDERATION__: {
      __DEBUG_CONSTRUCTOR__: oldConstructor,
      __DEBUG_CONSTRUCTOR_VERSION__: "1.0.0",
      __INSTANCES__: [],
      __GLOBAL_PLUGIN__: []
    }
  });
  context.globalThis = context;
  context.window = context;
  context.top = context;
  vm.runInContext(scripts[0], context, { timeout: 5_000 });

  assert.notEqual(context.__FEDERATION__.__DEBUG_CONSTRUCTOR__, oldConstructor);
  assert.equal(
    context.__FEDERATION__.__DEBUG_CONSTRUCTOR_VERSION__,
    injectedMfVersion
  );
  assert.equal(context.__MF_RUNTIME_DEBUG_INJECTION__.status, "installed");
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
  assert.equal(context.__MF_RUNTIME_DEBUG_INJECTION__.timing, "late");
  assert.equal(context.__MF_OBSERVABILITY_INJECTION__.timing, "late");
});

test("--mf-debug=false disables both Runtime and Observability injection", async () => {
  const result = await openMfObservability({
    command: ["open", "https://app.test"],
    options: new Map([["mf-debug", ["false"]]])
  });
  assert.deepEqual(result, { scripts: [] });
});

test("invalid --mf-debug values fail with a useful message", async () => {
  await assert.rejects(
    openMfObservability({
      command: ["open", "https://app.test"],
      options: new Map([["mf-debug", ["sometimes"]]])
    }),
    /Use --mf-debug=true or --mf-debug=false/
  );
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
          assert.equal(context.__MF_RUNTIME_DEBUG_INJECTION__.timing, "before-runtime");
          assert.equal(typeof context.__FEDERATION__.__DEBUG_CONSTRUCTOR__, "function");
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

test("OpenRuntime open omits the MF init script when --mf-debug=false", async () => {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "openruntime-mf-disabled-"));
  const cli = createOpenRuntimeCli({ extensions: [extension] });
  let stdout = "";
  let stderr = "";
  try {
    const exitCode = await cli.run(
      ["open", "https://app.test", "--no-bridge", "--mf-debug=false"],
      {
        stdout: { write(chunk) { stdout += chunk; } },
        stderr: { write(chunk) { stderr += chunk; } },
        operationLogDirectory,
        browserRunner: {
          async run(args) {
            assert.equal(args[0], "open");
            assert.match(args[1], /^https:\/\/app\.test/);
            assert.equal(args.includes("--init-script"), false);
            return { exitCode: 0, stdout: "", stderr: "" };
          }
        }
      }
    );
    assert.equal(exitCode, 0, stderr);
    assert.equal(JSON.parse(stdout).status, "ok");
  } finally {
    rmSync(operationLogDirectory, { recursive: true, force: true });
  }
});
