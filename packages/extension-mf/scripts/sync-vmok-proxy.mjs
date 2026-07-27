import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultAssetDirectory = resolve(packageRoot, "assets");
const expectedPackageName = "@vmok/proxy-sdk";
const bundleName = "vmok-proxy-sdk.iife.js";
const metadataName = "proxy-sdk-build.json";

export async function synchronizeVmokProxy({
  mode,
  inputPackageRoot,
  assetDirectory = defaultAssetDirectory
}) {
  if (mode !== "sync" && mode !== "check") {
    throw new Error(`Unsupported mode ${String(mode)}. Use sync or check.`);
  }
  if (typeof inputPackageRoot !== "string" || inputPackageRoot.length === 0) {
    throw new Error(
      "--package-root must point to an @vmok/proxy-sdk package directory."
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
      }`
    );
  }
  if (manifest.name !== expectedPackageName) {
    throw new Error(
      `Expected package name ${expectedPackageName}, received ${String(manifest.name)}.`
    );
  }
  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    throw new Error(`${expectedPackageName} package.json must contain a version.`);
  }

  const publicEntry = "dist/iife.js";
  let bundle;
  try {
    bundle = await readFile(resolve(resolvedPackageRoot, publicEntry), "utf8");
  } catch (error) {
    throw new Error(
      `Cannot read ${expectedPackageName} ${publicEntry}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  assertSelfContainedBundle(bundle);
  const bundleSha256 = createHash("sha256").update(bundle).digest("hex");
  const metadata = `${JSON.stringify({
    packageName: manifest.name,
    packageVersion: manifest.version,
    publicEntry,
    bundleSha256
  }, null, 2)}\n`;
  const expected = new Map([
    [bundleName, bundle],
    [metadataName, metadata]
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
        `Vmok Proxy SDK assets are stale: ${stale.join(", ")}. Run pnpm run sync:vmok-proxy with the same package root.`
      );
    }
  }

  return {
    mode,
    packageName: manifest.name,
    packageVersion: manifest.version,
    publicEntry,
    bundleSha256
  };
}

function assertSelfContainedBundle(source) {
  const disallowed = [
    [/\brequire\s*\(/, "require"],
    [/^\s*import\s/m, "static import"],
    [/\bimport\s*\(/, "dynamic import"],
    [/(?:cdn\.jsdelivr\.net|unpkg\.com|esm\.sh|cdnjs\.cloudflare\.com)/i, "CDN reference"],
    [/# sourceMappingURL=|sourceRoot/i, "source map reference"],
    [/\/Users\/|work\/garfish/, "local filesystem detail"]
  ];
  for (const [pattern, label] of disallowed) {
    if (pattern.test(source)) {
      throw new Error(`Vmok Proxy SDK bundle contains ${label}.`);
    }
  }
  if (!/\bvar\s+VmokProxySdk\s*=/.test(source)) {
    throw new Error("Vmok Proxy SDK bundle does not create VmokProxySdk.");
  }
  if (!source.includes("bootstrapProxy")) {
    throw new Error("Vmok Proxy SDK bundle does not expose bootstrapProxy.");
  }
}

function parseCliArguments(argv) {
  const [mode, ...rawArgs] = argv;
  const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
  if (args.length !== 2 || args[0] !== "--package-root" || args[1] === undefined) {
    throw new Error("Expected --package-root <directory>.");
  }
  return {
    mode,
    inputPackageRoot: args[1]
  };
}

async function main() {
  try {
    const result = await synchronizeVmokProxy(
      parseCliArguments(process.argv.slice(2))
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
