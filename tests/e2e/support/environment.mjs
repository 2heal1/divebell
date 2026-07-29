import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  packageRoot,
  resolvePackagePathFromTestPackage,
  resolvePackageRootFromTestPackage
} from "./package-resolution.mjs";

const testPackageManifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
const cliEntry = await resolvePackagePathFromTestPackage("@divebell/cli", "dist/bin.js");
const declaredOfficialExtensionNames = Object.keys(testPackageManifest.dependencies ?? {})
  .filter((name) => name.startsWith("@divebell/extension-"))
  .sort();

export class DivebellTestEnvironment {
  #directory;

  constructor(directory) {
    this.#directory = directory;
    this.extensionsDirectory = join(directory, "extensions");
    this.archivesDirectory = join(directory, "archives");
    this.npmCacheDirectory = join(directory, "npm-cache");
    this.projectDirectory = join(directory, "project");
    this.officialExtensions = [];
  }

  static async create() {
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

  async runCli(args, options = {}) {
    const result = await runProcess(process.execPath, [cliEntry, ...args], {
      cwd: options.cwd ?? this.projectDirectory,
      timeoutMs: options.timeoutMs,
      env: {
        ...process.env,
        DIVEBELL_DISABLE_EXTENSIONS: "0",
        DIVEBELL_EXTENSIONS_DIR: this.extensionsDirectory,
        ...options.env
      }
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
      json: parseJsonOutput(result.stdout, `divebell ${args.join(" ")}`)
    };
  }

  async close() {
    await rm(this.#directory, { recursive: true, force: true });
  }

  async #prepare() {
    await Promise.all([
      mkdir(this.extensionsDirectory, { recursive: true }),
      mkdir(this.archivesDirectory, { recursive: true }),
      mkdir(this.npmCacheDirectory, { recursive: true }),
      mkdir(this.projectDirectory, { recursive: true })
    ]);
    this.officialExtensions = await discoverOfficialExtensions();

    for (const extension of this.officialExtensions) {
      const archive = await packExtension(
        extension.directory,
        this.archivesDirectory,
        this.npmCacheDirectory
      );
      const installed = await this.runCli([
        "extensions",
        "add",
        archive,
        "--extensions-dir",
        this.extensionsDirectory
      ]);
      if (installed.json.package?.name !== extension.name) {
        throw new Error(`Installed ${installed.json.package?.name ?? "unknown package"} instead of ${extension.name}.`);
      }
    }
  }
}

async function discoverOfficialExtensions() {
  await validateDeclaredOfficialExtensions();
  const extensions = [];
  for (const name of declaredOfficialExtensionNames) {
    const directory = await resolvePackageRootFromTestPackage(name);
    const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
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

async function packExtension(extensionDirectory, destinationDirectory, cacheDirectory) {
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
  const output = parseJsonOutput(result.stdout, `npm pack ${extensionDirectory}`);
  const filename = Array.isArray(output) ? output[0]?.filename : undefined;
  if (typeof filename !== "string") {
    throw new Error(`npm pack did not report an archive for ${extensionDirectory}.`);
  }
  return resolve(destinationDirectory, filename);
}

async function validateDeclaredOfficialExtensions() {
  const repositoryRoot = resolve(packageRoot, "../..");
  let config;
  try {
    config = JSON.parse(await readFile(join(repositoryRoot, ".changeset/config.json"), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return;
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

function parseJsonOutput(stdout, command) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${command} did not return JSON.\n${stdout.trim()}`, { cause: error });
  }
}

function runProcess(command, args, options) {
  return new Promise((resolvePromise, reject) => {
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
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback(value);
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
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
