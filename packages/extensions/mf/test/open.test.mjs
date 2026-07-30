import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import test from "node:test";

import { createDivebellCli } from "@divebell/cli";
import { MF_BROWSER_READ_SCRIPT } from "../dist/reader.js";
import { openMfObservability } from "../dist/open.js";
import extension from "../dist/extension.js";

const packageRoot = new URL("..", import.meta.url);
const injectedMfVersion = JSON.parse(
  readFileSync(
    new URL("assets/runtime-debug-build.json", packageRoot),
    "utf8"
  )
).packageVersion;

function mfOpenArgs(extraOptions = []) {
  return {
    command: ["open", "https://app.test"],
    options: new Map([["mf", ["true"]], ...extraOptions])
  };
}

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
  const proxyBundle = readFileSync(new URL(
    "assets/vmok-proxy-sdk.iife.js",
    packageRoot
  ), "utf8");
  const proxyMetadata = JSON.parse(readFileSync(new URL(
    "assets/proxy-sdk-build.json",
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
  assert.equal(
    createHash("sha256").update(proxyBundle).digest("hex"),
    proxyMetadata.bundleSha256
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
  assert.equal(proxyMetadata.packageName, "@vmok/proxy-sdk");
  assert.equal(proxyMetadata.packageVersion, "1.25.1");
  assert.equal(
    runtimeMetadata.runtimePackageVersion,
    runtimeMetadata.packageVersion
  );
  assert.match(runtimeMetadata.packageVersion, /^\d+\.\d+\.\d+/);
  assert.match(observabilityMetadata.packageVersion, /^\d+\.\d+\.\d+/);
  assert.doesNotMatch(bundle, /\b(?:inputOptions|getInputOptions)\b/);
  assert.doesNotMatch(
    `${bundle}\n${installer}\n${runtimeInstaller}\n${JSON.stringify({
      observabilityMetadata,
      runtimeMetadata,
      proxyMetadata
    })}`,
    /\/Users\/|outter\/core/
  );
});

test("open hook returns one self-contained script with matched Runtime and Observability installers", async () => {
  const result = await openMfObservability(mfOpenArgs());
  assert.equal(result.scripts.length, 1);
  const source = result.scripts[0];
  assert.match(source, /ModuleFederationDebugRuntime/);
  assert.match(source, /__DEBUG_CONSTRUCTOR__/);
  assert.match(source, /ChromeObservabilityPlugin/);
  assert.match(source, /getRuntimeState/);
  assert.match(source, /divebell\/extension-mf/);
  assert.doesNotMatch(source, /\bVmokProxySdk\b/);
  assert.doesNotMatch(source, /\brequire\s*\(/);
  assert.doesNotMatch(source, /^\s*import\s/m);
  assert.doesNotMatch(source, /https?:\/\/(?:cdn\.jsdelivr\.net|unpkg\.com)/i);
});

test("injection installs the debug constructor before business setup and observes later MF instances", async () => {
  const [{ scripts }] = await Promise.all([
    openMfObservability(mfOpenArgs())
  ]);
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
  const { scripts } = await openMfObservability(mfOpenArgs());
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
  const { scripts } = await openMfObservability(mfOpenArgs());
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
  const { scripts } = await openMfObservability(mfOpenArgs());
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

test("ordinary open skips Runtime and Observability but retains proxy cleanup", async () => {
  const result = await openMfObservability();
  assert.equal(result.scripts.length, 1);
  assert.match(result.scripts[0], /__DIVEBELL_MF_PROXY_OWNER__/);
  assert.doesNotMatch(result.scripts[0], /ModuleFederationDebugRuntime/);
  assert.doesNotMatch(result.scripts[0], /ChromeObservabilityPlugin/);
});

test("MF proxy is installed before Runtime and Observability and matches an alias", async () => {
  const { scripts } = await openMfObservability(mfOpenArgs([
    ["mf-proxy", ["shop=2.0.0"]]
  ]));
  const source = scripts[0];
  assert.ok(source.indexOf("VmokProxySdk") < source.indexOf("ModuleFederationDebugRuntime"));
  assert.ok(source.indexOf("ModuleFederationDebugRuntime") < source.indexOf("ChromeObservabilityPlugin"));
  const storage = createTestStorage();
  const context = vm.createContext({
    console: { log() {}, info() {}, warn() {}, error() {} },
    localStorage: storage,
    URL,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    postMessage() {}
  });
  context.globalThis = context;
  context.window = context;
  context.top = context;
  vm.runInContext(source, context, { timeout: 5_000 });
  assert.equal(context.__DIVEBELL_MF_PROXY_INJECTION__.status, "installed");
  assert.deepEqual(
    [...context.__FEDERATION__.__GLOBAL_PLUGIN__].map((plugin) => plugin.name),
    [
      "mf-chrome-devtools-override-remotes-plugin",
      "mf-chrome-devtools-inject-snapshot-plugin",
      "divebell-mf-proxy-snapshot-override",
      "observability-plugin:chrome-extension"
    ]
  );
  const instance = new context.__FEDERATION__.__DEBUG_CONSTRUCTOR__({
    name: "host",
    remotes: [{
      name: "catalog",
      alias: "shop",
      entry: "https://cdn.test/catalog/mf-manifest.json"
    }]
  });
  assert.equal(instance.options.remotes[0].version, "2.0.0");
  assert.equal(instance.options.remotes[0].entry, undefined);
  context.__FEDERATION__.moduleInfo = {
    host: {
      remotesInfo: {
        catalog: {
          matchedVersion: "https://cdn.test/catalog/mf-manifest.json"
        }
      }
    }
  };
  context.__FEDERATION__.__GLOBAL_PLUGIN__[2].beforeLoadRemoteSnapshot({
    moduleInfo: instance.options.remotes[0],
    origin: instance
  });
  assert.equal(
    context.__FEDERATION__.moduleInfo.host.remotesInfo.catalog.matchedVersion,
    "2.0.0"
  );
});

test("invalid --mf values fail with a useful message", async () => {
  await assert.rejects(
    openMfObservability({
      command: ["open", "https://app.test"],
      options: new Map([["mf", ["sometimes"]]])
    }),
    /Use --mf to enable MF debugging or omit it/
  );
});

test("Divebell open passes the MF script as an init script before navigation", async () => {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-mf-open-"));
  const cli = createDivebellCli({ extensions: [extension] });
  let initScriptChecked = false;
  let injectedScriptPath;
  let stdout = "";
  let stderr = "";
  try {
    const exitCode = await cli.run([
      "open",
      "https://app.test",
      "--no-bridge",
      "--mf"
    ], {
      stdout: { write(chunk) { stdout += chunk; } },
      stderr: { write(chunk) { stderr += chunk; } },
      operationLogDirectory,
      browserRunner: {
        async run(args) {
          assert.equal(args[0], "open");
          assert.equal(args[2], "--init-script");
          const initScriptPath = args[3];
          assert.equal(typeof initScriptPath, "string");
          injectedScriptPath = initScriptPath;
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
    const output = JSON.parse(stdout);
    assert.equal(output.status, "ok");
    assert.equal(output.data.injectedScriptPath, injectedScriptPath);
  } finally {
    rmSync(operationLogDirectory, { recursive: true, force: true });
  }
});

test("Divebell open accepts a local --mf-proxy JSON file", async () => {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-mf-proxy-open-"));
  const proxyFile = join(operationLogDirectory, "proxy.json");
  writeFileSync(proxyFile, JSON.stringify({
    overrides: {
      shop: "2.0.0"
    }
  }));
  const cli = createDivebellCli({ extensions: [extension] });
  let stdout = "";
  let stderr = "";
  try {
    const exitCode = await cli.run([
      "open",
      "https://app.test",
      "--no-bridge",
      "--mf-proxy",
      proxyFile
    ], {
      stdout: { write(chunk) { stdout += chunk; } },
      stderr: { write(chunk) { stderr += chunk; } },
      operationLogDirectory,
      browserRunner: {
        async run(args) {
          const initScriptPath = args[args.indexOf("--init-script") + 1];
          const context = vm.createContext({
            console: { log() {}, info() {}, warn() {}, error() {} },
            localStorage: createTestStorage(),
            URL,
            setTimeout,
            clearTimeout,
            queueMicrotask,
            postMessage() {}
          });
          context.globalThis = context;
          context.window = context;
          context.top = context;
          vm.runInContext(readFileSync(initScriptPath, "utf8"), context, {
            timeout: 5_000
          });
          assert.deepEqual(
            { ...context.__DIVEBELL_MF_PROXY_INJECTION__.overrides },
            { shop: "2.0.0" }
          );
          assert.equal(context.__MF_RUNTIME_DEBUG_INJECTION__, undefined);
          assert.equal(context.__MF_OBSERVABILITY_INJECTION__, undefined);
          return { exitCode: 0, stdout: "", stderr: "" };
        }
      }
    });
    assert.equal(exitCode, 0, stderr);
    assert.equal(JSON.parse(stdout).status, "ok");
  } finally {
    rmSync(operationLogDirectory, { recursive: true, force: true });
  }
});

test("ordinary Divebell open keeps only proxy cleanup", async () => {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-mf-disabled-"));
  const cli = createDivebellCli({ extensions: [extension] });
  let stdout = "";
  let stderr = "";
  try {
    const exitCode = await cli.run(
      ["open", "https://app.test", "--no-bridge"],
      {
        stdout: { write(chunk) { stdout += chunk; } },
        stderr: { write(chunk) { stderr += chunk; } },
        operationLogDirectory,
        browserRunner: {
          async run(args) {
            assert.equal(args[0], "open");
            assert.match(args[1], /^https:\/\/app\.test/);
            assert.equal(args.includes("--init-script"), true);
            const initScriptPath = args[args.indexOf("--init-script") + 1];
            const source = readFileSync(initScriptPath, "utf8");
            assert.match(source, /__DIVEBELL_MF_PROXY_OWNER__/);
            assert.doesNotMatch(source, /ModuleFederationDebugRuntime/);
            assert.doesNotMatch(source, /ChromeObservabilityPlugin/);
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

function createTestStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}
