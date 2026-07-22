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
  generateObservabilityArtifacts,
  loadPackageContext,
  synchronizeObservability
} from "../scripts/sync-observability.mjs";

function createPackageFixture(root, overrides = {}) {
  const packageRoot = join(root, "observability-plugin");
  const entryDirectory = join(packageRoot, "dist", "esm");
  mkdirSync(entryDirectory, { recursive: true });
  writeFileSync(join(packageRoot, "package.json"), `${JSON.stringify({
    name: "@module-federation/observability-plugin",
    version: "9.8.7",
    exports: {
      "./chrome-devtool": {
        import: "./dist/esm/chrome-devtool.js",
        require: "./dist/chrome-devtool.js"
      }
    },
    ...overrides
  }, null, 2)}\n`);
  writeFileSync(
    join(entryDirectory, "chrome-devtool.js"),
    `export function ChromeObservabilityPlugin() {
      return { name: "observability-plugin:chrome-extension", apply() {} };
    }
    export default ChromeObservabilityPlugin;
    `
  );
  execFileSync("git", ["init", "-q"], { cwd: packageRoot });
  execFileSync("git", ["config", "user.email", "test@openruntime.dev"], { cwd: packageRoot });
  execFileSync("git", ["config", "user.name", "OpenRuntime Test"], { cwd: packageRoot });
  execFileSync("git", ["add", "."], { cwd: packageRoot });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: packageRoot });
  return packageRoot;
}

test("sync and check share one deterministic public-entry build", async () => {
  const root = mkdtempSync(join(tmpdir(), "openruntime-mf-sync-"));
  const assets = join(root, "assets");
  try {
    const packageRoot = createPackageFixture(root);
    const first = await generateObservabilityArtifacts(packageRoot);
    const second = await generateObservabilityArtifacts(packageRoot);
    assert.equal(first.bundle, second.bundle);
    assert.equal(first.installer, second.installer);
    assert.equal(first.metadata, second.metadata);
    assert.equal(first.context.publicEntry, "./dist/esm/chrome-devtool.js");
    assert.equal(first.context.packageVersion, "9.8.7");

    const synced = await synchronizeObservability({
      mode: "sync",
      inputPackageRoot: packageRoot,
      assetDirectory: assets
    });
    await synchronizeObservability({
      mode: "check",
      inputPackageRoot: packageRoot,
      assetDirectory: assets
    });

    const bundle = readFileSync(join(assets, "observability-chrome-devtool.iife.js"), "utf8");
    const installer = readFileSync(join(assets, "install-observability.js"), "utf8");
    const metadataSource = readFileSync(join(assets, "observability-build.json"), "utf8");
    const metadata = JSON.parse(metadataSource);
    assert.equal(metadata.packageName, "@module-federation/observability-plugin");
    assert.equal(metadata.packageVersion, "9.8.7");
    assert.equal(metadata.sourceRevision, synced.sourceRevision);
    assert.equal(
      metadata.bundleSha256,
      createHash("sha256").update(bundle).digest("hex")
    );
    assert.doesNotMatch(bundle, /\brequire\s*\(|\bimport\s*\(|\bimport\s+[\w{*]/);
    assert.doesNotMatch(bundle, /\/Users\/|sourceMappingURL|cdn\.jsdelivr|unpkg\.com/i);
    assert.doesNotMatch(metadataSource, /\/Users\/|openruntime-mf-sync-/);

    const context = vm.createContext({
      console: { log() {}, info() {}, warn() {}, error() {} }
    });
    context.globalThis = context;
    vm.runInContext(bundle, context);
    assert.equal(typeof context.ModuleFederationChromeObservabilityPlugin.ChromeObservabilityPlugin, "function");
    vm.runInContext(installer, context);
    assert.equal(context.__FEDERATION__.__GLOBAL_PLUGIN__.length, 1);
    assert.equal(context.__MF_OBSERVABILITY_INJECTION__.observabilityVersion, "9.8.7");

    writeFileSync(join(assets, "install-observability.js"), "stale\n");
    await assert.rejects(
      synchronizeObservability({
        mode: "check",
        inputPackageRoot: packageRoot,
        assetDirectory: assets
      }),
      /assets are stale/
    );
    assert.equal(readFileSync(join(assets, "install-observability.js"), "utf8"), "stale\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("package root validation rejects missing, wrong, and private entries", async () => {
  await assert.rejects(loadPackageContext(), /--package-root/);
  await assert.rejects(loadPackageContext("/path/that/does/not/exist"), /does not exist/);

  const root = mkdtempSync(join(tmpdir(), "openruntime-mf-invalid-"));
  try {
    const wrongName = join(root, "wrong-name");
    mkdirSync(wrongName);
    writeFileSync(join(wrongName, "package.json"), JSON.stringify({
      name: "not-the-observability-plugin",
      version: "1.0.0"
    }));
    await assert.rejects(loadPackageContext(wrongName), /Expected package name/);

    const privateEntry = join(root, "private-entry");
    mkdirSync(join(privateEntry, "src"), { recursive: true });
    writeFileSync(join(privateEntry, "src", "chrome-devtool.js"), "export default () => ({});");
    writeFileSync(join(privateEntry, "package.json"), JSON.stringify({
      name: "@module-federation/observability-plugin",
      version: "1.0.0",
      exports: { "./chrome-devtool": "./src/chrome-devtool.js" }
    }));
    await assert.rejects(loadPackageContext(privateEntry), /private source code/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
