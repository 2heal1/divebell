#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = "skills/record-openruntime-workflow/references/openruntime-cli-runtime.json";
const packagePaths = [
  "packages/core/package.json",
  "packages/bridge/package.json",
  "packages/modern-plugin/package.json",
  "packages/cli/package.json"
];
const allowedFiles = new Set([...packagePaths, manifestPath]);
const branch = getOption("--branch");
const changedFilesPath = getOption("--changed-files");
const baseRevision = getOption("--base");
if (branch === undefined || changedFilesPath === undefined || baseRevision === undefined) {
  throw new Error("Usage: node scripts/validate-openruntime-release.mjs --branch <name> --base <revision> --changed-files <path>");
}

const manifest = JSON.parse(await readFile(resolve(repositoryRoot, manifestPath), "utf8"));
const baseManifest = readJsonAtRevision(baseRevision, manifestPath);
const packages = await Promise.all(packagePaths.map(async (relativePath) => ({
  relativePath,
  value: JSON.parse(await readFile(resolve(repositoryRoot, relativePath), "utf8")),
  baseValue: readJsonAtRevision(baseRevision, relativePath)
})));
const version = manifest.version;
const allowedVersions = ["patch", "minor", "major"].map((type) => bumpVersion(baseManifest.version, type));
if (!allowedVersions.includes(version)) {
  throw new Error(`Release version must be one patch, minor, or major increment from ${baseManifest.version}; received ${version}.`);
}
const expectedBranch = `release/openruntime-v${version}`;
if (branch !== expectedBranch) throw new Error(`Release branch must be ${expectedBranch}; received ${branch}.`);

for (const item of packages) {
  if (item.baseValue.version !== baseManifest.version) {
    throw new Error(`${item.baseValue.name} base version is ${item.baseValue.version}, expected ${baseManifest.version}.`);
  }
  if (item.value.version !== version) {
    throw new Error(`${item.value.name} is ${item.value.version}, expected ${version}.`);
  }
  assertEqualWithoutReleaseFields(
    item.value,
    item.baseValue,
    `${item.value.name} package metadata changed outside the version field.`,
    normalizePackage
  );
}

assertEqualWithoutReleaseFields(
  manifest,
  baseManifest,
  "Recording runtime manifest changed outside release fields.",
  normalizeManifest
);

const changedFiles = (await readFile(resolve(changedFilesPath), "utf8"))
  .split(/\r?\n/)
  .map((value) => value.trim())
  .filter(Boolean);
if (changedFiles.length !== allowedFiles.size || changedFiles.some((file) => !allowedFiles.has(file))) {
  throw new Error(`Release PR may only change version files. Received: ${changedFiles.join(", ")}`);
}
for (const file of allowedFiles) {
  if (!changedFiles.includes(file)) throw new Error(`Release PR did not change required file: ${file}`);
}

const expectedTag = `recording-skill-runtime-v${version}`;
const expectedAsset = `openruntime-recording-runtime-${version}.tgz`;
if (manifest.tag !== expectedTag || manifest.asset?.name !== expectedAsset) {
  throw new Error("Recording runtime tag and asset must match the release version.");
}
const expectedBaseUrl = `https://github.com/${manifest.repository}/releases/download/${expectedTag}`;
if (manifest.asset.url !== `${expectedBaseUrl}/${expectedAsset}` ||
    manifest.asset.checksumName !== `${expectedAsset}.sha256` ||
    manifest.asset.checksumUrl !== `${expectedBaseUrl}/${expectedAsset}.sha256`) {
  throw new Error("Recording runtime download URLs must match the release version.");
}

const packageByDirectory = new Map(packages.map((item) => [dirname(item.relativePath), item.value]));
for (const item of manifest.packages) {
  if (item.source !== "workspace") continue;
  const packageValue = packageByDirectory.get(item.directory);
  if (packageValue === undefined) throw new Error(`Unknown workspace runtime package: ${item.directory}`);
  const expectedFile = `${packageValue.name.replace(/^@/, "").replaceAll("/", "-")}-${version}.tgz`;
  if (item.file !== expectedFile) throw new Error(`${item.name} runtime archive must be ${expectedFile}.`);
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  branch,
  version,
  files: changedFiles,
  packages: packages.map((item) => item.value.name)
}, null, 2)}\n`);

function getOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function readJsonAtRevision(revision, relativePath) {
  const result = spawnSync("git", ["show", `${revision}:${relativePath}`], {
    cwd: repositoryRoot,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`Could not read ${relativePath} at ${revision}: ${result.stderr.trim()}`);
  }
  return JSON.parse(result.stdout);
}

function normalizePackage(value) {
  const clone = structuredClone(value);
  delete clone.version;
  return clone;
}

function normalizeManifest(value) {
  const clone = structuredClone(value);
  delete clone.version;
  delete clone.tag;
  delete clone.asset;
  clone.packages = clone.packages.map((item) => {
    if (item.source !== "workspace") return item;
    const normalized = { ...item };
    delete normalized.file;
    return normalized;
  });
  return clone;
}

function assertEqualWithoutReleaseFields(current, base, message, normalize) {
  if (JSON.stringify(normalize(current)) !== JSON.stringify(normalize(base))) {
    throw new Error(message);
  }
}

function bumpVersion(input, type) {
  const match = String(input).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (match === null) throw new Error(`Base release version is not semver: ${input}`);
  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);
  if (type === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (type === "minor") {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }
  return `${major}.${minor}.${patch}`;
}
