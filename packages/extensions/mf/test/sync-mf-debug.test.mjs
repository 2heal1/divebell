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
  parseCliArguments,
  resolvePublishedMfRelease,
  synchronizeMfDebugFromTag,
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

function createMatchedPackages(
  root,
  {
    observabilityVersion = fixtureVersion,
    runtimeVersion = fixtureVersion
  } = {}
) {
  const scopeRoot = join(root, "node_modules", "@module-federation");
  const observabilityRoot = join(scopeRoot, "observability-plugin");
  const runtimeRoot = join(scopeRoot, "runtime");
  const runtimeCoreRoot = join(scopeRoot, "runtime-core");

  writeManifest(observabilityRoot, {
    name: "@module-federation/observability-plugin",
    version: observabilityVersion,
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
      return {
        name: "observability-plugin:chrome-extension",
        apply() {},
        getRuntimeState() { return { instances: [] }; }
      };
    }
    export default ChromeObservabilityPlugin;
    `
  );

  writeManifest(runtimeRoot, {
    name: "@module-federation/runtime",
    version: runtimeVersion,
    dependencies: {
      "@module-federation/runtime-core": runtimeVersion
    }
  });

  writeManifest(runtimeCoreRoot, {
    name: "@module-federation/runtime-core",
    version: runtimeVersion,
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
        this.version = ${JSON.stringify(runtimeVersion)};
      }
    }
    `
  );

  return { observabilityRoot, runtimeRoot, runtimeCoreRoot };
}

function createPublishedReleaseFakes({
  observabilityVersion = "2.5.5",
  runtimeVersion = "2.8.1"
} = {}) {
  const calls = [];
  const versions = new Map([
    ["@module-federation/observability-plugin", observabilityVersion],
    ["@module-federation/runtime", runtimeVersion],
    ["@module-federation/runtime-core", runtimeVersion]
  ]);
  const attestationUrls = new Map(
    [...versions].map(([packageName, version]) => [
      `https://registry.npmjs.org/attestations/${encodeURIComponent(packageName)}@${version}`,
      { packageName, version }
    ])
  );
  const createAttestations = (packageName, version) => ({
    attestations: [
      {
        predicateType: "https://slsa.dev/provenance/v1",
        bundle: {
          dsseEnvelope: {
            payload: Buffer.from(
              JSON.stringify({
                subject: [
                  {
                    name: `pkg:npm/${packageName.replace("@", "%40")}@${version}`
                  }
                ],
                predicate: {
                  buildDefinition: {
                    resolvedDependencies: [
                      {
                        uri: "git+https://github.com/module-federation/core@refs/heads/main",
                        digest: { gitCommit: fixtureRevision }
                      }
                    ]
                  }
                }
              })
            ).toString("base64")
          }
        }
      }
    ]
  });
  return {
    calls,
    async commandRunner(command, args) {
      calls.push([command, args]);
      if (command === "npm" && args[0] === "view") {
        const entry = [...versions].find(([packageName]) =>
          args[1].startsWith(`${packageName}@`)
        );
        if (!entry) throw new Error(`Unexpected package spec: ${args[1]}`);
        const [packageName, version] = entry;
        return {
          stdout: `${JSON.stringify({
            version,
            "dist.attestations.url":
              `https://registry.npmjs.org/attestations/${encodeURIComponent(packageName)}@${version}`
          })}\n`,
          stderr: ""
        };
      }
      if (command === "npm" && args[0] === "install") {
        const prefixIndex = args.indexOf("--prefix");
        const installRoot = args[prefixIndex + 1];
        createMatchedPackages(installRoot, {
          observabilityVersion,
          runtimeVersion
        });
        return { stdout: "", stderr: "" };
      }
      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    },
    async fetchImpl(url) {
      const entry = attestationUrls.get(url);
      return entry
        ? {
            ok: true,
            async json() {
              return createAttestations(entry.packageName, entry.version);
            }
          }
        : { ok: false, async json() { return {}; } };
    }
  };
}

test("CLI defaults to latest tag and keeps local package root mode", () => {
  assert.deepEqual(parseCliArguments(["sync"]), {
    mode: "sync",
    tag: "latest"
  });
  assert.deepEqual(parseCliArguments(["sync", "--tag", "next"]), {
    mode: "sync",
    tag: "next"
  });
  assert.deepEqual(
    parseCliArguments([
      "check",
      "--package-root",
      "/observability",
      "--runtime-package-root",
      "/runtime",
      "--runtime-core-package-root",
      "/runtime-core"
    ]),
    {
      mode: "check",
      inputPackageRoot: "/observability",
      inputRuntimePackageRoot: "/runtime",
      inputRuntimeCorePackageRoot: "/runtime-core"
    }
  );
  assert.throws(
    () =>
      parseCliArguments([
        "sync",
        "--tag",
        "latest",
        "--package-root",
        "/observability"
      ]),
    /cannot be combined/
  );
  assert.throws(
    () =>
      parseCliArguments([
        "sync",
        "--package-root",
        "/observability"
      ]),
    /--runtime-package-root/
  );
});

test("published tag resolves one source revision and independently versioned packages", async () => {
  const fakes = createPublishedReleaseFakes();
  const release = await resolvePublishedMfRelease({
    commandRunner: fakes.commandRunner,
    fetchImpl: fakes.fetchImpl
  });

  assert.equal(release.requestedTag, "latest");
  assert.equal(release.sourceRevision, fixtureRevision);
  assert.equal(
    release.packages["@module-federation/observability-plugin"].version,
    "2.5.5"
  );
  assert.equal(
    release.packages["@module-federation/runtime"].version,
    "2.8.1"
  );
  assert.equal(
    fakes.calls.filter(
      ([command, args]) => command === "npm" && args[0] === "view"
    ).length,
    3
  );
});

test("sync from tag installs exact release versions and generates all assets", async () => {
  const root = mkdtempSync(join(tmpdir(), "divebell-mf-debug-tag-"));
  const installRoot = join(root, "install");
  const assets = join(root, "assets");
  try {
    const fakes = createPublishedReleaseFakes();
    const result = await synchronizeMfDebugFromTag({
      mode: "sync",
      assetDirectory: assets,
      commandRunner: fakes.commandRunner,
      fetchImpl: fakes.fetchImpl,
      temporaryDirectory: installRoot
    });

    assert.equal(result.tag, "latest");
    assert.equal(result.observability.packageVersion, "2.5.5");
    assert.equal(result.runtime.packageVersion, "2.8.1");
    assert.equal(result.runtimeCore.packageVersion, "2.8.1");
    assert.equal(
      readFileSync(join(assets, "observability-build.json"), "utf8").includes(
        '"packageVersion": "2.5.5"'
      ),
      true
    );
    assert.equal(
      readFileSync(join(assets, "runtime-debug-build.json"), "utf8").includes(
        '"packageVersion": "2.8.1"'
      ),
      true
    );

    const installCall = fakes.calls.find(
      ([command, args]) => command === "npm" && args[0] === "install"
    );
    assert.ok(installCall);
    assert.ok(
      installCall[1].includes(
        "@module-federation/observability-plugin@2.5.5"
      )
    );
    assert.ok(installCall[1].includes("@module-federation/runtime@2.8.1"));
    assert.ok(
      installCall[1].includes("@module-federation/runtime-core@2.8.1")
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("sync creates one exact-version Runtime, Runtime Core, and Observability set", async () => {
  const root = mkdtempSync(join(tmpdir(), "divebell-mf-debug-sync-"));
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
  const root = mkdtempSync(join(tmpdir(), "divebell-mf-debug-mismatch-"));
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
  const root = mkdtempSync(join(tmpdir(), "divebell-mf-runtime-core-"));
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
      /must depend on the injected Runtime Core version/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("sync accepts independently versioned packages from one local workspace", async () => {
  const root = mkdtempSync(join(tmpdir(), "divebell-mf-debug-workspace-"));
  const assets = join(root, "assets");
  try {
    const packages = createMatchedPackages(root);
    const observabilityManifestPath = join(
      packages.observabilityRoot,
      "package.json"
    );
    const observabilityManifest = JSON.parse(
      readFileSync(observabilityManifestPath, "utf8")
    );
    observabilityManifest.version = "2.5.4";
    writeFileSync(
      observabilityManifestPath,
      `${JSON.stringify(observabilityManifest, null, 2)}\n`
    );

    const runtimeManifestPath = join(packages.runtimeRoot, "package.json");
    const runtimeManifest = JSON.parse(
      readFileSync(runtimeManifestPath, "utf8")
    );
    runtimeManifest.version = "2.8.0";
    runtimeManifest.dependencies["@module-federation/runtime-core"] =
      "workspace:*";
    writeFileSync(
      runtimeManifestPath,
      `${JSON.stringify(runtimeManifest, null, 2)}\n`
    );

    const runtimeCoreManifestPath = join(
      packages.runtimeCoreRoot,
      "package.json"
    );
    const runtimeCoreManifest = JSON.parse(
      readFileSync(runtimeCoreManifestPath, "utf8")
    );
    runtimeCoreManifest.version = "2.8.0";
    writeFileSync(
      runtimeCoreManifestPath,
      `${JSON.stringify(runtimeCoreManifest, null, 2)}\n`
    );
    writeFileSync(
      join(packages.runtimeCoreRoot, "dist", "index.js"),
      `export class ModuleFederation {
        constructor(options) {
          this.name = options.name;
          this.version = "2.8.0";
        }
      }
      `
    );

    const result = await synchronizeMfDebug({
      mode: "sync",
      inputPackageRoot: packages.observabilityRoot,
      inputRuntimePackageRoot: packages.runtimeRoot,
      inputRuntimeCorePackageRoot: packages.runtimeCoreRoot,
      sourceRevision: fixtureRevision,
      assetDirectory: assets
    });

    assert.equal(result.version, undefined);
    assert.equal(result.runtime.packageVersion, "2.8.0");
    assert.equal(result.runtimeCore.packageVersion, "2.8.0");
    assert.equal(result.observability.packageVersion, "2.5.4");
    assert.equal(result.sourceRevision, fixtureRevision);
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

  const root = mkdtempSync(join(tmpdir(), "divebell-mf-debug-invalid-"));
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
