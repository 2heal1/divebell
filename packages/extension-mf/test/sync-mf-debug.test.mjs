import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  loadRuntimeCoreContext,
  loadRuntimeContext,
  synchronizeMfDebug
} from "../scripts/sync-mf-debug.mjs";

const fixtureVersion = "7.8.9-preview";
const fixtureRevision = "a".repeat(40);

function writeManifest(packageRoot, manifest) {
  mkdirSync(packageRoot, { recursive: true });
  writeFileSync(
    join(packageRoot, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
}

function createMatchedPackages(root) {
  const scopeRoot = join(root, "node_modules", "@module-federation");
  const observabilityRoot = join(scopeRoot, "observability-plugin");
  const runtimeRoot = join(scopeRoot, "runtime");
  const runtimeCoreRoot = join(scopeRoot, "runtime-core");

  writeManifest(observabilityRoot, {
    name: "@module-federation/observability-plugin",
    version: fixtureVersion,
    exports: {
      "./chrome-devtool": {
        import: "./dist/esm/chrome-devtool.js"
      }
    }
  });
  mkdirSync(join(observabilityRoot, "dist", "esm"), { recursive: true });
  writeFileSync(
    join(observabilityRoot, "dist", "esm", "chrome-devtool.js"),
    `export function ChromeObservabilityPlugin() {
      return { name: "observability-plugin:chrome-extension", apply() {} };
    }
    export default ChromeObservabilityPlugin;
    `
  );

  writeManifest(runtimeRoot, {
    name: "@module-federation/runtime",
    version: fixtureVersion,
    dependencies: {
      "@module-federation/runtime-core": fixtureVersion
    }
  });

  writeManifest(runtimeCoreRoot, {
    name: "@module-federation/runtime-core",
    version: fixtureVersion,
    exports: {
      ".": {
        import: {
          default: "./dist/index.js"
        }
      }
    }
  });
  mkdirSync(join(runtimeCoreRoot, "dist"), { recursive: true });
  writeFileSync(
    join(runtimeCoreRoot, "dist", "index.js"),
    `export class ModuleFederation {
      constructor(options) {
        this.name = options.name;
        this.version = ${JSON.stringify(fixtureVersion)};
      }
    }
    `
  );

  return { observabilityRoot, runtimeRoot, runtimeCoreRoot };
}

test("sync creates one exact-version Runtime, Runtime Core, and Observability set", async () => {
  const root = mkdtempSync(join(tmpdir(), "openruntime-mf-debug-sync-"));
  const assets = join(root, "assets");
  try {
    const packages = createMatchedPackages(root);
    const options = {
      mode: "sync",
      inputPackageRoot: packages.observabilityRoot,
      inputRuntimePackageRoot: packages.runtimeRoot,
      inputRuntimeCorePackageRoot: packages.runtimeCoreRoot,
      sourceRevision: fixtureRevision,
      requiredVersion: fixtureVersion,
      assetDirectory: assets
    };
    const result = await synchronizeMfDebug(options);
    await synchronizeMfDebug({ ...options, mode: "check" });

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
    assert.equal(result.version, fixtureVersion);
    assert.equal(result.runtime.packageVersion, fixtureVersion);
    assert.equal(result.runtimeCore.packageVersion, fixtureVersion);
    assert.equal(result.observability.packageVersion, fixtureVersion);
    assert.equal(runtimeMetadata.runtimePackageVersion, fixtureVersion);
    assert.equal(runtimeMetadata.packageVersion, fixtureVersion);
    assert.equal(observabilityMetadata.packageVersion, fixtureVersion);
    assert.equal(runtimeMetadata.sourceRevision, fixtureRevision);
    assert.equal(observabilityMetadata.sourceRevision, fixtureRevision);
    assert.equal(
      runtimeMetadata.bundleSha256,
      createHash("sha256").update(runtimeInstaller).digest("hex")
    );
    assert.doesNotMatch(runtimeInstaller, /sourceMappingURL|\/Users\/|outter\/core/);

    const context = vm.createContext({});
    context.globalThis = context;
    vm.runInContext(runtimeInstaller, context);
    assert.equal(typeof context.__FEDERATION__.__DEBUG_CONSTRUCTOR__, "function");
    assert.equal(
      context.__FEDERATION__.__DEBUG_CONSTRUCTOR_VERSION__,
      fixtureVersion
    );
    assert.equal(context.__MF_RUNTIME_DEBUG_INJECTION__.status, "installed");
    const instance = new context.__FEDERATION__.__DEBUG_CONSTRUCTOR__({
      name: "fixture"
    });
    assert.equal(instance.name, "fixture");
    assert.equal(instance.version, fixtureVersion);

    const firstConstructor = context.__FEDERATION__.__DEBUG_CONSTRUCTOR__;
    vm.runInContext(runtimeInstaller, context);
    assert.equal(context.__FEDERATION__.__DEBUG_CONSTRUCTOR__, firstConstructor);
    assert.equal(context.__MF_RUNTIME_DEBUG_INJECTION__.status, "already-installed");

    writeFileSync(join(assets, "runtime-debug-build.json"), "stale\n");
    await assert.rejects(
      synchronizeMfDebug({ ...options, mode: "check" }),
      /runtime-debug-build\.json/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("sync rejects any package that does not use the required version", async () => {
  const root = mkdtempSync(join(tmpdir(), "openruntime-mf-debug-mismatch-"));
  try {
    const packages = createMatchedPackages(root);
    const manifestPath = join(packages.observabilityRoot, "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.version = "different-version";
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await assert.rejects(
      synchronizeMfDebug({
        mode: "sync",
        inputPackageRoot: packages.observabilityRoot,
        inputRuntimePackageRoot: packages.runtimeRoot,
        inputRuntimeCorePackageRoot: packages.runtimeCoreRoot,
        sourceRevision: fixtureRevision,
        requiredVersion: fixtureVersion,
        assetDirectory: join(root, "assets")
      }),
      /All injected Module Federation packages must use/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Runtime must depend on the exact Runtime Core version", async () => {
  const root = mkdtempSync(join(tmpdir(), "openruntime-mf-runtime-core-"));
  try {
    const packages = createMatchedPackages(root);
    const manifestPath = join(packages.runtimeRoot, "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.dependencies["@module-federation/runtime-core"] = "other-version";
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await assert.rejects(
      generateRuntimeDebugArtifacts({
        inputRuntimePackageRoot: packages.runtimeRoot,
        inputRuntimeCorePackageRoot: packages.runtimeCoreRoot,
        sourceRevision: fixtureRevision
      }),
      /must depend on the exact Runtime Core version/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Runtime package validation rejects wrong packages and missing public entries", async () => {
  await assert.rejects(loadRuntimeContext(), /--runtime-package-root/);
  await assert.rejects(
    loadRuntimeCoreContext("/path/that/does/not/exist"),
    /does not exist/
  );

  const root = mkdtempSync(join(tmpdir(), "openruntime-mf-debug-invalid-"));
  try {
    const wrong = join(root, "wrong");
    writeManifest(wrong, { name: "not-the-runtime", version: "1.0.0" });
    await assert.rejects(loadRuntimeContext(wrong), /Expected package name/);

    const missing = join(root, "missing");
    writeManifest(missing, {
      name: "@module-federation/runtime-core",
      version: "1.0.0",
      exports: { ".": { import: "./dist/index.js" } }
    });
    await assert.rejects(
      loadRuntimeCoreContext(missing),
      /public entry does not exist/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
