import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import test from "node:test";

import {
  generateRuntimeDebugArtifacts,
  loadRuntimeDebugContext,
  synchronizeMfDebug
} from "../scripts/sync-mf-debug.mjs";

function createMatchedPackages(root) {
  const observabilityRoot = join(root, "packages", "observability-plugin");
  const runtimeRoot = join(root, "packages", "runtime");
  mkdirSync(join(observabilityRoot, "dist", "esm"), { recursive: true });
  mkdirSync(join(runtimeRoot, "dist", "debug"), { recursive: true });

  writeFileSync(
    join(observabilityRoot, "package.json"),
    `${JSON.stringify({
      name: "@module-federation/observability-plugin",
      version: "4.5.6",
      exports: {
        "./chrome-devtool": {
          import: "./dist/esm/chrome-devtool.js",
          require: "./dist/chrome-devtool.js"
        }
      }
    }, null, 2)}\n`
  );
  writeFileSync(
    join(observabilityRoot, "dist", "esm", "chrome-devtool.js"),
    `export function ChromeObservabilityPlugin() {
      return { name: "observability-plugin:chrome-extension", apply() {} };
    }
    export default ChromeObservabilityPlugin;
    `
  );

  writeFileSync(
    join(runtimeRoot, "package.json"),
    `${JSON.stringify({
      name: "@module-federation/runtime",
      version: "7.8.9"
    }, null, 2)}\n`
  );
  writeFileSync(
    join(runtimeRoot, "dist", "debug", "index.iife.js"),
    `var ModuleFederationRuntime = (function(exports) {
      const target = globalThis;
      target.__FEDERATION__ ??= {};
      class ModuleFederation {}
      target.__FEDERATION__.__DEBUG_CONSTRUCTOR__ = ModuleFederation;
      target.__FEDERATION__.__DEBUG_CONSTRUCTOR_VERSION__ = "7.8.9";
      exports.ModuleFederation = ModuleFederation;
      return exports;
    })({});
    //# sourceMappingURL=index.iife.js.map
    `
  );

  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@openruntime.dev"], { cwd: root });
  execFileSync("git", ["config", "user.name", "OpenRuntime Test"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
  return { observabilityRoot, runtimeRoot };
}

test("sync creates a matched debug Runtime and Observability pair", async () => {
  const root = mkdtempSync(join(tmpdir(), "openruntime-mf-debug-sync-"));
  const assets = join(root, "assets");
  try {
    const { observabilityRoot, runtimeRoot } = createMatchedPackages(root);
    const result = await synchronizeMfDebug({
      mode: "sync",
      inputPackageRoot: observabilityRoot,
      inputRuntimePackageRoot: runtimeRoot,
      assetDirectory: assets
    });
    await synchronizeMfDebug({
      mode: "check",
      inputPackageRoot: observabilityRoot,
      inputRuntimePackageRoot: runtimeRoot,
      assetDirectory: assets
    });

    const runtimeInstaller = readFileSync(
      join(assets, "install-runtime-debug.js"),
      "utf8"
    );
    const runtimeMetadata = JSON.parse(
      readFileSync(join(assets, "runtime-debug-build.json"), "utf8")
    );
    const observabilityMetadata = JSON.parse(
      readFileSync(join(assets, "observability-build.json"), "utf8")
    );
    assert.equal(result.runtime.packageVersion, "7.8.9");
    assert.equal(result.observability.packageVersion, "4.5.6");
    assert.equal(runtimeMetadata.sourceRevision, observabilityMetadata.sourceRevision);
    assert.equal(
      runtimeMetadata.bundleSha256,
      createHash("sha256").update(runtimeInstaller).digest("hex")
    );
    assert.doesNotMatch(runtimeInstaller, /sourceMappingURL|\/Users\/|outter\/core/);

    const context = vm.createContext({});
    context.globalThis = context;
    vm.runInContext(runtimeInstaller, context);
    assert.equal(typeof context.__FEDERATION__.__DEBUG_CONSTRUCTOR__, "function");
    assert.equal(context.__FEDERATION__.__DEBUG_CONSTRUCTOR_VERSION__, "7.8.9");
    assert.equal(context.__MF_RUNTIME_DEBUG_INJECTION__.status, "installed");

    const firstConstructor = context.__FEDERATION__.__DEBUG_CONSTRUCTOR__;
    vm.runInContext(runtimeInstaller, context);
    assert.equal(context.__FEDERATION__.__DEBUG_CONSTRUCTOR__, firstConstructor);
    assert.equal(context.__MF_RUNTIME_DEBUG_INJECTION__.status, "already-installed");

    writeFileSync(join(assets, "runtime-debug-build.json"), "stale\n");
    await assert.rejects(
      synchronizeMfDebug({
        mode: "check",
        inputPackageRoot: observabilityRoot,
        inputRuntimePackageRoot: runtimeRoot,
        assetDirectory: assets
      }),
      /runtime-debug-build\.json/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Runtime debug package validation rejects wrong packages and missing builds", async () => {
  await assert.rejects(loadRuntimeDebugContext(), /--runtime-package-root/);
  await assert.rejects(
    loadRuntimeDebugContext("/path/that/does/not/exist"),
    /does not exist/
  );

  const root = mkdtempSync(join(tmpdir(), "openruntime-mf-debug-invalid-"));
  try {
    const wrong = join(root, "wrong");
    mkdirSync(wrong);
    writeFileSync(
      join(wrong, "package.json"),
      JSON.stringify({ name: "not-the-runtime", version: "1.0.0" })
    );
    await assert.rejects(loadRuntimeDebugContext(wrong), /Expected package name/);

    const missing = join(root, "missing");
    mkdirSync(missing);
    writeFileSync(
      join(missing, "package.json"),
      JSON.stringify({
        name: "@module-federation/runtime",
        version: "1.0.0"
      })
    );
    await assert.rejects(
      loadRuntimeDebugContext(missing),
      /build-debug script first/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Runtime debug generation rejects a bundle whose embedded version does not match", async () => {
  const root = mkdtempSync(join(tmpdir(), "openruntime-mf-debug-version-"));
  try {
    const { runtimeRoot } = createMatchedPackages(root);
    writeFileSync(
      join(runtimeRoot, "dist", "debug", "index.iife.js"),
      `var ModuleFederationRuntime = {};
      globalThis.__FEDERATION__ = { __DEBUG_CONSTRUCTOR__: function Debug() {} };
      globalThis.__FEDERATION__.__DEBUG_CONSTRUCTOR_VERSION__ = "0.0.1";
      `
    );
    await assert.rejects(
      generateRuntimeDebugArtifacts(runtimeRoot),
      /does not contain its package version/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
