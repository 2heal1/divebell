#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getRuntimePackagePaths,
  prepareRuntimePackages,
  readRuntimeManifest,
  resolveRuntimeLayout
} from "./runtime-release.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = dirname(scriptPath);
const skillDirectory = resolve(scriptDirectory, "..");
const runtimeManifest = await readRuntimeManifest(skillDirectory);
const runtimeLayout = resolveRuntimeLayout(runtimeManifest);
const installDirectory = runtimeLayout.installDirectory;
const installedCli = runtimeLayout.installedCli;
const managedExtensionsDirectory = join(installDirectory, "extensions");
const runtimeEnvironment = {
  ...process.env,
  OPENRUNTIME_EXTENSIONS_DIR: managedExtensionsDirectory
};
const userArgs = process.argv.slice(2);

const explicitCli = process.env.OPENRUNTIME_CLI;
if (explicitCli !== undefined && explicitCli.length > 0 && !isSelfReference(explicitCli)) {
  runOrExit(toInvocation(explicitCli), userArgs);
}

if (await canRun(toInvocation(installedCli), runtimeEnvironment) &&
    supportsRecordCommand(toInvocation(installedCli), runtimeEnvironment)) {
  runOrExit(toInvocation(installedCli), userArgs, runtimeEnvironment);
}

let runtimeFailure;
try {
  await prepareRuntimePackages(runtimeManifest, runtimeLayout);
  const installResult = installReleasedCli(runtimeManifest, runtimeLayout.packageDirectory, installDirectory);
  const commandResult = installResult.status === 0
    ? installReleasedRecordCommand(runtimeManifest, runtimeLayout.packageDirectory)
    : undefined;
  if (installResult.status === 0 && commandResult?.status === 0 &&
      await canRun(toInvocation(installedCli), runtimeEnvironment) &&
      supportsRecordCommand(toInvocation(installedCli), runtimeEnvironment)) {
    runOrExit(toInvocation(installedCli), userArgs, runtimeEnvironment);
  }

  runtimeFailure = [
    "Failed to install the OpenRuntime CLI from the released runtime bundle.",
    formatSpawnText(installResult.stderr),
    formatSpawnText(installResult.stdout),
    installResult.error?.message,
    commandResult?.status === 0 ? undefined : "Failed to install the recording extension package.",
    formatSpawnText(commandResult?.stderr),
    formatSpawnText(commandResult?.stdout),
    commandResult?.error?.message
  ].filter(Boolean).join("\n");
} catch (error) {
  runtimeFailure = error instanceof Error ? error.message : String(error);
}

for (const command of ["openruntime", "open-runtime"]) {
  const invocation = toInvocation(command);
  if (await canRun(invocation)) {
    runOrExit(invocation, userArgs);
  }
}

process.stderr.write([
  "OpenRuntime CLI was not found.",
  runtimeFailure === undefined ? undefined : `Release runtime error: ${runtimeFailure}`,
  `Release: https://github.com/${runtimeManifest.repository}/releases/tag/${runtimeManifest.tag}`,
  `Runtime cache: ${runtimeLayout.versionDirectory}`,
  "Set OPENRUNTIME_CLI=/absolute/path/to/openruntime, retry with network access, or provide OPENRUNTIME_SKILL_RUNTIME_ARCHIVE and its .sha256 file."
].filter(Boolean).join("\n") + "\n");
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

async function canRun(invocation, env = process.env) {
  if (invocation.args.length > 0) {
    const filePath = invocation.args[0];
    try {
      await access(filePath, constants.R_OK);
    } catch {
      return false;
    }
  }

  const result = spawnSync(invocation.command, [...invocation.args, "--help"], {
    env,
    stdio: "ignore"
  });
  return result.status === 0;
}

function supportsRecordCommand(invocation, env) {
  const result = spawnSync(invocation.command, [...invocation.args, "record", "--help"], {
    env,
    encoding: "utf8"
  });
  return result.status === 0 && result.stdout.includes("openruntime record start [--out <path>]");
}

function runOrExit(invocation, args, env = process.env) {
  const result = spawnSync(invocation.command, [...invocation.args, ...args], {
    env,
    stdio: "inherit"
  });
  if (result.error !== undefined) {
    process.stderr.write(`${result.error.message}\n`);
    process.exit(127);
  }
  process.exit(result.status ?? 1);
}

function installReleasedRecordCommand(manifest, packageDirectory) {
  const extensionPackage = manifest.packages.find((item) => item.name === "@openruntime/extension-imitate");
  if (extensionPackage === undefined) {
    return {
      status: 1,
      stdout: "",
      stderr: "Recording runtime does not include @openruntime/extension-imitate."
    };
  }
  return spawnSync(installedCli, [
    "extensions",
    "add",
    join(packageDirectory, extensionPackage.file),
    "--extensions-dir",
    managedExtensionsDirectory
  ], {
    env: runtimeEnvironment,
    encoding: "utf8"
  });
}

function installReleasedCli(manifest, packageDirectory, destination) {
  const packages = getRuntimePackagePaths(manifest, packageDirectory);
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
