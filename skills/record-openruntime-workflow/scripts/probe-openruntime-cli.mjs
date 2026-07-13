#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { accessSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  hasRuntimePackages,
  readRuntimeManifest,
  resolveRuntimeLayout
} from "./runtime-release.mjs";

const timeoutMs = getTimeoutMs();
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const skillDirectory = resolve(scriptDirectory, "..");
const wrapperPath = join(scriptDirectory, "openruntime-cli.mjs");
const checkedAt = new Date().toISOString();

const candidates = uniqueCandidates([
  ...createOptionalEnvCandidate(),
  ...createLocalProjectCandidates(process.cwd()),
  { label: "PATH openruntime", command: "openruntime", args: [] },
  { label: "PATH open-runtime", command: "open-runtime", args: [] },
  { label: "PATH opr", command: "opr", args: [] }
]);

const results = candidates.map((candidate) => probeCandidate(candidate, timeoutMs));
const usable = results.filter((candidate) => candidate.usable);
let bundled;
try {
  const manifest = await readRuntimeManifest(skillDirectory);
  const layout = resolveRuntimeLayout(manifest);
  const cached = await hasRuntimePackages(manifest, layout.packageDirectory);
  bundled = {
    available: true,
    source: "github-release",
    version: manifest.version,
    tag: manifest.tag,
    url: manifest.asset.url,
    cached,
    requiresDownload: !cached,
    command: `node ${wrapperPath}`,
    installOnUse: true,
    cacheDirectory: layout.versionDirectory
  };
} catch (error) {
  bundled = {
    available: false,
    source: "github-release",
    command: `node ${wrapperPath}`,
    error: error instanceof Error ? error.message : String(error)
  };
}

const result = {
  ok: true,
  checkedAt,
  timeoutMs,
  candidates: results,
  bundled,
  recommendation: usable.length > 0 ? "ask-to-reuse-detected-cli" : "use-release-runtime"
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

function getTimeoutMs() {
  const value = Number(process.env.OPENRUNTIME_SKILL_PROBE_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : 1500;
}

function createOptionalEnvCandidate() {
  const command = process.env.OPENRUNTIME_CLI;
  if (command === undefined || command.length === 0) return [];
  return [{
    label: "OPENRUNTIME_CLI",
    command,
    args: []
  }];
}

function createLocalProjectCandidates(startDirectory) {
  const candidates = [];
  let current = resolve(startDirectory);
  while (true) {
    const binName = process.platform === "win32" ? "openruntime.cmd" : "openruntime";
    const candidatePath = join(current, "node_modules", ".bin", binName);
    if (existsSync(candidatePath)) {
      candidates.push({
        label: "project node_modules",
        command: candidatePath,
        args: []
      });
    }
    const parent = dirname(current);
    if (parent === current) return candidates;
    current = parent;
  }
}

function uniqueCandidates(input) {
  const seen = new Set();
  const output = [];
  for (const candidate of input) {
    const key = `${candidate.command}\0${candidate.args.join("\0")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(candidate);
  }
  return output;
}

function probeCandidate(candidate, timeout) {
  const startedAt = Date.now();
  const exists = commandLooksAvailable(candidate.command);
  if (!exists) {
    return {
      ...candidate,
      available: false,
      usable: false,
      elapsedMs: Date.now() - startedAt,
      reason: "not-found"
    };
  }

  const result = spawnSync(candidate.command, [...candidate.args, "--help"], {
    encoding: "utf8",
    timeout
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const supportsRecordStart = hasRecordStartCommand(output);
  return {
    ...candidate,
    available: true,
    usable: result.status === 0 && supportsRecordStart,
    elapsedMs: Date.now() - startedAt,
    exitCode: result.status,
    timedOut: Boolean(result.error && result.error.name === "Error" && result.error.message.includes("ETIMEDOUT")),
    supportsRecordStart,
    supportsDefaultRecordStart: output.includes("record start [--url <url>] [--out <path>]"),
    error: result.error?.message
  };
}

function hasRecordStartCommand(output) {
  return output.includes("openruntime record start") || output.includes("open-runtime record start");
}

function commandLooksAvailable(command) {
  if (command.includes("/") || command.includes("\\")) {
    try {
      accessSync(command, constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }
  const pathValue = process.env.PATH ?? "";
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];
  for (const directory of pathValue.split(process.platform === "win32" ? ";" : ":")) {
    if (directory.length === 0) continue;
    for (const extension of extensions) {
      if (existsSync(join(directory, `${command}${extension}`))) return true;
    }
  }
  return false;
}
