import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const execFileAsync = promisify(execFile);
const expectedPackageName = "@module-federation/observability-plugin";
const globalName = "ModuleFederationChromeObservabilityPlugin";
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultAssetDirectory = resolve(packageRoot, "assets");
const templatePath = resolve(
  packageRoot,
  "scripts/install-observability.template.js"
);

const artifactNames = {
  bundle: "observability-chrome-devtool.iife.js",
  installer: "install-observability.js",
  metadata: "observability-build.json"
};

export async function loadPackageContext(inputPackageRoot, options = {}) {
  if (typeof inputPackageRoot !== "string" || inputPackageRoot.length === 0) {
    throw new Error("--package-root must point to an Observability Plugin package directory.");
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

  const manifestPath = resolve(resolvedPackageRoot, "package.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Cannot read package.json from ${resolvedPackageRoot}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (manifest.name !== expectedPackageName) {
    throw new Error(
      `Expected package name ${expectedPackageName}, received ${String(manifest.name)}.`
    );
  }
  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    throw new Error("Observability Plugin package.json must contain a version.");
  }

  const publicExport = manifest.exports?.["./chrome-devtool"];
  const publicEntry = resolvePublicEntry(publicExport);
  if (publicEntry === undefined) {
    throw new Error(
      "Observability Plugin package.json does not expose a public ./chrome-devtool JavaScript entry."
    );
  }
  const entryPath = resolve(resolvedPackageRoot, publicEntry);
  const entryRelative = relative(resolvedPackageRoot, entryPath);
  if (
    entryRelative === "" ||
    entryRelative === ".." ||
    entryRelative.startsWith(`..${sep}`) ||
    isAbsolute(entryRelative)
  ) {
    throw new Error("The public ./chrome-devtool entry must stay inside the package root.");
  }
  if (entryRelative.split(sep).includes("src")) {
    throw new Error("The public ./chrome-devtool entry must not resolve to private source code.");
  }
  try {
    await access(entryPath);
  } catch {
    throw new Error(`The public ./chrome-devtool entry does not exist: ${publicEntry}`);
  }

  let repositoryRoot = options.repositoryRoot;
  let sourceRevision = options.sourceRevision;
  if (sourceRevision === undefined) {
    try {
      const rootResult = await execFileAsync(
        "git",
        ["-C", resolvedPackageRoot, "rev-parse", "--show-toplevel"],
        { encoding: "utf8" }
      );
      repositoryRoot = rootResult.stdout.trim();
      const revisionResult = await execFileAsync(
        "git",
        ["-C", resolvedPackageRoot, "rev-parse", "HEAD"],
        { encoding: "utf8" }
      );
      sourceRevision = revisionResult.stdout.trim();
    } catch (error) {
      throw new Error(
        `Cannot read the source git revision for ${resolvedPackageRoot}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  if (!/^[0-9a-f]{40}$/i.test(sourceRevision)) {
    throw new Error("The Observability Plugin source revision is not a full git commit.");
  }

  return {
    packageRoot: resolvedPackageRoot,
    packageName: manifest.name,
    packageVersion: manifest.version,
    publicEntry,
    entryPath,
    repositoryRoot,
    sourceRevision
  };
}

function resolvePublicEntry(value) {
  if (typeof value === "string") return value;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  for (const condition of ["browser", "import", "default", "require"]) {
    const candidate = value[condition];
    if (typeof candidate === "string" && candidate.endsWith(".js")) {
      return candidate;
    }
  }
  return undefined;
}

export async function generateObservabilityArtifacts(inputPackageRoot, options = {}) {
  const context = await loadPackageContext(inputPackageRoot, options);
  const result = await build({
    absWorkingDir: context.packageRoot,
    entryPoints: [context.entryPath],
    bundle: true,
    charset: "utf8",
    format: "iife",
    globalName,
    legalComments: "none",
    logLevel: "silent",
    metafile: true,
    minify: false,
    platform: "browser",
    sourcemap: false,
    target: ["es2020"],
    treeShaking: true,
    write: false
  });
  if (result.outputFiles.length !== 1) {
    throw new Error(`Expected one browser bundle, received ${result.outputFiles.length}.`);
  }
  const externalImports = Object.values(result.metafile.outputs)
    .flatMap((output) => output.imports)
    .filter((item) => item.external);
  if (externalImports.length > 0) {
    throw new Error(
      `The browser bundle still has external imports: ${externalImports.map((item) => item.path).join(", ")}`
    );
  }

  const bundle = result.outputFiles[0].text;
  assertSelfContainedBundle(bundle, context);
  const bundleSha256 = createHash("sha256").update(bundle).digest("hex");
  const template = await readFile(templatePath, "utf8");
  const token = '"__MF_OBSERVABILITY_VERSION__"';
  if (template.split(token).length !== 2) {
    throw new Error("Installer template must contain exactly one version token.");
  }
  const installer = template.replace(token, JSON.stringify(context.packageVersion));
  const metadata = `${JSON.stringify({
    packageName: context.packageName,
    packageVersion: context.packageVersion,
    sourceRevision: context.sourceRevision,
    publicEntry: context.publicEntry,
    bundleSha256
  }, null, 2)}\n`;
  assertNoLocalDetails(installer, context, "installer");
  assertNoLocalDetails(metadata, context, "build metadata");

  return {
    context,
    bundle,
    installer,
    metadata,
    bundleSha256
  };
}

function assertSelfContainedBundle(bundle, context) {
  const disallowed = [
    [/\brequire\s*\(/, "require"],
    [/\bimport\s*\(/, "dynamic import"],
    [/\bimport\s+(?:[\w$*{]|["'])/, "static import"],
    [/(?:cdn\.jsdelivr\.net|unpkg\.com|esm\.sh|cdnjs\.cloudflare\.com)/i, "CDN reference"],
    [/# sourceMappingURL=|sourceRoot/i, "source map reference"]
  ];
  for (const [pattern, label] of disallowed) {
    if (pattern.test(bundle)) {
      throw new Error(`Generated browser bundle contains ${label}.`);
    }
  }
  if (!bundle.includes(`var ${globalName} =`)) {
    throw new Error(`Generated browser bundle does not create ${globalName}.`);
  }
  if (!bundle.includes("ChromeObservabilityPlugin")) {
    throw new Error("Generated browser bundle does not export ChromeObservabilityPlugin.");
  }
  assertNoLocalDetails(bundle, context, "browser bundle");
}

function assertNoLocalDetails(source, context, label) {
  const forbidden = [
    "/Users/",
    context.packageRoot,
    context.repositoryRoot,
    "outter/core"
  ].filter(Boolean);
  const match = forbidden.find((value) => source.includes(value));
  if (match !== undefined) {
    throw new Error(`Generated ${label} contains a local filesystem path.`);
  }
}

export async function synchronizeObservability({
  mode,
  inputPackageRoot,
  assetDirectory = defaultAssetDirectory
}) {
  if (mode !== "sync" && mode !== "check") {
    throw new Error(`Unsupported mode ${String(mode)}. Use sync or check.`);
  }
  const artifacts = await generateObservabilityArtifacts(inputPackageRoot);
  const expected = new Map([
    [artifactNames.bundle, artifacts.bundle],
    [artifactNames.installer, artifacts.installer],
    [artifactNames.metadata, artifacts.metadata]
  ]);

  if (mode === "sync") {
    await mkdir(assetDirectory, { recursive: true });
    await Promise.all(
      [...expected].map(([name, source]) => writeFile(resolve(assetDirectory, name), source))
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
        `MF observability assets are stale: ${stale.join(", ")}. Run pnpm run sync:mf-observability with the same --package-root.`
      );
    }
  }

  return {
    mode,
    packageName: artifacts.context.packageName,
    packageVersion: artifacts.context.packageVersion,
    publicEntry: artifacts.context.publicEntry,
    sourceRevision: artifacts.context.sourceRevision,
    bundleSha256: artifacts.bundleSha256
  };
}

function parseCliArguments(argv) {
  const [mode, ...rawArgs] = argv;
  const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
  let inputPackageRoot;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--package-root") {
      throw new Error(`Unknown argument: ${args[index]}`);
    }
    inputPackageRoot = args[index + 1];
    index += 1;
  }
  if (inputPackageRoot === undefined) {
    throw new Error("Missing required --package-root <directory> argument.");
  }
  return { mode, inputPackageRoot };
}

async function main() {
  try {
    const options = parseCliArguments(process.argv.slice(2));
    const result = await synchronizeObservability(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
