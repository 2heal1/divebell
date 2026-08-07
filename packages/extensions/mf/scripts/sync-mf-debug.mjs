import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { build } from "esbuild";
import { generateObservabilityArtifacts } from "./sync-observability.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultAssetDirectory = resolve(packageRoot, "assets");
const runtimeInstallerTemplatePath = resolve(
  packageRoot,
  "scripts/install-runtime-debug.template.js"
);
const expectedRuntimePackageName = "@module-federation/runtime";
const expectedRuntimeCorePackageName = "@module-federation/runtime-core";
const expectedObservabilityPackageName =
  "@module-federation/observability-plugin";
const runtimeCoreGlobalName = "ModuleFederationDebugRuntime";
const defaultPublishedTag = "latest";
const mfRepositoryUrl = "https://github.com/module-federation/core";
const execFileAsync = promisify(execFile);
const publishedPackageNames = [
  expectedObservabilityPackageName,
  expectedRuntimePackageName,
  expectedRuntimeCorePackageName
];

const artifactNames = {
  observabilityBundle: "observability-chrome-devtool.iife.js",
  observabilityInstaller: "install-observability.js",
  observabilityMetadata: "observability-build.json",
  runtimeInstaller: "install-runtime-debug.js",
  runtimeMetadata: "runtime-debug-build.json"
};

async function loadManifest(inputPackageRoot, optionName, expectedName) {
  if (
    typeof inputPackageRoot !== "string" ||
    inputPackageRoot.length === 0
  ) {
    throw new Error(
      `${optionName} must point to an ${expectedName} package directory.`
    );
  }
  const resolvedPackageRoot = resolve(inputPackageRoot);
  let packageStat;
  try {
    packageStat = await stat(resolvedPackageRoot);
  } catch {
    throw new Error(`Package root does not exist: ${resolvedPackageRoot}`);
  }
  if (!packageStat.isDirectory()) {
    throw new Error(`Package root is not a directory: ${resolvedPackageRoot}`);
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
      }`,
      { cause: error }
    );
  }
  if (manifest.name !== expectedName) {
    throw new Error(
      `Expected package name ${expectedName}, received ${String(manifest.name)}.`
    );
  }
  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    throw new Error(`${expectedName} package.json must contain a version.`);
  }
  return {
    packageRoot: resolvedPackageRoot,
    packageName: manifest.name,
    packageVersion: manifest.version,
    manifest
  };
}

function resolvePublicEntry(value) {
  if (typeof value === "string") return value;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const imported = value.import;
  if (typeof imported === "string") return imported;
  if (imported !== null && typeof imported === "object") {
    if (typeof imported.default === "string") return imported.default;
  }
  for (const condition of ["browser", "default", "require"]) {
    const candidate = value[condition];
    if (typeof candidate === "string" && candidate.endsWith(".js")) {
      return candidate;
    }
  }
  return undefined;
}

function resolveEntryInsidePackage(context, publicEntry, label) {
  const entryPath = resolve(context.packageRoot, publicEntry);
  const entryRelative = relative(context.packageRoot, entryPath);
  if (
    entryRelative === "" ||
    entryRelative === ".." ||
    entryRelative.startsWith(`..${sep}`) ||
    isAbsolute(entryRelative)
  ) {
    throw new Error(`${label} must stay inside the package root.`);
  }
  return entryPath;
}

export async function loadRuntimeContext(inputRuntimePackageRoot) {
  return await loadManifest(
    inputRuntimePackageRoot,
    "--runtime-package-root",
    expectedRuntimePackageName
  );
}

export async function loadRuntimeCoreContext(inputRuntimeCorePackageRoot) {
  const context = await loadManifest(
    inputRuntimeCorePackageRoot,
    "--runtime-core-package-root",
    expectedRuntimeCorePackageName
  );
  const publicEntry = resolvePublicEntry(context.manifest.exports?.["."]);
  if (publicEntry === undefined) {
    throw new Error(
      "Module Federation Runtime Core package.json does not expose a public JavaScript entry."
    );
  }
  const entryPath = resolveEntryInsidePackage(
    context,
    publicEntry,
    "The Runtime Core public entry"
  );
  try {
    await access(entryPath);
  } catch {
    throw new Error(`The Runtime Core public entry does not exist: ${publicEntry}`);
  }
  return { ...context, publicEntry, entryPath };
}

function assertSelfContainedRuntimeCoreBundle(source, context) {
  const disallowed = [
    [/\brequire\s*\(/, "require"],
    [/^\s*import\s/m, "static import"],
    [/(?:cdn\.jsdelivr\.net|unpkg\.com|esm\.sh|cdnjs\.cloudflare\.com)/i, "CDN reference"],
    [/# sourceMappingURL=|sourceRoot/i, "source map reference"],
    [/\/Users\/|outter\/core/, "local filesystem detail"]
  ];
  for (const [pattern, label] of disallowed) {
    if (pattern.test(source)) {
      throw new Error(`Module Federation Runtime Core bundle contains ${label}.`);
    }
  }
  if (!new RegExp(`var\\s+${runtimeCoreGlobalName}\\s*=`).test(source)) {
    throw new Error(
      `Module Federation Runtime Core bundle does not create ${runtimeCoreGlobalName}.`
    );
  }
  if (!source.includes("ModuleFederation")) {
    throw new Error(
      "Module Federation Runtime Core bundle does not export ModuleFederation."
    );
  }
  if (!source.includes(JSON.stringify(context.packageVersion))) {
    throw new Error(
      "Module Federation Runtime Core bundle does not contain its package version."
    );
  }
}

async function createRuntimeCoreBundle(context) {
  const result = await build({
    absWorkingDir: context.packageRoot,
    bundle: true,
    charset: "utf8",
    format: "iife",
    globalName: runtimeCoreGlobalName,
    legalComments: "none",
    logLevel: "silent",
    metafile: true,
    minify: false,
    minifyWhitespace: true,
    platform: "browser",
    sourcemap: false,
    stdin: {
      contents: `export { ModuleFederation } from ${JSON.stringify(context.entryPath)};`,
      resolveDir: context.packageRoot,
      sourcefile: "divebell-mf-debug-runtime.js"
    },
    target: ["es2020"],
    treeShaking: true,
    write: false
  });
  if (result.outputFiles.length !== 1) {
    throw new Error(
      `Expected one Runtime Core browser bundle, received ${result.outputFiles.length}.`
    );
  }
  const externalImports = Object.values(result.metafile.outputs)
    .flatMap((output) => output.imports)
    .filter((item) => item.external);
  if (externalImports.length > 0) {
    throw new Error(
      `The Runtime Core browser bundle still has external imports: ${externalImports
        .map((item) => item.path)
        .join(", ")}`
    );
  }
  const source = result.outputFiles[0].text.replace(/[ \t]+$/gm, "");
  assertSelfContainedRuntimeCoreBundle(source, context);
  return source;
}

function isCompatibleRuntimeCoreDependency(dependency, version) {
  if (dependency === version) return true;
  if (typeof dependency !== "string" || !dependency.startsWith("workspace:")) {
    return false;
  }
  const workspaceRange = dependency.slice("workspace:".length);
  return (
    workspaceRange === "*" ||
    workspaceRange === "^" ||
    workspaceRange === "~" ||
    workspaceRange === version ||
    workspaceRange === `^${version}` ||
    workspaceRange === `~${version}`
  );
}

export async function generateRuntimeDebugArtifacts({
  inputRuntimePackageRoot,
  inputRuntimeCorePackageRoot,
  sourceRevision
}) {
  const [runtime, runtimeCore] = await Promise.all([
    loadRuntimeContext(inputRuntimePackageRoot),
    loadRuntimeCoreContext(inputRuntimeCorePackageRoot)
  ]);
  if (runtime.packageVersion !== runtimeCore.packageVersion) {
    throw new Error(
      `Module Federation Runtime and Runtime Core versions must match, received ${runtime.packageVersion} and ${runtimeCore.packageVersion}.`
    );
  }
  if (!isCompatibleRuntimeCoreDependency(
    runtime.manifest.dependencies?.[expectedRuntimeCorePackageName],
    runtimeCore.packageVersion
  )) {
    throw new Error(
      "Module Federation Runtime must depend on the injected Runtime Core version or its local workspace package."
    );
  }
  const source = await createRuntimeCoreBundle(runtimeCore);

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
    .replace(versionToken, JSON.stringify(runtimeCore.packageVersion))
    .replace(sourceToken, () => source);
  const bundleSha256 = createHash("sha256").update(installer).digest("hex");
  const metadata = `${JSON.stringify({
    runtimePackageName: runtime.packageName,
    runtimePackageVersion: runtime.packageVersion,
    packageName: runtimeCore.packageName,
    packageVersion: runtimeCore.packageVersion,
    sourceRevision,
    publicEntry: runtimeCore.publicEntry,
    bundleSha256
  }, null, 2)}\n`;

  return {
    context: runtimeCore,
    runtime,
    installer,
    metadata,
    bundleSha256
  };
}

function assertRequiredVersion(contexts, requiredVersion) {
  const mismatches = contexts.filter(
    (context) => context.packageVersion !== requiredVersion
  );
  if (mismatches.length > 0) {
    throw new Error(
      `All injected Module Federation packages must use ${requiredVersion}; received ${mismatches
        .map((context) => `${context.packageName}@${context.packageVersion}`)
        .join(", ")}.`
    );
  }
}

function assertLocalPackageRootsShareRepository(observability, packageRoots) {
  const repositoryRoot = observability.context.repositoryRoot;
  if (typeof repositoryRoot !== "string" || repositoryRoot.length === 0) {
    throw new Error(
      "Cannot confirm that the local Module Federation packages use one source repository."
    );
  }
  const outside = packageRoots.filter((candidate) => {
    const path = relative(repositoryRoot, resolve(candidate));
    return (
      path === ".." ||
      path.startsWith(`..${sep}`) ||
      isAbsolute(path)
    );
  });
  if (outside.length > 0) {
    throw new Error(
      "Local Runtime, Runtime Core, and Observability packages must come from the same source repository."
    );
  }
}

async function runCommand(command, args, options = {}) {
  return await execFileAsync(command, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    ...options
  });
}

function normalizePublishedTag(tag) {
  if (tag === undefined) return defaultPublishedTag;
  if (
    typeof tag !== "string" ||
    tag.length === 0 ||
    tag.trim() !== tag ||
    /\s/.test(tag)
  ) {
    throw new Error("The Module Federation tag must be a non-empty value without whitespace.");
  }
  return tag;
}

function parseNpmPackageMetadata(stdout, packageSpec) {
  let metadata;
  try {
    metadata = JSON.parse(stdout);
  } catch (error) {
    throw new Error(
      `Cannot parse npm metadata for ${packageSpec}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error }
    );
  }
  const version = metadata?.version;
  if (typeof version !== "string" || version.length === 0) {
    throw new Error(`Cannot resolve a version for ${packageSpec}.`);
  }
  const attestationUrl = metadata["dist.attestations.url"];
  if (
    typeof attestationUrl !== "string" ||
    !attestationUrl.startsWith("https://registry.npmjs.org/")
  ) {
    throw new Error(
      `${packageSpec} does not expose an npm provenance attestation.`
    );
  }
  return { version, attestationUrl };
}

function readAttestedSourceRevision(attestations, packageName, version) {
  const provenance = attestations?.attestations?.find(
    (item) => item.predicateType === "https://slsa.dev/provenance/v1"
  );
  const encodedPayload = provenance?.bundle?.dsseEnvelope?.payload;
  if (typeof encodedPayload !== "string") {
    throw new Error(
      `${packageName}@${version} does not have an SLSA provenance statement.`
    );
  }
  let statement;
  try {
    statement = JSON.parse(
      Buffer.from(encodedPayload, "base64").toString("utf8")
    );
  } catch (error) {
    throw new Error(
      `Cannot parse provenance for ${packageName}@${version}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error }
    );
  }
  const subjectMatches = statement.subject?.some((subject) => {
    if (typeof subject?.name !== "string" || !subject.name.startsWith("pkg:npm/")) {
      return false;
    }
    try {
      return (
        decodeURIComponent(subject.name.slice("pkg:npm/".length)) ===
        `${packageName}@${version}`
      );
    } catch {
      return false;
    }
  });
  if (!subjectMatches) {
    throw new Error(
      `The npm provenance subject does not match ${packageName}@${version}.`
    );
  }
  const source = statement.predicate?.buildDefinition?.resolvedDependencies?.find(
    (dependency) =>
      typeof dependency?.uri === "string" &&
      dependency.uri.startsWith(`git+${mfRepositoryUrl}@`)
  );
  const sourceRevision = source?.digest?.gitCommit;
  if (
    typeof sourceRevision !== "string" ||
    !/^[0-9a-f]{40}$/i.test(sourceRevision)
  ) {
    throw new Error(
      `Cannot read the Module Federation source revision for ${packageName}@${version}.`
    );
  }
  return sourceRevision;
}

async function resolvePublishedPackage({
  packageName,
  tag,
  commandRunner,
  fetchImpl
}) {
  const packageSpec = `${packageName}@${tag}`;
  const { stdout } = await commandRunner("npm", [
    "view",
    packageSpec,
    "version",
    "dist.attestations.url",
    "--json"
  ]);
  const { version, attestationUrl } = parseNpmPackageMetadata(
    stdout,
    packageSpec
  );
  const response = await fetchImpl(attestationUrl);
  if (!response.ok) {
    throw new Error(
      `Cannot read npm provenance for ${packageName}@${version}.`
    );
  }
  let attestations;
  try {
    attestations = await response.json();
  } catch (error) {
    throw new Error(
      `Cannot parse npm provenance for ${packageName}@${version}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error }
    );
  }
  return {
    version,
    sourceRevision: readAttestedSourceRevision(
      attestations,
      packageName,
      version
    )
  };
}

export async function resolvePublishedMfRelease({
  tag = defaultPublishedTag,
  commandRunner = runCommand,
  fetchImpl = globalThis.fetch
} = {}) {
  const requestedTag = normalizePublishedTag(tag);
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required to resolve an MF release.");
  }
  const resolvedPackages = await Promise.all(
    publishedPackageNames.map(async (packageName) => [
      packageName,
      await resolvePublishedPackage({
        packageName,
        tag: requestedTag,
        commandRunner,
        fetchImpl
      })
    ])
  );
  const packages = Object.fromEntries(resolvedPackages);
  const revisions = new Set(
    Object.values(packages).map((item) => item.sourceRevision)
  );
  if (revisions.size !== 1) {
    throw new Error(
      `Module Federation packages for npm tag ${requestedTag} do not come from one source revision.`
    );
  }
  const [sourceRevision] = revisions;
  const runtimeVersion = packages[expectedRuntimePackageName].version;
  const runtimeCoreVersion = packages[expectedRuntimeCorePackageName].version;
  if (runtimeVersion !== runtimeCoreVersion) {
    throw new Error(
      `npm tag ${requestedTag} contains mismatched Runtime versions ${runtimeVersion} and ${runtimeCoreVersion}.`
    );
  }
  return {
    requestedTag,
    sourceRevision,
    packages
  };
}

export async function preparePublishedMfPackages({
  tag = defaultPublishedTag,
  commandRunner = runCommand,
  fetchImpl = globalThis.fetch,
  temporaryDirectory
} = {}) {
  const release = await resolvePublishedMfRelease({
    tag,
    commandRunner,
    fetchImpl
  });
  const installRoot =
    temporaryDirectory ??
    (await mkdtemp(resolve(tmpdir(), "divebell-mf-debug-release-")));
  const ownsInstallRoot = temporaryDirectory === undefined;
  try {
    await mkdir(installRoot, { recursive: true });
    await writeFile(
      resolve(installRoot, "package.json"),
      `${JSON.stringify({ private: true }, null, 2)}\n`
    );
    const packageSpecs = Object.entries(release.packages).map(
      ([packageName, { version }]) => `${packageName}@${version}`
    );
    await commandRunner("npm", [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--no-package-lock",
      "--prefix",
      installRoot,
      ...packageSpecs
    ]);
    const scopeRoot = resolve(installRoot, "node_modules/@module-federation");
    return {
      ...release,
      inputPackageRoot: resolve(scopeRoot, "observability-plugin"),
      inputRuntimePackageRoot: resolve(scopeRoot, "runtime"),
      inputRuntimeCorePackageRoot: resolve(scopeRoot, "runtime-core"),
      async cleanup() {
        if (ownsInstallRoot) {
          await rm(installRoot, { recursive: true, force: true });
        }
      }
    };
  } catch (error) {
    if (ownsInstallRoot) {
      await rm(installRoot, { recursive: true, force: true });
    }
    throw error;
  }
}

export async function synchronizeMfDebugFromTag({
  mode,
  tag = defaultPublishedTag,
  assetDirectory = defaultAssetDirectory,
  commandRunner = runCommand,
  fetchImpl = globalThis.fetch,
  temporaryDirectory
}) {
  const prepared = await preparePublishedMfPackages({
    tag,
    commandRunner,
    fetchImpl,
    temporaryDirectory
  });
  try {
    const result = await synchronizeMfDebug({
      mode,
      inputPackageRoot: prepared.inputPackageRoot,
      inputRuntimePackageRoot: prepared.inputRuntimePackageRoot,
      inputRuntimeCorePackageRoot: prepared.inputRuntimeCorePackageRoot,
      sourceRevision: prepared.sourceRevision,
      assetDirectory
    });
    return {
      ...result,
      tag: prepared.requestedTag
    };
  } finally {
    await prepared.cleanup();
  }
}

export async function synchronizeMfDebug({
  mode,
  inputPackageRoot,
  inputRuntimePackageRoot,
  inputRuntimeCorePackageRoot,
  sourceRevision,
  requiredVersion,
  assetDirectory = defaultAssetDirectory
}) {
  if (mode !== "sync" && mode !== "check") {
    throw new Error(`Unsupported mode ${String(mode)}. Use sync or check.`);
  }
  if (
    sourceRevision !== undefined &&
    !/^[0-9a-f]{40}$/i.test(sourceRevision)
  ) {
    throw new Error("The Module Federation source revision must be a full git commit.");
  }
  const observability = await generateObservabilityArtifacts(
    inputPackageRoot,
    sourceRevision === undefined ? {} : { sourceRevision }
  );
  if (sourceRevision === undefined) {
    assertLocalPackageRootsShareRepository(observability, [
      inputRuntimePackageRoot,
      inputRuntimeCorePackageRoot
    ]);
  }
  const resolvedSourceRevision =
    sourceRevision ?? observability.context.sourceRevision;
  const runtime = await generateRuntimeDebugArtifacts({
    inputRuntimePackageRoot,
    inputRuntimeCorePackageRoot,
    sourceRevision: resolvedSourceRevision
  });
  if (requiredVersion !== undefined) {
    assertRequiredVersion(
      [observability.context, runtime.runtime, runtime.context],
      requiredVersion
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
        `MF debug assets are stale: ${stale.join(", ")}. Run pnpm run sync:mf-observability with the same tag or package roots.`
      );
    }
  }

  return {
    mode,
    sourceRevision: resolvedSourceRevision,
    ...(requiredVersion === undefined ? {} : { version: requiredVersion }),
    runtime: {
      packageName: runtime.runtime.packageName,
      packageVersion: runtime.runtime.packageVersion
    },
    runtimeCore: {
      packageName: runtime.context.packageName,
      packageVersion: runtime.context.packageVersion,
      publicEntry: runtime.context.publicEntry,
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

export function parseCliArguments(argv) {
  const [mode, ...rawArgs] = argv;
  const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
  const values = new Map();
  const packageRootOptions = [
    "--package-root",
    "--runtime-package-root",
    "--runtime-core-package-root"
  ];
  const supported = new Set([...packageRootOptions, "--tag"]);
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (!supported.has(name)) {
      throw new Error(`Unknown argument: ${name}`);
    }
    const value = args[index + 1];
    if (value === undefined) {
      throw new Error(`Missing value for ${name}.`);
    }
    values.set(name, value);
    index += 1;
  }
  const suppliedPackageRoots = packageRootOptions.filter((name) =>
    values.has(name)
  );
  if (values.has("--tag") && suppliedPackageRoots.length > 0) {
    throw new Error("--tag cannot be combined with local package root arguments.");
  }
  if (
    suppliedPackageRoots.length > 0 &&
    suppliedPackageRoots.length !== packageRootOptions.length
  ) {
    for (const name of packageRootOptions) {
      if (!values.has(name)) {
        throw new Error(`Missing required ${name} <directory> argument.`);
      }
    }
  }
  if (suppliedPackageRoots.length === 0) {
    return {
      mode,
      tag: values.get("--tag") ?? defaultPublishedTag
    };
  }
  for (const name of packageRootOptions) {
    if (!values.has(name)) {
      throw new Error(`Missing required ${name} <directory> argument.`);
    }
  }
  return {
    mode,
    inputPackageRoot: values.get("--package-root"),
    inputRuntimePackageRoot: values.get("--runtime-package-root"),
    inputRuntimeCorePackageRoot: values.get("--runtime-core-package-root")
  };
}

async function main() {
  try {
    const options = parseCliArguments(process.argv.slice(2));
    const result =
      options.tag === undefined
        ? await synchronizeMfDebug(options)
        : await synchronizeMfDebugFromTag(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
