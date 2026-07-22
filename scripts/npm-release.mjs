#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createNpmPublishArgs,
  redactCommandArgs,
  redactSensitiveText
} from "./npm-release-utils.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];
if (!["check", "pack", "publish"].includes(mode)) {
  throw new Error("Usage: node scripts/npm-release.mjs <check|pack|publish> [--output-dir <path>] [--otp <code>]");
}
const otp = getOption("--otp");
if (otp !== undefined && mode !== "publish") throw new Error("--otp is only supported in publish mode.");

const packageDefinitions = [
  { directory: "packages/core", filePrefix: "openruntime-core" },
  { directory: "packages/bridge", filePrefix: "openruntime-bridge" },
  { directory: "packages/chunk-map", filePrefix: "openruntime-chunk-map" },
  { directory: "packages/rspack-plugin", filePrefix: "openruntime-rspack-plugin" },
  { directory: "packages/modern-plugin", filePrefix: "openruntime-modern-plugin" },
  { directory: "packages/cli", filePrefix: "openruntime-cli" },
  { directory: "packages/extension-code-usage", filePrefix: "openruntime-extension-code-usage" },
  { directory: "packages/extension-troubleshooting", filePrefix: "openruntime-extension-troubleshooting" },
  { directory: "packages/extension-imitate", filePrefix: "openruntime-extension-imitate" },
  { directory: "packages/extension-memory", filePrefix: "openruntime-extension-memory" },
  { directory: "packages/extension-mf", filePrefix: "openruntime-extension-mf" }
];
const packages = await Promise.all(packageDefinitions.map(async (definition) => ({
  ...definition,
  packageJson: JSON.parse(await readFile(resolve(repositoryRoot, definition.directory, "package.json"), "utf8"))
})));
const versions = new Set(packages.map((item) => item.packageJson.version));
if (versions.size !== 1) throw new Error("All OpenRuntime packages must use the same release version.");
const version = packages[0].packageJson.version;

if (mode === "check") {
  for (const item of packages) requirePublished(item.packageJson.name, version);
  writeResult({ checked: packages.map((item) => item.packageJson.name) });
  process.exit(0);
}

const outputDirectory = resolve(repositoryRoot, getOption("--output-dir") ?? "dist/npm-release");
await mkdir(outputDirectory, { recursive: true });
const archives = [];
for (const item of packages) {
  const archive = join(outputDirectory, `${item.filePrefix}-${version}.tgz`);
  await rm(archive, { force: true });
  runOrThrow("pnpm", [
    "--dir",
    resolve(repositoryRoot, item.directory),
    "pack",
    "--pack-destination",
    outputDirectory
  ]);
  await validateArchive(archive, item.packageJson.name, version);
  archives.push({ name: item.packageJson.name, archive });
}

const published = [];
const skipped = [];
if (mode === "publish") {
  requireNpmVersion("11.5.1");
  for (const item of archives) {
    if (isPublished(item.name, version)) {
      skipped.push(item.name);
      continue;
    }
    runOrThrow("npm", createNpmPublishArgs(item.archive, otp), {
      printOutput: true,
      sensitiveValues: otp === undefined ? [] : [otp]
    });
    published.push(item.name);
  }
  for (const name of published) await waitForPublished(name, version);
}

writeResult({
  outputDirectory,
  archives,
  published,
  skipped
});

async function validateArchive(archive, expectedName, expectedVersion) {
  const info = await stat(archive);
  if (!info.isFile() || info.size === 0) throw new Error(`Missing npm archive: ${archive}`);
  const result = spawnSync("tar", ["-xOzf", archive, "package/package.json"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Could not inspect ${archive}: ${formatResult(result)}`);
  const packed = JSON.parse(result.stdout);
  if (packed.name !== expectedName || packed.version !== expectedVersion) {
    throw new Error(`Unexpected package identity in ${archive}: ${packed.name}@${packed.version}`);
  }
  const dependencyValues = Object.values({
    ...packed.dependencies,
    ...packed.optionalDependencies,
    ...packed.peerDependencies
  });
  if (dependencyValues.some((value) => typeof value === "string" && value.startsWith("workspace:"))) {
    throw new Error(`${expectedName} still contains a workspace dependency after packing.`);
  }
  if (packed.openruntime?.extensions !== undefined && dependencyValues.length > 0) {
    throw new Error(`${expectedName} extension packages must not declare runtime dependencies.`);
  }
}

function requirePublished(name, packageVersion) {
  if (!isPublished(name, packageVersion)) {
    throw new Error(`${name}@${packageVersion} is not published. Bootstrap it before preparing the next OIDC release.`);
  }
}

async function waitForPublished(name, packageVersion) {
  const attempts = 10;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      if (isPublished(name, packageVersion)) return;
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await delay(3000);
  }
  const detail = lastError === undefined ? "The registry still returns 404." : lastError.message;
  throw new Error(`${name}@${packageVersion} publish exited successfully but could not be confirmed after ${attempts} attempts. ${detail}`);
}

function isPublished(name, packageVersion) {
  const result = spawnSync("npm", [
    "view",
    `${name}@${packageVersion}`,
    "version",
    "--json",
    "--registry",
    "https://registry.npmjs.org"
  ], { encoding: "utf8" });
  if (result.status === 0) return true;
  const detail = formatResult(result);
  if (detail.includes("E404") || detail.includes("404 Not Found")) return false;
  throw new Error(`Could not check ${name}@${packageVersion}: ${detail}`);
}

function requireNpmVersion(minimum) {
  const result = spawnSync("npm", ["--version"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Could not read npm version: ${formatResult(result)}`);
  const current = result.stdout.trim();
  if (compareVersions(current, minimum) < 0) {
    throw new Error(`npm ${minimum} or newer is required for OIDC trusted publishing; received ${current}.`);
  }
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

function runOrThrow(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: process.env
  });
  const sensitiveValues = options.sensitiveValues ?? [];
  if (options.printOutput === true) {
    if (result.stdout) process.stdout.write(redactSensitiveText(result.stdout, sensitiveValues));
    if (result.stderr) process.stderr.write(redactSensitiveText(result.stderr, sensitiveValues));
  }
  if (result.status !== 0) {
    const safeArgs = redactCommandArgs(args);
    const detail = redactSensitiveText(formatResult(result), sensitiveValues);
    throw new Error(`${command} ${safeArgs.join(" ")} failed.\n${detail}`);
  }
}

function formatResult(result) {
  return [result.error?.message, result.stderr, result.stdout]
    .map((value) => typeof value === "string" ? value.trim() : "")
    .filter(Boolean)
    .join("\n");
}

function writeResult(extra) {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    mode,
    version,
    ...extra
  }, null, 2)}\n`);
}

function getOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
