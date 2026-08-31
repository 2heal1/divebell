import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CliUpdateNotice, DivebellCliUpdater } from "./types.js";

const COMMAND_OUTPUT_LIMIT = 64 * 1024;

interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export type CliUpdateCommandRunner = (
  command: string,
  args: readonly string[],
  options?: { env?: NodeJS.ProcessEnv; timeoutMs?: number }
) => Promise<CommandResult>;

export interface CreateNpmGlobalCliUpdaterOptions {
  packageName: string;
  currentVersion: string;
  packageRoot: string | URL;
  displayName?: string;
  id?: string;
  registry?: string;
  automaticUpdateIntervalMs?: number;
  disableAutomaticUpdateEnvironmentVariable?: string;
  formatUpdatedNotice?: (notice: CliUpdateNotice) => string;
  commandRunner?: CliUpdateCommandRunner;
}

export function createNpmGlobalCliUpdater(
  options: CreateNpmGlobalCliUpdaterOptions
): DivebellCliUpdater {
  const packageName = requireNonEmpty(options.packageName, "packageName");
  const currentVersion = requireNonEmpty(options.currentVersion, "currentVersion");
  const packageRoot = tryRealpath(normalizePackageRoot(options.packageRoot));
  const displayName = options.displayName?.trim() || packageName;
  const id = options.id?.trim() || packageName;
  const registry = options.registry?.trim() || undefined;
  const runner = options.commandRunner ?? runCommand;

  return {
    id,
    displayName,
    currentVersion,
    installationId: packageRoot,
    ...(options.automaticUpdateIntervalMs === undefined
      ? {}
      : { automaticUpdateIntervalMs: options.automaticUpdateIntervalMs }),
    ...(options.disableAutomaticUpdateEnvironmentVariable === undefined
      ? {}
      : {
          disableAutomaticUpdateEnvironmentVariable:
            options.disableAutomaticUpdateEnvironmentVariable
        }),
    canScheduleAutomaticUpdate: () =>
      !isSourceCheckout(packageRoot) && !isEphemeralPackagePath(packageRoot),
    isManagedInstallation: async (env) => {
      if (isSourceCheckout(packageRoot) || isEphemeralPackagePath(packageRoot)) return false;
      const result = await runner("npm", ["root", "--global"], {
        env,
        timeoutMs: 10_000
      });
      if (result.error !== undefined || result.status !== 0) return false;
      const globalRoot = lastOutputLine(result.stdout);
      return globalRoot !== undefined
        && samePath(packageRoot, resolve(globalRoot, packageName));
    },
    getLatestVersion: async (env) => {
      const result = await runner("npm", [
        "view",
        packageName,
        "version",
        ...registryArgument(registry)
      ], {
        env,
        timeoutMs: 20_000
      });
      if (result.error !== undefined || result.status !== 0) {
        throw new Error(
          `Failed to check the latest ${displayName} version: ${commandFailureDetail(result)}`
        );
      }
      const latestVersion = lastOutputLine(result.stdout);
      if (latestVersion === undefined) {
        throw new Error(`The registry returned no version for ${packageName}.`);
      }
      return latestVersion;
    },
    installVersion: async (version, env) => {
      const result = await runner("npm", [
        "install",
        "--global",
        `${packageName}@${version}`,
        ...registryArgument(registry),
        "--no-audit",
        "--no-fund"
      ], {
        env,
        timeoutMs: 120_000
      });
      if (result.error !== undefined || result.status !== 0) {
        throw new Error(`Failed to update ${displayName}: ${commandFailureDetail(result)}`);
      }
    },
    ...(options.formatUpdatedNotice === undefined
      ? {}
      : { formatUpdatedNotice: options.formatUpdatedNotice })
  };
}

function normalizePackageRoot(packageRoot: string | URL): string {
  return resolve(packageRoot instanceof URL ? fileURLToPath(packageRoot) : packageRoot);
}

function requireNonEmpty(value: string, name: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`${name} must not be empty.`);
  return normalized;
}

function registryArgument(registry: string | undefined): string[] {
  return registry === undefined ? [] : [`--registry=${registry}`];
}

function isSourceCheckout(packageRoot: string): boolean {
  let directory = packageRoot;
  for (let depth = 0; depth <= 3; depth += 1) {
    if (
      existsSync(resolve(directory, ".git"))
      || existsSync(resolve(directory, "pnpm-workspace.yaml"))
    ) {
      return true;
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return false;
}

function isEphemeralPackagePath(packageRoot: string): boolean {
  return /[\\/]_npx[\\/]|[\\/]\.npm[\\/]_cacache[\\/]/u.test(packageRoot);
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = tryRealpath(left);
  const normalizedRight = tryRealpath(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function tryRealpath(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return resolve(path);
  }
}

function lastOutputLine(output: string): string | undefined {
  const value = output.trim().split(/\r?\n/u).at(-1)?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function commandFailureDetail(result: CommandResult): string {
  return result.stderr.trim() || result.error?.message || "unknown npm error";
}

function runCommand(
  command: string,
  args: readonly string[],
  options: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}
): Promise<CommandResult> {
  return new Promise((resolveResult) => {
    let child: ChildProcess;
    try {
      child = spawn(command, [...args], {
        env: options.env ?? process.env,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (error) {
      resolveResult({
        status: null,
        stdout: "",
        stderr: "",
        error: error instanceof Error ? error : new Error(String(error))
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let forceKill: NodeJS.Timeout | undefined;
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr = appendBounded(stderr, chunk);
    });

    const timeout = options.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
          forceKill = setTimeout(() => child.kill("SIGKILL"), 1000);
        }, options.timeoutMs);
    const finish = (result: CommandResult): void => {
      if (settled) return;
      settled = true;
      if (timeout !== undefined) clearTimeout(timeout);
      if (forceKill !== undefined) clearTimeout(forceKill);
      resolveResult(result);
    };
    child.on("error", (error) => finish({ status: null, stdout, stderr, error }));
    child.on("close", (status) => finish({
      status,
      stdout,
      stderr,
      ...(timedOut
        ? { error: new Error(`Command timed out after ${options.timeoutMs}ms.`) }
        : {})
    }));
  });
}

function appendBounded(current: string, chunk: string): string {
  const combined = current + chunk;
  return combined.length <= COMMAND_OUTPUT_LIMIT
    ? combined
    : combined.slice(combined.length - COMMAND_OUTPUT_LIMIT);
}
