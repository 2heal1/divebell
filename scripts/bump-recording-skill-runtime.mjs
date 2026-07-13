#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(repositoryRoot, getOption("--manifest") ??
  "skills/record-openruntime-workflow/references/openruntime-cli-runtime.json");
const bump = process.argv.slice(2).find((value) => !value.startsWith("--"));
if (!["patch", "minor", "major"].includes(bump)) {
  throw new Error("Usage: node scripts/bump-recording-skill-runtime.mjs <patch|minor|major> [--dry-run]");
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const currentVersion = manifest.version;
const version = bumpVersion(currentVersion, bump);
const tag = `recording-skill-runtime-v${version}`;
const assetName = `openruntime-recording-runtime-${version}.tgz`;
const baseUrl = `https://github.com/${manifest.repository}/releases/download/${tag}`;
const nextManifest = {
  ...manifest,
  version,
  tag,
  asset: {
    name: assetName,
    url: `${baseUrl}/${assetName}`,
    checksumName: `${assetName}.sha256`,
    checksumUrl: `${baseUrl}/${assetName}.sha256`
  }
};

if (!process.argv.includes("--dry-run")) {
  await writeFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  bump,
  currentVersion,
  version,
  tag,
  asset: nextManifest.asset.name,
  manifest: manifestPath,
  dryRun: process.argv.includes("--dry-run")
}, null, 2)}\n`);

function bumpVersion(input, type) {
  const match = String(input).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (match === null) throw new Error(`Runtime version is not semver: ${input}`);
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
