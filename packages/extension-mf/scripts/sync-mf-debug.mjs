import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import { generateObservabilityArtifacts } from "./sync-observability.mjs";

const execFileAsync = promisify(execFile);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultAssetDirectory = resolve(packageRoot, "assets");
const runtimeInstallerTemplatePath = resolve(
  packageRoot,
  "scripts/install-runtime-debug.template.js"
);
const expectedRuntimePackageName = "@module-federation/runtime";
const runtimeDebugEntry = "./dist/debug/index.iife.js";

const artifactNames = {
  observabilityBundle: "observability-chrome-devtool.iife.js",
  observabilityInstaller: "install-observability.js",
  observabilityMetadata: "observability-build.json",
  runtimeInstaller: "install-runtime-debug.js",
  runtimeMetadata: "runtime-debug-build.json"
};

async function readGitContext(inputPackageRoot) {
  try {
    const rootResult = await execFileAsync(
      "git",
      ["-C", inputPackageRoot, "rev-parse", "--show-toplevel"],
      { encoding: "utf8" }
    );
    const revisionResult = await execFileAsync(
      "git",
      ["-C", inputPackageRoot, "rev-parse", "HEAD"],
      { encoding: "utf8" }
    );
    return {
      repositoryRoot: rootResult.stdout.trim(),
      sourceRevision: revisionResult.stdout.trim()
    };
  } catch (error) {
    throw new Error(
      `Cannot read the source git revision for ${inputPackageRoot}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export async function loadRuntimeDebugContext(inputRuntimePackageRoot) {
  if (
    typeof inputRuntimePackageRoot !== "string" ||
    inputRuntimePackageRoot.length === 0
  ) {
    throw new Error(
      "--runtime-package-root must point to an @module-federation/runtime package directory."
    );
  }
  const resolvedPackageRoot = resolve(inputRuntimePackageRoot);
  let packageStat;
  try {
    packageStat = await stat(resolvedPackageRoot);
  } catch {
    throw new Error(`Runtime package root does not exist: ${resolvedPackageRoot}`);
  }
  if (!packageStat.isDirectory()) {
    throw new Error(`Runtime package root is not a directory: ${resolvedPackageRoot}`);
  }

  let manifest;
  try {
    manifest = JSON.parse(
      await readFile(resolve(resolvedPackageRoot, "package.json"), "utf8")
    );
  } catch (error) {
    throw new Error(
      `Cannot read package.json from ${resolvedPackageRoot}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  if (manifest.name !== expectedRuntimePackageName) {
    throw new Error(
      `Expected package name ${expectedRuntimePackageName}, received ${String(manifest.name)}.`
    );
  }
  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    throw new Error("Module Federation Runtime package.json must contain a version.");
  }

  const entryPath = resolve(resolvedPackageRoot, runtimeDebugEntry);
  try {
    await access(entryPath);
  } catch {
    throw new Error(
      `The Module Federation debug runtime does not exist at ${runtimeDebugEntry}. Run the runtime package's build-debug script first.`
    );
  }
  const git = await readGitContext(resolvedPackageRoot);
  if (!/^[0-9a-f]{40}$/i.test(git.sourceRevision)) {
    throw new Error("The Module Federation Runtime source revision is not a full git commit.");
  }

  return {
    packageRoot: resolvedPackageRoot,
    packageName: manifest.name,
    packageVersion: manifest.version,
    debugEntry: runtimeDebugEntry,
    entryPath,
    ...git
  };
}

function stripSourceMapReference(source) {
  return `${source.replace(/\n?\/\/# sourceMappingURL=.*(?:\n|$)/g, "").trimEnd()}\n`;
}

function assertRuntimeDebugBundle(source, context) {
  const disallowed = [
    [/\brequire\s*\(/, "require"],
    [/^\s*import\s/m, "static import"],
    [/(?:cdn\.jsdelivr\.net|unpkg\.com|esm\.sh|cdnjs\.cloudflare\.com)/i, "CDN reference"],
    [/# sourceMappingURL=|sourceRoot/i, "source map reference"],
    [/\/Users\/|outter\/core/, "local filesystem detail"]
  ];
  for (const [pattern, label] of disallowed) {
    if (pattern.test(source)) {
      throw new Error(`Module Federation debug runtime contains ${label}.`);
    }
  }
  if (!source.includes("var ModuleFederationRuntime =")) {
    throw new Error("Module Federation debug runtime does not create ModuleFederationRuntime.");
  }
  if (!source.includes("__DEBUG_CONSTRUCTOR__")) {
    throw new Error("Module Federation debug runtime does not install a debug constructor.");
  }
  if (!source.includes(JSON.stringify(context.packageVersion))) {
    throw new Error(
      "Module Federation debug runtime does not contain its package version."
    );
  }
}

export async function generateRuntimeDebugArtifacts(inputRuntimePackageRoot) {
  const context = await loadRuntimeDebugContext(inputRuntimePackageRoot);
  const source = stripSourceMapReference(await readFile(context.entryPath, "utf8"));
  assertRuntimeDebugBundle(source, context);

  const template = await readFile(runtimeInstallerTemplatePath, "utf8");
  const versionToken = '"__MF_RUNTIME_VERSION__"';
  const sourceToken = "/*__MF_RUNTIME_DEBUG_SOURCE__*/";
  if (template.split(versionToken).length !== 2) {
    throw new Error("Runtime installer template must contain exactly one version token.");
  }
  if (template.split(sourceToken).length !== 2) {
    throw new Error("Runtime installer template must contain exactly one source token.");
  }
  const installer = template
    .replace(versionToken, JSON.stringify(context.packageVersion))
    .replace(sourceToken, () => source);
  const bundleSha256 = createHash("sha256").update(installer).digest("hex");
  const metadata = `${JSON.stringify({
    packageName: context.packageName,
    packageVersion: context.packageVersion,
    sourceRevision: context.sourceRevision,
    debugEntry: context.debugEntry,
    bundleSha256
  }, null, 2)}\n`;

  return { context, installer, metadata, bundleSha256 };
}

export async function synchronizeMfDebug({
  mode,
  inputPackageRoot,
  inputRuntimePackageRoot = resolve(inputPackageRoot ?? "", "..", "runtime"),
  assetDirectory = defaultAssetDirectory
}) {
  if (mode !== "sync" && mode !== "check") {
    throw new Error(`Unsupported mode ${String(mode)}. Use sync or check.`);
  }
  const [observability, runtime] = await Promise.all([
    generateObservabilityArtifacts(inputPackageRoot),
    generateRuntimeDebugArtifacts(inputRuntimePackageRoot)
  ]);
  if (
    observability.context.repositoryRoot !== runtime.context.repositoryRoot ||
    observability.context.sourceRevision !== runtime.context.sourceRevision
  ) {
    throw new Error(
      "The Module Federation Runtime and Observability Plugin must come from the same repository revision."
    );
  }

  const expected = new Map([
    [artifactNames.observabilityBundle, observability.bundle],
    [artifactNames.observabilityInstaller, observability.installer],
    [artifactNames.observabilityMetadata, observability.metadata],
    [artifactNames.runtimeInstaller, runtime.installer],
    [artifactNames.runtimeMetadata, runtime.metadata]
  ]);
  if (mode === "sync") {
    await mkdir(assetDirectory, { recursive: true });
    await Promise.all(
      [...expected].map(([name, source]) =>
        writeFile(resolve(assetDirectory, name), source)
      )
    );
  } else {
    const stale = [];
    for (const [name, source] of expected) {
      let current;
      try {
        current = await readFile(resolve(assetDirectory, name), "utf8");
      } catch {
        stale.push(name);
        continue;
      }
      if (current !== source) stale.push(name);
    }
    if (stale.length > 0) {
      throw new Error(
        `MF debug assets are stale: ${stale.join(", ")}. Run pnpm run sync:mf-observability with the same package roots.`
      );
    }
  }

  return {
    mode,
    sourceRevision: runtime.context.sourceRevision,
    runtime: {
      packageName: runtime.context.packageName,
      packageVersion: runtime.context.packageVersion,
      debugEntry: runtime.context.debugEntry,
      bundleSha256: runtime.bundleSha256
    },
    observability: {
      packageName: observability.context.packageName,
      packageVersion: observability.context.packageVersion,
      publicEntry: observability.context.publicEntry,
      bundleSha256: observability.bundleSha256
    }
  };
}

function parseCliArguments(argv) {
  const [mode, ...rawArgs] = argv;
  const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
  let inputPackageRoot;
  let inputRuntimePackageRoot;
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name !== "--package-root" && name !== "--runtime-package-root") {
      throw new Error(`Unknown argument: ${name}`);
    }
    const value = args[index + 1];
    if (value === undefined) {
      throw new Error(`Missing value for ${name}.`);
    }
    if (name === "--package-root") inputPackageRoot = value;
    if (name === "--runtime-package-root") inputRuntimePackageRoot = value;
    index += 1;
  }
  if (inputPackageRoot === undefined) {
    throw new Error(
      "Missing required --package-root <observability-plugin-directory> argument."
    );
  }
  return { mode, inputPackageRoot, inputRuntimePackageRoot };
}

async function main() {
  try {
    const options = parseCliArguments(process.argv.slice(2));
    const result = await synchronizeMfDebug(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
