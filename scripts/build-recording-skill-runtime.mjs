#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(repositoryRoot, getOption("--manifest") ??
  "skills/record-divebell-workflow/references/divebell-cli-runtime.json");
const outputDirectory = resolve(repositoryRoot, getOption("--output-dir") ?? "dist/recording-skill-runtime");
const packageSourceDirectory = getOption("--package-dir");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const workingDirectory = await mkdtemp(join(tmpdir(), "divebell-recording-runtime-"));
const stagingDirectory = join(workingDirectory, "staging");
const stagingPackages = join(stagingDirectory, "packages");
const archivePath = join(outputDirectory, manifest.asset.name);
const checksumPath = join(outputDirectory, manifest.asset.checksumName);

try {
  validateBuildManifest(manifest);
  await mkdir(stagingPackages, { recursive: true });
  if (packageSourceDirectory === undefined) {
    buildPackages(manifest, stagingPackages);
  } else {
    await copyPackages(manifest, resolve(repositoryRoot, packageSourceDirectory), stagingPackages);
  }
  await verifyPackages(manifest, stagingPackages);
  await copyFile(manifestPath, join(stagingDirectory, "runtime-manifest.json"));
  await mkdir(outputDirectory, { recursive: true });
  await rm(archivePath, { force: true });
  await rm(checksumPath, { force: true });
  createArchive(stagingDirectory, archivePath);
  const checksum = await hashFile(archivePath);
  await writeFile(checksumPath, `${checksum}  ${manifest.asset.name}\n`, "utf8");
  const archiveInfo = await stat(archivePath);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    version: manifest.version,
    tag: manifest.tag,
    archive: archivePath,
    checksum: checksumPath,
    sha256: checksum,
    size: archiveInfo.size
  }, null, 2)}\n`);
} finally {
  await rm(workingDirectory, { recursive: true, force: true });
}

function buildPackages(runtimeManifest, destination) {
  const registryPackages = runtimeManifest.packages.filter((item) => item.source === "registry");
  if (registryPackages.length > 0) {
    runOrThrow("npm", [
      "pack",
      ...registryPackages.map((item) => item.specifier),
      "--pack-destination",
      destination,
      "--ignore-scripts",
      "--silent"
    ]);
  }

  for (const item of runtimeManifest.packages) {
    if (item.source === "registry") continue;
    if (item.source === "workspace") {
      runOrThrow("pnpm", [
        "--dir",
        resolve(repositoryRoot, item.directory),
        "pack",
        "--pack-destination",
        destination
      ]);
      continue;
    }
    throw new Error(`Unsupported runtime package source: ${item.source}`);
  }
}

async function copyPackages(runtimeManifest, source, destination) {
  for (const item of runtimeManifest.packages) {
    await copyFile(join(source, item.file), join(destination, item.file));
  }
}

async function verifyPackages(runtimeManifest, directory) {
  for (const item of runtimeManifest.packages) {
    const info = await stat(join(directory, item.file));
    if (!info.isFile() || info.size === 0) {
      throw new Error(`Runtime package is missing or empty: ${item.file}`);
    }
  }
}

function createArchive(source, destination) {
  const deterministic = spawnSync("tar", [
    "--sort=name",
    "--mtime=@0",
    "--owner=0",
    "--group=0",
    "--numeric-owner",
    "-czf",
    destination,
    "-C",
    source,
    "runtime-manifest.json",
    "packages"
  ], { encoding: "utf8" });
  if (deterministic.status === 0) return;

  runOrThrow("tar", [
    "-czf",
    destination,
    "-C",
    source,
    "runtime-manifest.json",
    "packages"
  ]);
}

function runOrThrow(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD ?? "1"
    }
  });
  if (result.status !== 0) {
    const detail = [result.error?.message, result.stderr, result.stdout]
      .map((value) => typeof value === "string" ? value.trim() : "")
      .filter(Boolean)
      .join("\n");
    throw new Error(`${command} ${args.join(" ")} failed.\n${detail}`);
  }
}

function hashFile(filePath) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const input = createReadStream(filePath);
    input.on("error", reject);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", () => resolveHash(hash.digest("hex")));
  });
}

function getOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function validateBuildManifest(runtimeManifest) {
  if (runtimeManifest?.schemaVersion !== 1 || !Array.isArray(runtimeManifest.packages)) {
    throw new Error("Invalid recording runtime manifest.");
  }
  for (const item of runtimeManifest.packages) {
    if (item.source === "registry" && (typeof item.specifier !== "string" || item.specifier.length === 0)) {
      throw new Error(`Registry package ${item.name} is missing specifier.`);
    }
    if (item.source === "workspace" && (typeof item.directory !== "string" || item.directory.length === 0)) {
      throw new Error(`Workspace package ${item.name} is missing directory.`);
    }
  }
}
