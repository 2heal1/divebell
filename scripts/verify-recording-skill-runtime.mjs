#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(repositoryRoot, getOption("--manifest") ??
  "skills/record-divebell-workflow/references/divebell-cli-runtime.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const outputDirectory = resolve(repositoryRoot, getOption("--output-dir") ?? "dist/recording-skill-runtime");
const archivePath = join(outputDirectory, manifest.asset.name);
const checksumPath = join(outputDirectory, manifest.asset.checksumName);
const wrapperPath = join(repositoryRoot, "skills", "record-divebell-workflow", "scripts", "divebell-cli.mjs");
const tempDirectory = await mkdtemp(join(tmpdir(), "divebell-recording-runtime-verify-"));

try {
  await requireFile(archivePath);
  await requireFile(checksumPath);
  const baseEnv = {
    ...process.env,
    DIVEBELL_CLI: "",
    DIVEBELL_SKILL_CLI_HOME: join(tempDirectory, "cache"),
    DIVEBELL_SKILL_RUNTIME_ARCHIVE: archivePath,
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"
  };

  const first = runWrapper(wrapperPath, baseEnv);
  assertRecordHelp(first, "fresh runtime install");

  const second = runWrapper(wrapperPath, {
    ...baseEnv,
    DIVEBELL_SKILL_RUNTIME_ARCHIVE: join(tempDirectory, "missing-runtime.tgz")
  });
  assertRecordHelp(second, "cached runtime reuse");

  process.stdout.write(`${JSON.stringify({
    ok: true,
    version: manifest.version,
    archive: archivePath,
    verified: ["fresh-install", "cached-reuse"]
  }, null, 2)}\n`);
} finally {
  await rm(tempDirectory, { recursive: true, force: true });
}

function runWrapper(wrapper, env) {
  return spawnSync(process.execPath, [wrapper, "record", "--help"], {
    cwd: repositoryRoot,
    env,
    encoding: "utf8",
    timeout: 120_000
  });
}

function assertRecordHelp(result, label) {
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.status !== 0 || !output.includes("record start")) {
    throw new Error(`${label} failed with exit ${result.status}.\n${output.trim()}`);
  }
}

async function requireFile(filePath) {
  const info = await stat(filePath);
  if (!info.isFile() || info.size === 0) throw new Error(`Missing runtime artifact: ${filePath}`);
}

function getOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}
