#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readDivebellReleasePackages } from "./divebell-release-packages.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(
  repositoryRoot,
  "skills/record-divebell-workflow/references/divebell-cli-runtime.json"
);
const requestedVersion = getOption("--version");
if (requestedVersion === undefined) {
  throw new Error("Usage: node scripts/validate-divebell-release-state.mjs --version <version>");
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const packages = await readDivebellReleasePackages(repositoryRoot);
if (manifest.version !== requestedVersion) {
  throw new Error(`Requested release ${requestedVersion} does not match manifest ${manifest.version}.`);
}
for (const item of packages) {
  if (item.packageJson.version !== requestedVersion) {
    throw new Error(`${item.name} is ${item.packageJson.version}, expected ${requestedVersion}.`);
  }
}

const expectedTag = `recording-skill-runtime-v${requestedVersion}`;
const expectedAsset = `divebell-recording-runtime-${requestedVersion}.tgz`;
const expectedBaseUrl = `https://github.com/${manifest.repository}/releases/download/${expectedTag}`;
if (manifest.tag !== expectedTag ||
    manifest.asset?.name !== expectedAsset ||
    manifest.asset?.url !== `${expectedBaseUrl}/${expectedAsset}` ||
    manifest.asset?.checksumName !== `${expectedAsset}.sha256` ||
    manifest.asset?.checksumUrl !== `${expectedBaseUrl}/${expectedAsset}.sha256`) {
  throw new Error(`Recording runtime metadata does not match release ${requestedVersion}.`);
}

const packageByDirectory = new Map(packages.map((item) => [item.directory, item]));
for (const item of manifest.packages) {
  if (item.source !== "workspace") continue;
  const workspacePackage = packageByDirectory.get(item.directory);
  if (workspacePackage === undefined) {
    throw new Error(`Unknown workspace runtime package: ${item.directory}`);
  }
  if (item.name !== workspacePackage.name) {
    throw new Error(`Runtime package ${item.directory} must be named ${workspacePackage.name}.`);
  }
  const expectedFile = `${workspacePackage.filePrefix}-${requestedVersion}.tgz`;
  if (item.file !== expectedFile) {
    throw new Error(`${item.name} runtime archive must be ${expectedFile}.`);
  }
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  version: requestedVersion,
  tag: expectedTag,
  packages: packages.map((item) => item.name)
}, null, 2)}\n`);

function getOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}
