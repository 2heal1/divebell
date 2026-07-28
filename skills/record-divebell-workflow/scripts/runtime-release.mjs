import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MANIFEST_FILE = "divebell-cli-runtime.json";

export async function readRuntimeManifest(skillDirectory) {
  const manifestPath = join(skillDirectory, "references", MANIFEST_FILE);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  validateRuntimeManifest(manifest);
  return {
    ...manifest,
    manifestPath
  };
}

export function resolveRuntimeLayout(manifest) {
  const cacheRoot = resolve(process.env.DIVEBELL_SKILL_CLI_HOME ??
    join(homedir(), ".cache", "record-divebell-workflow", "divebell-cli"));
  const versionDirectory = join(cacheRoot, manifest.version);
  const packageDirectory = join(versionDirectory, "packages");
  const installDirectory = join(versionDirectory, "install");
  const binName = process.platform === "win32" ? "divebell.cmd" : "divebell";
  return {
    cacheRoot,
    versionDirectory,
    packageDirectory,
    installDirectory,
    installedCli: join(installDirectory, "node_modules", ".bin", binName),
    runtimeRecord: join(versionDirectory, "runtime.json")
  };
}

export function getRuntimePackagePaths(manifest, packageDirectory) {
  return manifest.packages.map((item) => join(packageDirectory, item.file));
}

export async function hasRuntimePackages(manifest, packageDirectory) {
  for (const packagePath of getRuntimePackagePaths(manifest, packageDirectory)) {
    try {
      const info = await stat(packagePath);
      if (!info.isFile()) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export async function prepareRuntimePackages(manifest, layout) {
  if (await hasRuntimePackages(manifest, layout.packageDirectory)) {
    return { cached: true, packageDirectory: layout.packageDirectory };
  }

  await mkdir(layout.versionDirectory, { recursive: true });
  const workingDirectory = await mkdtemp(join(layout.versionDirectory, "prepare-"));
  const archivePath = join(workingDirectory, manifest.asset.name);
  const extractDirectory = join(workingDirectory, "extract");

  try {
    const localArchive = process.env.DIVEBELL_SKILL_RUNTIME_ARCHIVE;
    if (localArchive !== undefined && localArchive.length > 0) {
      await copyFile(resolve(localArchive), archivePath);
    } else {
      await downloadFile(process.env.DIVEBELL_SKILL_RUNTIME_URL ?? manifest.asset.url, archivePath);
    }

    const expectedChecksum = await resolveExpectedChecksum(manifest, localArchive);
    const actualChecksum = await hashFile(archivePath);
    if (actualChecksum !== expectedChecksum) {
      throw new Error(`Runtime archive checksum mismatch: expected ${expectedChecksum}, received ${actualChecksum}.`);
    }

    validateArchiveEntries(archivePath);
    await mkdir(extractDirectory, { recursive: true });
    const extractResult = spawnSync("tar", ["-xzf", archivePath, "-C", extractDirectory], {
      encoding: "utf8"
    });
    if (extractResult.status !== 0) {
      throw new Error(`Could not extract runtime archive: ${formatSpawnResult(extractResult)}`);
    }

    const extractedPackages = join(extractDirectory, "packages");
    if (!await hasRuntimePackages(manifest, extractedPackages)) {
      throw new Error("Runtime archive does not contain every package declared by the manifest.");
    }

    await rm(layout.packageDirectory, { recursive: true, force: true });
    await rename(extractedPackages, layout.packageDirectory);
    await writeFile(layout.runtimeRecord, `${JSON.stringify({
      schemaVersion: manifest.schemaVersion,
      version: manifest.version,
      tag: manifest.tag,
      asset: manifest.asset.name,
      checksum: actualChecksum,
      preparedAt: new Date().toISOString()
    }, null, 2)}\n`, "utf8");

    return { cached: false, packageDirectory: layout.packageDirectory };
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

async function resolveExpectedChecksum(manifest, localArchive) {
  const explicitChecksum = process.env.DIVEBELL_SKILL_RUNTIME_SHA256;
  if (explicitChecksum !== undefined && explicitChecksum.length > 0) {
    return parseChecksum(explicitChecksum);
  }

  if (localArchive !== undefined && localArchive.length > 0) {
    const checksumPath = `${resolve(localArchive)}.sha256`;
    try {
      await access(checksumPath);
      return parseChecksum(await readFile(checksumPath, "utf8"));
    } catch {
      throw new Error("A local runtime archive requires DIVEBELL_SKILL_RUNTIME_SHA256 or a sibling .sha256 file.");
    }
  }

  const checksumUrl = process.env.DIVEBELL_SKILL_RUNTIME_SHA256_URL ?? manifest.asset.checksumUrl;
  const response = await fetchWithTimeout(checksumUrl);
  if (!response.ok) {
    throw new Error(`Could not download runtime checksum (${response.status}) from ${checksumUrl}.`);
  }
  return parseChecksum(await response.text());
}

async function downloadFile(url, destination) {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`Could not download runtime archive (${response.status}) from ${url}.`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  await writeFile(destination, bytes);
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getDownloadTimeout());
  const token = process.env.DIVEBELL_SKILL_RUNTIME_TOKEN;
  try {
    return await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: token === undefined || token.length === 0
        ? {}
        : { authorization: `Bearer ${token}` }
    });
  } finally {
    clearTimeout(timeout);
  }
}

function validateArchiveEntries(archivePath) {
  const listResult = spawnSync("tar", ["-tzf", archivePath], { encoding: "utf8" });
  if (listResult.status !== 0) {
    throw new Error(`Could not inspect runtime archive: ${formatSpawnResult(listResult)}`);
  }
  const entries = String(listResult.stdout ?? "").split("\n").filter(Boolean);
  if (entries.length === 0) throw new Error("Runtime archive is empty.");
  for (const entry of entries) {
    const normalized = entry.replace(/^\.\//, "").replace(/\/$/, "");
    const parts = normalized.split("/");
    if (isAbsolute(normalized) || parts.includes("..")) {
      throw new Error(`Runtime archive contains an unsafe path: ${entry}`);
    }
    if (normalized !== "runtime-manifest.json" && normalized !== "packages" && !normalized.startsWith("packages/")) {
      throw new Error(`Runtime archive contains an unexpected path: ${entry}`);
    }
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

function parseChecksum(value) {
  const match = String(value).trim().match(/^([a-f0-9]{64})(?:\s|$)/i);
  if (match === null) throw new Error("Runtime checksum must start with a SHA-256 value.");
  return match[1].toLowerCase();
}

function formatSpawnResult(result) {
  return [result.error?.message, result.stderr, result.stdout]
    .map((value) => typeof value === "string" ? value.trim() : "")
    .filter(Boolean)
    .join("\n");
}

function getDownloadTimeout() {
  const value = Number(process.env.DIVEBELL_SKILL_RUNTIME_DOWNLOAD_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : 120_000;
}

function validateRuntimeManifest(manifest) {
  if (manifest?.schemaVersion !== 1) throw new Error("Unsupported recording runtime manifest schema.");
  if (typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    throw new Error("Recording runtime manifest version must be semver.");
  }
  for (const key of ["tag", "repository"]) {
    if (typeof manifest[key] !== "string" || manifest[key].length === 0) {
      throw new Error(`Recording runtime manifest is missing ${key}.`);
    }
  }
  for (const key of ["name", "url", "checksumName", "checksumUrl"]) {
    if (typeof manifest.asset?.[key] !== "string" || manifest.asset[key].length === 0) {
      throw new Error(`Recording runtime manifest asset is missing ${key}.`);
    }
  }
  if (!Array.isArray(manifest.packages) || manifest.packages.length === 0) {
    throw new Error("Recording runtime manifest must declare packages.");
  }
  const files = new Set();
  for (const item of manifest.packages) {
    if (typeof item.file !== "string" || !item.file.endsWith(".tgz") || item.file.includes("/") || item.file.includes("\\")) {
      throw new Error("Recording runtime package filenames must be local .tgz names.");
    }
    if (files.has(item.file)) throw new Error(`Duplicate recording runtime package file: ${item.file}`);
    files.add(item.file);
  }
}
