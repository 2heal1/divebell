import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { getOptionValue, type ParsedCliArgs } from "../utils/args.js";
import { requireCommandArgument } from "../utils/command.js";
import { createError } from "../utils/output.js";
import type { OpenRuntimeCliExtension } from "../types/commands.js";
import { validateCommand } from "./definition.js";
import { createBuiltInCommandNameSet } from "./names.js";

const execFileAsync = promisify(execFile);

export const OPENRUNTIME_COMMAND_PACKAGE_SCHEMA_VERSION = 1;
export const OPENRUNTIME_COMMANDS_DIRECTORY_ENV = "OPENRUNTIME_COMMANDS_DIR";

const REGISTRY_FILE_NAME = ".installed-packages.json";
const PACKAGES_DIRECTORY_NAME = ".packages";

export interface OpenRuntimeCommandPackageManifest {
  schemaVersion: 1;
  commands: string[];
}

export interface InstalledCommandPackage {
  name: string;
  version: string;
  spec: string;
  directory: string;
  commands: string[];
  installedAt: string;
}

export interface InstalledCommandPackageRegistry {
  schemaVersion: 1;
  packages: InstalledCommandPackage[];
}

export interface CommandPackageDownloader {
  download(spec: string, destinationDirectory: string): Promise<string>;
}

export interface RunCommandsCommandOptions {
  args: ParsedCliArgs;
  stdout: { write(chunk: string): void };
  commandsDirectory?: string;
  commandPackageDownloader?: CommandPackageDownloader;
}

export async function runCommandsCommand(options: RunCommandsCommandOptions): Promise<number> {
  const action = options.args.command[1];
  const commandsDirectory = resolveCommandsDirectory(
    getOptionValue(options.args, "commands-dir") ?? options.commandsDirectory
  );

  if (action === "list") {
    const registry = await readInstalledCommandPackageRegistry(commandsDirectory);
    writeJson(options.stdout, {
      commandsDirectory,
      packages: registry.packages
    });
    return 0;
  }

  if (action === "add") {
    const spec = requireCommandArgument(options.args, 2, "npm package spec");
    const result = await addCommandPackage({
      spec,
      commandsDirectory,
      downloader: options.commandPackageDownloader ?? createNpmCommandPackageDownloader()
    });
    writeJson(options.stdout, result);
    return 0;
  }

  if (action === "remove") {
    const packageName = requireCommandArgument(options.args, 2, "package name");
    const result = await removeCommandPackage(commandsDirectory, packageName);
    writeJson(options.stdout, result);
    return 0;
  }

  if (action === "update") {
    const packageName = requireCommandArgument(options.args, 2, "package name");
    const registry = await readInstalledCommandPackageRegistry(commandsDirectory);
    const installed = registry.packages.find((item) => item.name === packageName);
    if (installed === undefined) {
      throw createError({
        code: "COMMAND_PACKAGE_NOT_INSTALLED",
        kind: "not_found",
        message: `Command package "${packageName}" is not installed.`,
        hint: `Run \`openruntime commands add ${packageName}\` first.`
      });
    }
    const result = await addCommandPackage({
      spec: `${packageName}@latest`,
      commandsDirectory,
      downloader: options.commandPackageDownloader ?? createNpmCommandPackageDownloader()
    });
    writeJson(options.stdout, result);
    return 0;
  }

  throw createError({
    code: "COMMANDS_ACTION_INVALID",
    kind: "validation",
    message: "commands requires add, list, update, or remove.",
    hint: "Run `openruntime commands add <npm-package>`, `openruntime commands list`, `openruntime commands update <package>`, or `openruntime commands remove <package>`."
  });
}

export async function addCommandPackage(options: {
  spec: string;
  commandsDirectory: string;
  downloader: CommandPackageDownloader;
}): Promise<{
  status: "installed" | "updated";
  package: InstalledCommandPackage;
}> {
  const commandsDirectory = resolve(options.commandsDirectory);
  await mkdir(commandsDirectory, { recursive: true });
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "openruntime-command-package-"));

  try {
    const archive = await options.downloader.download(options.spec, temporaryDirectory);
    const unpackedDirectory = await unpackCommandPackageArchive(archive, temporaryDirectory);
    const inspected = await inspectCommandPackage(unpackedDirectory);
    const registry = await readInstalledCommandPackageRegistry(commandsDirectory);
    const previous = registry.packages.find((item) => item.name === inspected.name);
    ensureCommandNamesAvailable(inspected.commands, registry, inspected.name);

    const finalDirectory = join(
      commandsDirectory,
      PACKAGES_DIRECTORY_NAME,
      encodeURIComponent(inspected.name),
      inspected.version
    );
    const installed: InstalledCommandPackage = {
      name: inspected.name,
      version: inspected.version,
      spec: options.spec,
      directory: relative(commandsDirectory, finalDirectory),
      commands: inspected.commands,
      installedAt: new Date().toISOString()
    };
    const nextRegistry: InstalledCommandPackageRegistry = {
      schemaVersion: 1,
      packages: [
        ...registry.packages.filter((item) => item.name !== inspected.name),
        installed
      ].sort((left, right) => left.name.localeCompare(right.name))
    };
    const keepsExistingFiles = previous !== undefined &&
      previous.version === inspected.version &&
      resolveInstalledDirectory(commandsDirectory, previous.directory) === finalDirectory;
    if (!keepsExistingFiles) {
      await mkdir(dirname(finalDirectory), { recursive: true });
      await rm(finalDirectory, { recursive: true, force: true });
      try {
        await cp(unpackedDirectory, finalDirectory, {
          recursive: true,
          errorOnExist: true,
          force: false
        });
        await writeInstalledCommandPackageRegistry(commandsDirectory, nextRegistry);
      } catch (error) {
        await rm(finalDirectory, { recursive: true, force: true });
        throw error;
      }
    } else {
      await writeInstalledCommandPackageRegistry(commandsDirectory, nextRegistry);
    }

    if (previous !== undefined && previous.directory !== installed.directory) {
      await removeInstalledDirectory(commandsDirectory, previous.directory);
    }

    return {
      status: previous === undefined ? "installed" : "updated",
      package: installed
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function removeCommandPackage(
  commandsDirectory: string,
  packageName: string
): Promise<{ status: "removed"; package: InstalledCommandPackage }> {
  const directory = resolve(commandsDirectory);
  const registry = await readInstalledCommandPackageRegistry(directory);
  const installed = registry.packages.find((item) => item.name === packageName);
  if (installed === undefined) {
    throw createError({
      code: "COMMAND_PACKAGE_NOT_INSTALLED",
      kind: "not_found",
      message: `Command package "${packageName}" is not installed.`
    });
  }

  await writeInstalledCommandPackageRegistry(directory, {
    schemaVersion: 1,
    packages: registry.packages.filter((item) => item.name !== packageName)
  });
  await removeInstalledDirectory(directory, installed.directory);
  return {
    status: "removed",
    package: installed
  };
}

export async function readInstalledCommandPackageRegistry(
  commandsDirectory: string
): Promise<InstalledCommandPackageRegistry> {
  const path = join(resolve(commandsDirectory), REGISTRY_FILE_NAME);
  if (!existsSync(path)) {
    return {
      schemaVersion: 1,
      packages: []
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read installed command registry ${path}: ${errorMessage(error)}`);
  }
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.packages)) {
    throw new Error(`Installed command registry ${path} is invalid.`);
  }
  return value as unknown as InstalledCommandPackageRegistry;
}

export async function getInstalledCommandEntryPaths(commandsDirectory: string): Promise<string[]> {
  const directory = resolve(commandsDirectory);
  const registry = await readInstalledCommandPackageRegistry(directory);
  const paths: string[] = [];
  for (const installed of registry.packages) {
    const packageDirectory = resolveInstalledDirectory(directory, installed.directory);
    const packageJson = await readPackageJson(packageDirectory);
    const manifest = validateCommandPackageManifest(packageJson.openruntime, packageJson.name);
    for (const entry of manifest.commands) {
      paths.push(resolvePackageEntry(packageDirectory, entry));
    }
  }
  return paths;
}

export function resolveCommandsDirectory(input?: string): string {
  return resolve(input ?? process.env[OPENRUNTIME_COMMANDS_DIRECTORY_ENV] ?? join(homedir(), ".openruntime", "commands"));
}

export function createNpmCommandPackageDownloader(): CommandPackageDownloader {
  return {
    download: async (spec, destinationDirectory) => {
      const localArchive = resolve(spec);
      if (spec.endsWith(".tgz") && existsSync(localArchive)) {
        return localArchive;
      }
      let stdout: string;
      try {
        const result = await execFileAsync("npm", [
          "pack",
          spec,
          "--ignore-scripts",
          "--json",
          "--pack-destination",
          destinationDirectory
        ], {
          encoding: "utf8",
          maxBuffer: 1024 * 1024
        });
        stdout = result.stdout;
      } catch (error) {
        throw createError({
          code: "COMMAND_PACKAGE_DOWNLOAD_FAILED",
          kind: "internal",
          message: `Could not download command package "${spec}": ${errorMessage(error)}`,
          retryable: true
        });
      }
      const filename = parseNpmPackFilename(stdout);
      return resolve(destinationDirectory, filename);
    }
  };
}

async function inspectCommandPackage(packageDirectory: string): Promise<{
  name: string;
  version: string;
  commands: string[];
}> {
  const packageJson = await readPackageJson(packageDirectory);
  const name = requirePackageString(packageJson.name, "name");
  const version = requirePackageString(packageJson.version, "version");
  ensureNoRuntimeDependencies(packageJson, name);
  const manifest = validateCommandPackageManifest(packageJson.openruntime, name);
  const commands: string[] = [];
  for (const entry of manifest.commands) {
    const entryPath = resolvePackageEntry(packageDirectory, entry);
    if (!existsSync(entryPath)) {
      throw new Error(`Command package "${name}" entry does not exist: ${entry}`);
    }
    const moduleUrl = pathToFileURL(entryPath);
    moduleUrl.searchParams.set("install", String(Date.now()));
    const module = await import(moduleUrl.href) as { default?: unknown };
    const definition = validateCommand(module.default, { path: entryPath });
    if (commands.includes(definition.name)) {
      throw new Error(`Command package "${name}" declares command "${definition.name}" more than once.`);
    }
    commands.push(definition.name);
  }
  return { name, version, commands };
}

async function unpackCommandPackageArchive(archive: string, temporaryDirectory: string): Promise<string> {
  const archivePath = resolve(archive);
  if (!existsSync(archivePath)) {
    throw new Error(`Downloaded command package archive does not exist: ${archivePath}`);
  }
  const listing = await execFileAsync("tar", ["-tzf", archivePath], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024
  });
  const entries = listing.stdout.split(/\r?\n/).filter(Boolean);
  if (entries.length === 0 || entries.some((entry) => !isSafeArchiveEntry(entry))) {
    throw new Error(`Command package archive ${basename(archivePath)} contains an unsafe or invalid path.`);
  }
  const unpackDirectory = join(temporaryDirectory, "unpacked");
  await mkdir(unpackDirectory, { recursive: true });
  await execFileAsync("tar", ["-xzf", archivePath, "-C", unpackDirectory], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024
  });
  const packageDirectory = join(unpackDirectory, "package");
  if (!existsSync(join(packageDirectory, "package.json"))) {
    throw new Error("Command package archive must contain package/package.json.");
  }
  return packageDirectory;
}

function isSafeArchiveEntry(entry: string): boolean {
  if (!entry.startsWith("package/")) return false;
  const normalized = entry.replaceAll("\\", "/");
  return !normalized.split("/").includes("..") && !normalized.startsWith("/");
}

async function readPackageJson(packageDirectory: string): Promise<Record<string, unknown>> {
  const path = join(packageDirectory, "package.json");
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read command package manifest ${path}: ${errorMessage(error)}`);
  }
  if (!isRecord(value)) {
    throw new Error(`Command package manifest ${path} must be an object.`);
  }
  return value;
}

function validateCommandPackageManifest(value: unknown, packageName: unknown): OpenRuntimeCommandPackageManifest {
  if (!isRecord(value) || value.schemaVersion !== OPENRUNTIME_COMMAND_PACKAGE_SCHEMA_VERSION) {
    throw new Error(`Command package "${String(packageName)}" must declare openruntime.schemaVersion 1.`);
  }
  if (!Array.isArray(value.commands) || value.commands.length === 0 || value.commands.some((entry) => typeof entry !== "string")) {
    throw new Error(`Command package "${String(packageName)}" must declare at least one openruntime.commands entry.`);
  }
  return {
    schemaVersion: 1,
    commands: value.commands as string[]
  };
}

function ensureNoRuntimeDependencies(packageJson: Record<string, unknown>, packageName: string): void {
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"] as const) {
    const value = packageJson[field];
    if (isRecord(value) && Object.keys(value).length > 0) {
      throw new Error(`Command package "${packageName}" must not declare ${field}. Publish a self-contained package instead.`);
    }
  }
}

function resolvePackageEntry(packageDirectory: string, entry: string): string {
  if (entry.length === 0 || entry.startsWith("/") || entry.includes("\\")) {
    throw new Error(`Invalid command package entry "${entry}".`);
  }
  const resolved = resolve(packageDirectory, entry);
  const pathFromPackage = relative(packageDirectory, resolved);
  if (pathFromPackage.startsWith("..") || pathFromPackage === "") {
    throw new Error(`Command package entry escapes the package directory: ${entry}`);
  }
  return resolved;
}

function ensureCommandNamesAvailable(
  commands: string[],
  registry: InstalledCommandPackageRegistry,
  installingPackageName: string
): void {
  const reserved = createBuiltInCommandNameSet();
  for (const installed of registry.packages) {
    if (installed.name === installingPackageName) continue;
    for (const command of installed.commands) reserved.add(command);
  }
  for (const command of commands) {
    if (reserved.has(command)) {
      throw new Error(`Command "${command}" conflicts with an existing built-in or installed command.`);
    }
    reserved.add(command);
  }
}

async function writeInstalledCommandPackageRegistry(
  commandsDirectory: string,
  registry: InstalledCommandPackageRegistry
): Promise<void> {
  await mkdir(commandsDirectory, { recursive: true });
  const path = join(commandsDirectory, REGISTRY_FILE_NAME);
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

async function removeInstalledDirectory(commandsDirectory: string, storedDirectory: string): Promise<void> {
  const directory = resolveInstalledDirectory(commandsDirectory, storedDirectory);
  await rm(directory, { recursive: true, force: true });
  const versionParent = dirname(directory);
  try {
    await rm(versionParent, { recursive: false });
  } catch {
    // Another installed version still uses the package directory.
  }
}

function resolveInstalledDirectory(commandsDirectory: string, storedDirectory: string): string {
  const packagesRoot = resolve(commandsDirectory, PACKAGES_DIRECTORY_NAME);
  const directory = resolve(commandsDirectory, storedDirectory);
  const relativePath = relative(packagesRoot, directory);
  if (relativePath.startsWith("..") || relativePath === "") {
    throw new Error(`Installed command directory is outside ${PACKAGES_DIRECTORY_NAME}: ${storedDirectory}`);
  }
  return directory;
}

function parseNpmPackFilename(stdout: string): string {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new Error("npm pack did not return JSON output.");
  }
  if (!Array.isArray(value) || !isRecord(value[0]) || typeof value[0].filename !== "string") {
    throw new Error("npm pack did not report the downloaded archive filename.");
  }
  return value[0].filename;
}

function requirePackageString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Command package ${field} must be a non-empty string.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  if (isRecord(error) && typeof error.stderr === "string" && error.stderr.trim().length > 0) {
    return error.stderr.trim();
  }
  return error instanceof Error ? error.message : String(error);
}

function writeJson(stdout: { write(chunk: string): void }, value: unknown): void {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function loadInstalledCommandDefinitions(commandsDirectory: string): Promise<OpenRuntimeCliExtension[]> {
  const entries = await getInstalledCommandEntryPaths(commandsDirectory);
  return await Promise.all(entries.map(async (path) => {
    const module = await import(pathToFileURL(path).href) as { default?: unknown };
    return validateCommand(module.default, { path });
  }));
}
