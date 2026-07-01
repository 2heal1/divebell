#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = dirname(scriptPath);
const skillDirectory = resolve(scriptDirectory, "..");
const referenceDirectory = join(skillDirectory, "references", "openruntime-cli");
const installDirectory = process.env.OPENRUNTIME_SKILL_CLI_HOME ??
  join(homedir(), ".cache", "record-openruntime-workflow", "openruntime-cli");
const binName = process.platform === "win32" ? "openruntime.cmd" : "openruntime";
const installedCli = join(installDirectory, "node_modules", ".bin", binName);
const userArgs = process.argv.slice(2);

const explicitCli = process.env.OPENRUNTIME_CLI;
if (explicitCli !== undefined && explicitCli.length > 0 && !isSelfReference(explicitCli)) {
  runOrExit(toInvocation(explicitCli), userArgs);
}

if (await canRun(toInvocation(installedCli))) {
  runOrExit(toInvocation(installedCli), userArgs);
}

if (await hasBundledPackages(referenceDirectory)) {
  const installResult = installBundledCli(referenceDirectory, installDirectory);
  if (installResult.status === 0 && await canRun(toInvocation(installedCli))) {
    runOrExit(toInvocation(installedCli), userArgs);
  }

  process.stderr.write([
    "Failed to prepare the bundled OpenRuntime CLI.",
    formatSpawnText(installResult.stderr),
    formatSpawnText(installResult.stdout),
    installResult.error?.message
  ].filter(Boolean).join("\n") + "\n");
}

for (const command of ["openruntime", "open-runtime"]) {
  const invocation = toInvocation(command);
  if (await canRun(invocation)) {
    runOrExit(invocation, userArgs);
  }
}

process.stderr.write([
  "OpenRuntime CLI was not found.",
  `Bundled packages directory: ${referenceDirectory}`,
  "Set OPENRUNTIME_CLI=/absolute/path/to/openruntime, or install @openruntime/cli and retry."
].join("\n") + "\n");
process.exit(127);

function toInvocation(command) {
  if (command.endsWith(".js") || command.endsWith(".mjs")) {
    return {
      command: process.execPath,
      args: [command]
    };
  }
  return {
    command,
    args: []
  };
}

function isSelfReference(command) {
  if (!command.endsWith(".js") && !command.endsWith(".mjs") && !command.includes("/") && !command.includes("\\")) {
    return false;
  }
  try {
    return resolve(command) === scriptPath;
  } catch {
    return false;
  }
}

async function canRun(invocation) {
  if (invocation.args.length > 0) {
    const filePath = invocation.args[0];
    try {
      await access(filePath, constants.R_OK);
    } catch {
      return false;
    }
  }

  const result = spawnSync(invocation.command, [...invocation.args, "--help"], {
    env: process.env,
    stdio: "ignore"
  });
  return result.status === 0;
}

function runOrExit(invocation, args) {
  const result = spawnSync(invocation.command, [...invocation.args, ...args], {
    env: process.env,
    stdio: "inherit"
  });
  if (result.error !== undefined) {
    process.stderr.write(`${result.error.message}\n`);
    process.exit(127);
  }
  process.exit(result.status ?? 1);
}

async function hasBundledPackages(directory) {
  const packages = getBundledPackagePaths(directory);
  for (const packagePath of packages) {
    try {
      const info = await stat(packagePath);
      if (!info.isFile()) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function getBundledPackagePaths(directory) {
  return [
    join(directory, "next-playwright-16.2.0-canary.80.tgz"),
    join(directory, "source-map-js-1.2.1.tgz"),
    join(directory, "playwright-core-1.60.0.tgz"),
    join(directory, "playwright-1.60.0.tgz"),
    join(directory, "vercel-next-browser-0.7.1.tgz"),
    join(directory, "openruntime-core-0.1.0.tgz"),
    join(directory, "openruntime-bridge-0.1.0.tgz"),
    join(directory, "openruntime-cli-0.1.0.tgz")
  ];
}

function installBundledCli(directory, destination) {
  const packages = getBundledPackagePaths(directory);
  const mkdirResult = spawnSync(process.execPath, [
    "-e",
    `require("node:fs").mkdirSync(${JSON.stringify(destination)}, { recursive: true })`
  ], {
    stdio: "ignore"
  });
  if (mkdirResult.status !== 0) {
    return {
      status: mkdirResult.status ?? 1,
      stdout: "",
      stderr: "Could not create the OpenRuntime CLI install directory."
    };
  }

  return spawnSync("npm", [
    "install",
    "--prefix",
    destination,
    "--offline",
    "--omit=dev",
    "--omit=optional",
    "--no-audit",
    "--no-fund",
    "--loglevel=error",
    ...packages
  ], {
    encoding: "utf8",
    timeout: getInstallTimeout(),
    env: {
      ...process.env,
      npm_config_cache: process.env.npm_config_cache ?? join(destination, ".npm-cache"),
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD ?? "1"
    }
  });
}

function formatSpawnText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getInstallTimeout() {
  const value = Number(process.env.OPENRUNTIME_SKILL_CLI_INSTALL_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : 60_000;
}
