import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  createDivebellCli,
  createDivebellCliWithExternalExtensions,
  validateExtension
} from "@divebell/cli";
import { implementedMfCommandMetadata } from "../dist/commands/metadata.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("extension manifest is valid and implementation stays lazy", async () => {
  const extension = (await import(pathToFileURL(resolve(packageRoot, "dist/extension.js")).href)).default;
  const validated = validateExtension(extension);
  assert.equal(validated.name, "mf");
  assert.deepEqual(validated.commands.map((command) => command.name), ["mf"]);
  assert.equal(typeof validated.hooks.open, "function");
  const entrySource = readFileSync(resolve(packageRoot, "dist/extension.js"), "utf8");
  assert.match(entrySource, /import\("\.\/index\.js"\)/);
  assert.match(entrySource, /import\("\.\/open\.js"\)/);
  assert.doesNotMatch(entrySource, /getRuntimeState|readFile/);
  const commandReferences = validated.commands[0].commandReferences;
  assert.deepEqual(
    commandReferences,
    implementedMfCommandMetadata.map(({ usage, description }) => ({
      category: "External Extensions",
      usage,
      description
    }))
  );
  const readme = readFileSync(resolve(packageRoot, "README.md"), "utf8");
  for (const command of implementedMfCommandMetadata) {
    assert.match(readme, new RegExp(escapeRegExp(command.usage)));
  }
  assert.doesNotMatch(
    JSON.stringify(commandReferences),
    /divebell mf trace|divebell mf remote check|divebell mf preload trace/
  );
});

test("public build output has no external runtime imports or embedded MF CLI guidance", () => {
  const publicFiles = [
    "public.js",
    "function-location.js",
    "reader.js",
    "selection.js",
    "results.js",
    "errors.js",
    "types.js",
    "bridge/aggregate.js",
    "bridge/selection.js",
    "bridge/result.js",
    "bridge/types.js",
    "remote/errors.js",
    "remote/selection.js",
    "remote/results.js",
    "remote/types.js",
    "shared/capability.js",
    "shared/selection.js",
    "shared/status.js",
    "shared/trace.js",
    "shared/types.js"
  ];
  const sources = publicFiles.map((file) =>
    readFileSync(resolve(packageRoot, "dist", file), "utf8")
  );
  for (const source of sources) {
    assert.doesNotMatch(
      source,
      /(?:from|import\()\s*["'](?!\.\.?\/|node:)/
    );
  }
  assert.doesNotMatch(sources.join("\n"), /divebell mf (?:status|module-info|remote status|remote trace|shared status|shared trace|bridge trace)/);
});

test("packed npm archive is self-contained and has no runtime dependencies", () => {
  const outputDirectory = mkdtempSync(join(tmpdir(), "divebell-extension-mf-pack-"));
  try {
    const packed = spawnSync("pnpm", ["pack", "--pack-destination", outputDirectory], {
      cwd: packageRoot,
      encoding: "utf8"
    });
    assert.equal(packed.status, 0, packed.stderr);
    const archive = join(outputDirectory, "divebell-extension-mf-0.0.0.tgz");
    const listed = spawnSync("tar", ["-tf", archive], { encoding: "utf8" });
    assert.equal(listed.status, 0, listed.stderr);
    assert.match(listed.stdout, /package\/dist\/extension\.js/);
    assert.doesNotMatch(
      listed.stdout,
      /package\/dist\/commands\/(?:trace|preload-trace|remote-check)\./
    );
    assert.match(listed.stdout, /package\/dist\/package\.js/);
    assert.match(listed.stdout, /package\/dist\/package\.d\.ts/);
    assert.match(listed.stdout, /package\/dist\/public\.js/);
    assert.match(listed.stdout, /package\/dist\/public\.d\.ts/);
    assert.match(listed.stdout, /package\/dist\/extension\.d\.ts/);
    assert.match(listed.stdout, /package\/dist\/observability-chrome-devtool\.iife\.js/);
    assert.match(listed.stdout, /package\/dist\/install-observability\.js/);
    assert.match(listed.stdout, /package\/dist\/observability-build\.json/);
    assert.match(listed.stdout, /package\/dist\/install-runtime-debug\.js/);
    assert.match(listed.stdout, /package\/dist\/runtime-debug-build\.json/);
    assert.match(listed.stdout, /package\/dist\/vmok-proxy-sdk\.iife\.js/);
    assert.match(listed.stdout, /package\/dist\/proxy-sdk-build\.json/);
    assert.match(listed.stdout, /package\/README\.md/);
    const metadata = spawnSync("tar", [
      "-xOf",
      archive,
      "package/dist/observability-build.json"
    ], { encoding: "utf8" });
    assert.equal(metadata.status, 0, metadata.stderr);
    assert.doesNotMatch(metadata.stdout, /\/Users\/|outter\/core|registry|token/i);
    const runtimeMetadata = spawnSync("tar", [
      "-xOf",
      archive,
      "package/dist/runtime-debug-build.json"
    ], { encoding: "utf8" });
    assert.equal(runtimeMetadata.status, 0, runtimeMetadata.stderr);
    assert.doesNotMatch(runtimeMetadata.stdout, /\/Users\/|outter\/core|registry|token/i);
    const proxyMetadata = spawnSync("tar", [
      "-xOf",
      archive,
      "package/dist/proxy-sdk-build.json"
    ], { encoding: "utf8" });
    assert.equal(proxyMetadata.status, 0, proxyMetadata.stderr);
    assert.doesNotMatch(proxyMetadata.stdout, /\/Users\/|work\/garfish|registry|token/i);
    const publicTypes = spawnSync("tar", [
      "-xOf",
      archive,
      "package/dist/public.d.ts"
    ], { encoding: "utf8" });
    assert.equal(publicTypes.status, 0, publicTypes.stderr);
    assert.match(publicTypes.stdout, /types\.js/);
    const reportTypes = readFileSync(resolve(packageRoot, "dist", "types.d.ts"), "utf8");
    assert.match(reportTypes, /interface RuntimeResource/);
    assert.match(reportTypes, /interface RuntimeShared/);
    assert.match(reportTypes, /interface RuntimeBridgeInfo/);
    const packageJson = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
    assert.equal(packageJson.dependencies, undefined);
    assert.equal(packageJson.divebell.extensions[0], "./dist/extension.js");
    assert.equal(packageJson.exports["."].import, "./dist/package.js");
    assert.equal(packageJson.exports["./core"].import, "./dist/public.js");
    assert.deepEqual(Object.keys(packageJson.exports), [".", "./core"]);

    const extracted = join(outputDirectory, "extracted");
    mkdirSync(extracted);
    const unpacked = spawnSync("tar", ["-xzf", archive, "-C", extracted], {
      encoding: "utf8"
    });
    assert.equal(unpacked.status, 0, unpacked.stderr);
    const publishedSource = listFiles(extracted)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    assert.doesNotMatch(publishedSource, /\/Users\/|outter\/core/);
    assert.doesNotMatch(publishedSource, /(?:"|')(?:file|link):(?:\/|\.)/);
    const publishedBundle = readFileSync(
      join(extracted, "package", "dist", "observability-chrome-devtool.iife.js"),
      "utf8"
    );
    assert.doesNotMatch(publishedBundle, /\brequire\s*\(|\bimport\s*\(|\bimport\s+[\w{*]/);
    const publishedProxyBundle = readFileSync(
      join(extracted, "package", "dist", "vmok-proxy-sdk.iife.js"),
      "utf8"
    );
    assert.doesNotMatch(
      publishedProxyBundle,
      /\brequire\s*\(|\bimport\s*\(|\bimport\s+[\w{*]/
    );
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
});

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : statSync(path).isFile() ? [path] : [];
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("packed archive supports real package-name imports for public API and extension", () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "divebell-extension-mf-public-import-"));
  const packDirectory = join(tempDirectory, "pack");
  try {
    mkdirSync(packDirectory, { recursive: true });
    const packed = spawnSync("pnpm", ["pack", "--pack-destination", packDirectory], {
      cwd: packageRoot,
      encoding: "utf8"
    });
    assert.equal(packed.status, 0, packed.stderr);
    const archive = join(packDirectory, "divebell-extension-mf-0.0.0.tgz");
    const installed = spawnSync("npm", [
      "install",
      "--ignore-scripts",
      "--no-package-lock",
      archive
    ], {
      cwd: tempDirectory,
      encoding: "utf8",
      env: {
        ...process.env,
        npm_config_cache: join(tempDirectory, "npm-cache")
      }
    });
    assert.equal(installed.status, 0, installed.stderr);
    const imported = spawnSync(process.execPath, [
      "--input-type=module",
      "-e",
      `const extension = await import("@divebell/extension-mf");
       const api = await import("@divebell/extension-mf/core");
       const names = ["readMfObservability", "parseBrowserReadResult", "parseRuntimeState", "selectStatusInstances", "selectConsumer", "selectRemote", "createStatusResult", "createModuleInfoResult", "createCompatibilitySummary", "filterGlobalShared", "filterRelationshipsForInstances", "collectBridgeOperations", "listBridgeCurrentStates", "selectBridgeTrace", "createBridgeTraceResult", "selectRemoteTrace", "selectRemoteStatus", "createRemoteTraceResult", "createRemoteStatusResult", "buildRemoteTrace", "selectSharedInstances", "createSharedStatusResult", "createSharedTraceResult", "groupSharedTraceOperations"];
       if (!names.every((name) => typeof api[name] === "function")) process.exit(2);
       if (!names.every((name) => typeof extension[name] === "function")) process.exit(4);
       if ("formatRemoteTrace" in api || "formatRemoteStatus" in api) process.exit(5);
       if (extension.default?.name !== "mf") process.exit(3);`
    ], {
      cwd: tempDirectory,
      encoding: "utf8"
    });
    assert.equal(imported.status, 0, imported.stderr);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("packed archive installs and loads through the external extension mechanism", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "divebell-extension-mf-install-"));
  const packDirectory = join(tempDirectory, "pack");
  const extensionsDirectory = join(tempDirectory, "extensions");
  try {
    mkdirSync(packDirectory, { recursive: true });
    const packed = spawnSync("pnpm", ["pack", "--pack-destination", packDirectory], {
      cwd: packageRoot,
      encoding: "utf8"
    });
    assert.equal(packed.status, 0, packed.stderr);
    const archive = join(packDirectory, "divebell-extension-mf-0.0.0.tgz");
    let stdout = "";
    let stderr = "";
    const cli = createDivebellCli();
    const exitCode = await cli.run([
      "extensions",
      "add",
      "@divebell/extension-mf"
    ], {
      stdout: { write(chunk) { stdout += chunk; } },
      stderr: { write(chunk) { stderr += chunk; } },
      extensionsDirectory,
      extensionPackageDownloader: {
        download: async () => archive
      }
    });
    assert.equal(exitCode, 0, stderr);
    assert.equal(JSON.parse(stdout).package.name, "@divebell/extension-mf");

    const loaded = await createDivebellCliWithExternalExtensions({}, {
      ...process.env,
      DIVEBELL_EXTENSIONS_DIR: extensionsDirectory,
      DIVEBELL_DISABLE_EXTENSIONS: "0"
    });
    assert.deepEqual(loaded.cli.extensions.map((extension) => extension.name), ["mf"]);
    assert.deepEqual(loaded.cli.extensions[0].commands.map((command) => command.name), ["mf"]);
    assert.equal(typeof loaded.cli.extensions[0].hooks.open, "function");
    let rootHelp = "";
    const rootHelpExitCode = await loaded.cli.run(["--help"], {
      stdout: { write(chunk) { rootHelp += chunk; } },
      stderr: { write() {} }
    });
    assert.equal(rootHelpExitCode, 0);
    assert.match(rootHelp, /External Extensions:/);
    assert.match(rootHelp, /divebell mf/);

    let commandHelp = "";
    const commandHelpExitCode = await loaded.cli.run(["mf", "--help"], {
      stdout: { write(chunk) { commandHelp += chunk; } },
      stderr: { write() {} }
    });
    assert.equal(commandHelpExitCode, 0);
    let previousIndex = -1;
    for (const command of implementedMfCommandMetadata) {
      const index = commandHelp.indexOf(command.usage);
      assert.ok(index > previousIndex, `${command.usage} is missing or out of order in --help`);
      previousIndex = index;
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});
