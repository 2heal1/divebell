import { spawn } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  packageRoot,
  resolvePackagePathFromTestPackage,
  resolvePackageRootFromTestPackage
} from "./package-resolution.js";
import { divebellTestCommands } from "./commands.js";
import type {
  CliRunResult,
  OfficialExtension,
  ProcessResult,
  RunCliFailureOptions,
  RunCliOptions,
  RunCliSuccessOptions
} from "./types.js";
import type { CliCommandInvocation } from "@divebell/cli";

interface TestPackageManifest {
  dependencies?: Record<string, string>;
}

interface ProcessOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

const testPackageManifest = JSON.parse(
  await readFile(join(packageRoot, "package.json"), "utf8")
) as TestPackageManifest;
const cliEntry = await resolvePackagePathFromTestPackage("@divebell/cli", "dist/bin.js");
const declaredOfficialExtensionNames = Object.keys(testPackageManifest.dependencies ?? {})
  .filter((name) => name.startsWith("@divebell/extension-"))
  .sort();

export class DivebellTestEnvironment {
  readonly #directory: string;
  readonly extensionsDirectory: string;
  readonly archivesDirectory: string;
  readonly browserExecutable: string;
  readonly browserProfileDirectory: string;
  readonly browserStateFile: string;
  readonly npmCacheDirectory: string;
  readonly projectDirectory: string;
  officialExtensions: OfficialExtension[];

  constructor(directory: string) {
    this.#directory = directory;
    this.extensionsDirectory = join(directory, "extensions");
    this.archivesDirectory = join(directory, "archives");
    this.browserExecutable = join(directory, "agent-browser.mjs");
    this.browserProfileDirectory = join(directory, "browser-profile");
    this.browserStateFile = join(directory, "browser-state.json");
    this.npmCacheDirectory = join(directory, "npm-cache");
    this.projectDirectory = join(directory, "project");
    this.officialExtensions = [];
  }

  static async create(): Promise<DivebellTestEnvironment> {
    const directory = await mkdtemp(join(tmpdir(), "divebell-e2e-"));
    const environment = new DivebellTestEnvironment(directory);
    try {
      await environment.#prepare();
      return environment;
    } catch (error) {
      await environment.close();
      throw error;
    }
  }

  async runCli<TFailure>(
    command: CliCommandInvocation<unknown, TFailure>,
    options: RunCliFailureOptions
  ): Promise<CliRunResult<TFailure>>;
  async runCli<TSuccess>(
    command: CliCommandInvocation<TSuccess, unknown>,
    options?: RunCliSuccessOptions
  ): Promise<CliRunResult<TSuccess>>;
  async runCli(
    command: CliCommandInvocation<unknown, unknown>,
    options: RunCliOptions = {}
  ): Promise<CliRunResult<unknown>> {
    const args = [...command.args];
    const result = await runProcess(process.execPath, [cliEntry, ...args], {
      cwd: options.cwd ?? this.projectDirectory,
      env: {
        ...process.env,
        DIVEBELL_DISABLE_EXTENSIONS: "0",
        DIVEBELL_EXTENSIONS_DIR: this.extensionsDirectory,
        DIVEBELL_AGENT_BROWSER_EXECUTABLE: this.browserExecutable,
        DIVEBELL_BROWSER_PROFILE_DIR: this.browserProfileDirectory,
        DIVEBELL_TEST_BROWSER_STATE: this.browserStateFile,
        ...options.env
      },
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs })
    });
    const expectedExitCode = options.expectedExitCode ?? 0;
    if (result.exitCode !== expectedExitCode) {
      throw new Error([
        `divebell ${args.join(" ")} exited with ${result.exitCode}; expected ${expectedExitCode}.`,
        result.stdout.trim(),
        result.stderr.trim()
      ].filter(Boolean).join("\n"));
    }
    if (options.allowStderr !== true && result.stderr.trim()) {
      throw new Error([
        `divebell ${args.join(" ")} wrote to stderr.`,
        result.stderr.trim()
      ].join("\n"));
    }
    return {
      ...result,
      json: parseJsonOutput<unknown>(result.stdout, `divebell ${args.join(" ")}`)
    };
  }

  async close(): Promise<void> {
    await rm(this.#directory, { recursive: true, force: true });
  }

  async #prepare(): Promise<void> {
    await Promise.all([
      mkdir(this.extensionsDirectory, { recursive: true }),
      mkdir(this.archivesDirectory, { recursive: true }),
      mkdir(this.browserProfileDirectory, { recursive: true }),
      mkdir(this.npmCacheDirectory, { recursive: true }),
      mkdir(this.projectDirectory, { recursive: true })
    ]);
    await this.#prepareBrowserExecutable();
    this.officialExtensions = await discoverOfficialExtensions();

    for (const extension of this.officialExtensions) {
      const archive = await packExtension(
        extension.directory,
        this.archivesDirectory,
        this.npmCacheDirectory
      );
      const installed = await this.runCli(
        divebellTestCommands.extensions.add(archive, {
          extensionsDirectory: this.extensionsDirectory
        })
      );
      if (installed.json.data.package?.name !== extension.name) {
        throw new Error(`Installed ${installed.json.data.package?.name ?? "unknown package"} instead of ${extension.name}.`);
      }
    }
  }

  async #prepareBrowserExecutable(): Promise<void> {
    const fakeBrowserUrl = new URL("./fake-agent-browser.js", import.meta.url);
    await writeFile(
      this.browserExecutable,
      `#!/usr/bin/env node\nimport ${JSON.stringify(fakeBrowserUrl.href)};\n`,
      "utf8"
    );
    await chmod(this.browserExecutable, 0o755);
  }
}

async function discoverOfficialExtensions(): Promise<OfficialExtension[]> {
  await validateDeclaredOfficialExtensions();
  const extensions = [];
  for (const name of declaredOfficialExtensionNames) {
    const directory = await resolvePackageRootFromTestPackage(name);
    const manifest = JSON.parse(
      await readFile(join(directory, "package.json"), "utf8")
    ) as {
      name?: unknown;
      divebell?: {
        schemaVersion?: unknown;
        extensions?: unknown;
      };
    };
    if (
      manifest.name !== name
      || manifest.divebell?.schemaVersion !== 1
      || !Array.isArray(manifest.divebell.extensions)
    ) {
      throw new Error(`${directory} is not a valid official Divebell Extension package.`);
    }
    extensions.push({
      name: manifest.name,
      directory
    });
  }
  return extensions.sort((left, right) => left.name.localeCompare(right.name));
}

async function packExtension(
  extensionDirectory: string,
  destinationDirectory: string,
  cacheDirectory: string
): Promise<string> {
  const result = await runProcess("npm", [
    "pack",
    extensionDirectory,
    "--ignore-scripts",
    "--json",
    "--pack-destination",
    destinationDirectory
  ], {
    cwd: packageRoot,
    env: {
      ...process.env,
      npm_config_cache: cacheDirectory
    }
  });
  if (result.exitCode !== 0) {
    throw new Error(`Could not pack ${extensionDirectory}.\n${result.stderr.trim()}`);
  }
  const output = parseJsonOutput<unknown>(result.stdout, `npm pack ${extensionDirectory}`);
  const filename = Array.isArray(output) ? output[0]?.filename : undefined;
  if (typeof filename !== "string") {
    throw new Error(`npm pack did not report an archive for ${extensionDirectory}.`);
  }
  return resolve(destinationDirectory, filename);
}

async function validateDeclaredOfficialExtensions(): Promise<void> {
  const repositoryRoot = resolve(packageRoot, "../..");
  let config: {
    fixed?: string[][];
  };
  try {
    config = JSON.parse(
      await readFile(join(repositoryRoot, ".changeset/config.json"), "utf8")
    ) as {
      fixed?: string[][];
    };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return;
    throw error;
  }
  const fixedPackages = config.fixed?.[0] ?? [];
  const expectedNames = fixedPackages
    .filter((name) => name.startsWith("@divebell/extension-"))
    .sort();
  if (JSON.stringify(declaredOfficialExtensionNames) !== JSON.stringify(expectedNames)) {
    throw new Error([
      "@divebell/test dependencies must include every official Divebell Extension package.",
      `Expected: ${expectedNames.join(", ")}`,
      `Received: ${declaredOfficialExtensionNames.join(", ")}`
    ].join("\n"));
  }
}

function parseJsonOutput<T>(stdout: string, command: string): T {
  try {
    return JSON.parse(stdout) as T;
  } catch (error) {
    throw new Error(`${command} did not return JSON.\n${stdout.trim()}`, { cause: error });
  }
}

function runProcess(
  command: string,
  args: string[],
  options: ProcessOptions
): Promise<ProcessResult> {
  return new Promise<ProcessResult>((resolvePromise, reject) => {
    const timeoutMs = options.timeoutMs ?? 120_000;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let settled = false;
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      settle(reject, new Error(`${command} ${args.join(" ")} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    timeout.unref?.();
    const settle = <T>(
      callback: (value: T) => void,
      value: T
    ): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback(value);
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      settle(reject, error);
    });
    child.once("close", (exitCode, signal) => {
      settle(resolvePromise, {
        exitCode: exitCode ?? 1,
        signal,
        stdout,
        stderr
      });
    });
  });
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}
