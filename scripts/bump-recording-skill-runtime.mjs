#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(repositoryRoot, getOption("--manifest") ??
  "skills/record-divebell-workflow/references/divebell-cli-runtime.json");
const packagePaths = [
  "packages/core/package.json",
  "packages/bridge/package.json",
  "packages/chunk-map/package.json",
  "packages/rspack-plugin/package.json",
  "packages/modern-plugin/package.json",
  "packages/cli/package.json",
  "packages/extension-code-usage/package.json",
  "packages/extension-troubleshooting/package.json",
  "packages/extension-imitate/package.json",
  "packages/extension-memory/package.json"
];
const bump = process.argv.slice(2).find((value) => !value.startsWith("--"));
if (!["patch", "minor", "major"].includes(bump)) {
  throw new Error("Usage: node scripts/bump-recording-skill-runtime.mjs <patch|minor|major> [--dry-run]");
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const packages = await Promise.all(packagePaths.map(async (relativePath) => ({
  relativePath,
  absolutePath: resolve(repositoryRoot, relativePath),
  value: JSON.parse(await readFile(resolve(repositoryRoot, relativePath), "utf8"))
})));
const currentVersion = manifest.version;
for (const item of packages) {
  if (item.value.version !== currentVersion) {
    throw new Error(`${item.value.name} is ${item.value.version}, expected ${currentVersion}. Release versions must stay aligned.`);
  }
}

const version = bumpVersion(currentVersion, bump);
const tag = `recording-skill-runtime-v${version}`;
const assetName = `divebell-recording-runtime-${version}.tgz`;
const baseUrl = `https://github.com/${manifest.repository}/releases/download/${tag}`;
const packageByDirectory = new Map(packages.map((item) => [
  dirname(item.relativePath),
  item.value
]));
const nextManifest = {
  ...manifest,
  version,
  tag,
  asset: {
    name: assetName,
    url: `${baseUrl}/${assetName}`,
    checksumName: `${assetName}.sha256`,
    checksumUrl: `${baseUrl}/${assetName}.sha256`
  },
  packages: manifest.packages.map((item) => {
    if (item.source !== "workspace") return item;
    const packageValue = packageByDirectory.get(item.directory);
    if (packageValue === undefined) throw new Error(`Unknown workspace runtime package: ${item.directory}`);
    return {
      ...item,
      file: `${packageValue.name.replace(/^@/, "").replaceAll("/", "-")}-${version}.tgz`
    };
  })
};
const dryRun = process.argv.includes("--dry-run");

if (!dryRun) {
  await Promise.all(packages.map((item) => writeFile(item.absolutePath, `${JSON.stringify({
    ...item.value,
    version
  }, null, 2)}\n`, "utf8")));
  await writeFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  bump,
  currentVersion,
  version,
  tag,
  asset: nextManifest.asset.name,
  packages: packages.map((item) => item.value.name),
  files: [...packagePaths, "skills/record-divebell-workflow/references/divebell-cli-runtime.json"],
  dryRun
}, null, 2)}\n`);

function bumpVersion(input, type) {
  const match = String(input).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (match === null) throw new Error(`Release version is not semver: ${input}`);
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

function getOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}
