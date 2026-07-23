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
import type { OpenRuntimeExtensionDefinition } from "../types/commands.js";
import { validateExtension } from "./definition.js";
import { createBuiltInCommandNameSet } from "./names.js";

const execFileAsync = promisify(execFile);

export const OPENRUNTIME_EXTENSION_PACKAGE_SCHEMA_VERSION = 1;
export const OPENRUNTIME_EXTENSIONS_DIRECTORY_ENV = "OPENRUNTIME_EXTENSIONS_DIR";

const REGISTRY_FILE_NAME = ".installed-packages.json";
const PACKAGES_DIRECTORY_NAME = ".packages";

export interface OpenRuntimeExtensionPackageManifest {
  schemaVersion: 1;
  extensions: string[];
}

export interface InstalledExtensionSummary {
  name: string;
  commands: string[];
  hooks: Array<"open" | "detectStack" | "close">;
}

export interface InstalledExtensionPackage {
  name: string;
  version: string;
  spec: string;
  directory: string;
  extensions: InstalledExtensionSummary[];
  installedAt: string;
}

export interface InstalledExtensionPackageRegistry {
  schemaVersion: 1;
  packages: InstalledExtensionPackage[];
}

export interface ExtensionPackageDownloader {
  download(spec: string, destinationDirectory: string): Promise<string>;
}

export interface RunExtensionsCommandOptions {
  args: ParsedCliArgs;
  stdout: { write(chunk: string): void };
  extensionsDirectory?: string;
  extensionPackageDownloader?: ExtensionPackageDownloader;
}

export async function runExtensionsCommand(options: RunExtensionsCommandOptions): Promise<number> {
  const action = options.args.command[1];
  const extensionsDirectory = resolveExtensionsDirectory(
    getOptionValue(options.args, "extensions-dir") ?? options.extensionsDirectory
  );

  if (action === "list") {
    const registry = await readInstalledExtensionPackageRegistry(extensionsDirectory);
    writeJson(options.stdout, {
      extensionsDirectory,
      packages: registry.packages
    });
    return 0;
  }

  if (action === "add") {
    const spec = requireCommandArgument(options.args, 2, "extension package or path");
    const result = await addExtensionPackage({
      spec,
      extensionsDirectory,
      downloader: options.extensionPackageDownloader ?? createNpmExtensionPackageDownloader()
    });
    writeJson(options.stdout, result);
    return 0;
  }

  if (action === "remove") {
    const packageName = requireCommandArgument(options.args, 2, "package name");
    const result = await removeExtensionPackage(extensionsDirectory, packageName);
    writeJson(options.stdout, result);
    return 0;
  }

  if (action === "update") {
    const packageName = requireCommandArgument(options.args, 2, "package name");
    const registry = await readInstalledExtensionPackageRegistry(extensionsDirectory);
    const installed = registry.packages.find((item) => item.name === packageName);
    if (installed === undefined) {
      throw createError({
        code: "EXTENSION_PACKAGE_NOT_INSTALLED",
        kind: "not_found",
        message: `Extension package "${packageName}" is not installed.`,
        hint: `Run \`openruntime extensions add ${packageName}\` first.`
      });
    }
    const result = await addExtensionPackage({
      spec: `${packageName}@latest`,
      extensionsDirectory,
      downloader: options.extensionPackageDownloader ?? createNpmExtensionPackageDownloader()
    });
    writeJson(options.stdout, result);
    return 0;
  }

  throw createError({
    code: "EXTENSIONS_ACTION_INVALID",
    kind: "validation",
    message: "extensions requires add, list, update, or remove.",
    hint: "Run `openruntime extensions add <package-or-path>`, `openruntime extensions list`, `openruntime extensions update <package>`, or `openruntime extensions remove <package>`."
  });
}

export async function addExtensionPackage(options: {
  spec: string;
  extensionsDirectory: string;
  downloader: ExtensionPackageDownloader;
}): Promise<{
  status: "installed" | "updated";
  package: InstalledExtensionPackage;
}> {
  const extensionsDirectory = resolve(options.extensionsDirectory);
  await mkdir(extensionsDirectory, { recursive: true });
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "openruntime-extension-package-"));

  try {
    const archive = await options.downloader.download(options.spec, temporaryDirectory);
    const unpackedDirectory = await unpackExtensionPackageArchive(archive, temporaryDirectory);
    const inspected = await inspectExtensionPackage(unpackedDirectory);
    const registry = await readInstalledExtensionPackageRegistry(extensionsDirectory);
    const previous = registry.packages.find((item) => item.name === inspected.name);
    ensureExtensionNamesAvailable(inspected.extensions, registry, inspected.name);
    ensureExtensionCommandsAvailable(
      inspected.extensions.flatMap((extension) => extension.commands),
      registry,
      inspected.name
    );

    const finalDirectory = join(
      extensionsDirectory,
      PACKAGES_DIRECTORY_NAME,
      encodeURIComponent(inspected.name),
      inspected.version
    );
    const installed: InstalledExtensionPackage = {
      name: inspected.name,
      version: inspected.version,
      spec: options.spec,
      directory: relative(extensionsDirectory, finalDirectory),
      extensions: inspected.extensions,
      installedAt: new Date().toISOString()
    };
    const nextRegistry: InstalledExtensionPackageRegistry = {
      schemaVersion: 1,
      packages: [
        ...registry.packages.filter((item) => item.name !== inspected.name),
        installed
      ].sort((left, right) => left.name.localeCompare(right.name))
    };
    const keepsExistingFiles = previous !== undefined &&
      previous.version === inspected.version &&
      resolveInstalledDirectory(extensionsDirectory, previous.directory) === finalDirectory;
    if (!keepsExistingFiles) {
      await mkdir(dirname(finalDirectory), { recursive: true });
      await rm(finalDirectory, { recursive: true, force: true });
      try {
        await cp(unpackedDirectory, finalDirectory, {
          recursive: true,
          errorOnExist: true,
          force: false
        });
        await writeInstalledExtensionPackageRegistry(extensionsDirectory, nextRegistry);
      } catch (error) {
        await rm(finalDirectory, { recursive: true, force: true });
        throw error;
      }
    } else {
      await writeInstalledExtensionPackageRegistry(extensionsDirectory, nextRegistry);
    }

    if (previous !== undefined && previous.directory !== installed.directory) {
      await removeInstalledDirectory(extensionsDirectory, previous.directory);
    }

    return {
      status: previous === undefined ? "installed" : "updated",
      package: installed
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function removeExtensionPackage(
  extensionsDirectory: string,
  packageName: string
): Promise<{ status: "removed"; package: InstalledExtensionPackage }> {
  const directory = resolve(extensionsDirectory);
  const registry = await readInstalledExtensionPackageRegistry(directory);
  const installed = registry.packages.find((item) => item.name === packageName);
  if (installed === undefined) {
    throw createError({
      code: "EXTENSION_PACKAGE_NOT_INSTALLED",
      kind: "not_found",
      message: `Extension package "${packageName}" is not installed.`
    });
  }

  await writeInstalledExtensionPackageRegistry(directory, {
    schemaVersion: 1,
    packages: registry.packages.filter((item) => item.name !== packageName)
  });
  await removeInstalledDirectory(directory, installed.directory);
  return {
    status: "removed",
    package: installed
  };
}

export async function readInstalledExtensionPackageRegistry(
  extensionsDirectory: string
): Promise<InstalledExtensionPackageRegistry> {
  const path = join(resolve(extensionsDirectory), REGISTRY_FILE_NAME);
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
    throw new Error(`Cannot read installed extension registry ${path}: ${errorMessage(error)}`);
  }
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.packages)) {
    throw new Error(`Installed extension registry ${path} is invalid.`);
  }
  return value as unknown as InstalledExtensionPackageRegistry;
}

export async function getInstalledExtensionEntryPaths(extensionsDirectory: string): Promise<string[]> {
  const directory = resolve(extensionsDirectory);
  const registry = await readInstalledExtensionPackageRegistry(directory);
  const paths: string[] = [];
  for (const installed of registry.packages) {
    const packageDirectory = resolveInstalledDirectory(directory, installed.directory);
    const packageJson = await readPackageJson(packageDirectory);
    const manifest = validateExtensionPackageManifest(packageJson.openruntime, packageJson.name);
    for (const entry of manifest.extensions) {
      paths.push(resolvePackageEntry(packageDirectory, entry));
    }
  }
  return paths;
}

export function resolveExtensionsDirectory(input?: string): string {
  return resolve(input ?? process.env[OPENRUNTIME_EXTENSIONS_DIRECTORY_ENV] ?? join(homedir(), ".openruntime", "extensions"));
}

export function createNpmExtensionPackageDownloader(): ExtensionPackageDownloader {
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
          code: "EXTENSION_PACKAGE_DOWNLOAD_FAILED",
          kind: "internal",
          message: `Could not download extension package "${spec}": ${errorMessage(error)}`,
          retryable: true
        });
      }
      const filename = parseNpmPackFilename(stdout);
      return resolve(destinationDirectory, filename);
    }
  };
}

async function inspectExtensionPackage(packageDirectory: string): Promise<{
  name: string;
  version: string;
  extensions: InstalledExtensionSummary[];
}> {
  const packageJson = await readPackageJson(packageDirectory);
  const name = requirePackageString(packageJson.name, "name");
  const version = requirePackageString(packageJson.version, "version");
  ensureNoRuntimeDependencies(packageJson, name);
  const manifest = validateExtensionPackageManifest(packageJson.openruntime, name);
  const extensions: InstalledExtensionSummary[] = [];
  const extensionNames = new Set<string>();
  for (const entry of manifest.extensions) {
    const entryPath = resolvePackageEntry(packageDirectory, entry);
    if (!existsSync(entryPath)) {
      throw new Error(`Extension package "${name}" entry does not exist: ${entry}`);
    }
    const moduleUrl = pathToFileURL(entryPath);
    moduleUrl.searchParams.set("install", String(Date.now()));
    const module = await import(moduleUrl.href) as { default?: unknown };
    const definition = validateExtension(module.default, { path: entryPath });
    if (extensionNames.has(definition.name)) {
      throw new Error(`Extension package "${name}" declares extension "${definition.name}" more than once.`);
    }
    extensionNames.add(definition.name);
    extensions.push({
      name: definition.name,
      commands: (definition.commands ?? []).map((command) => command.name),
      hooks: Object.keys(definition.hooks ?? {}) as InstalledExtensionSummary["hooks"]
    });
  }
  return { name, version, extensions };
}

async function unpackExtensionPackageArchive(archive: string, temporaryDirectory: string): Promise<string> {
  const archivePath = resolve(archive);
  if (!existsSync(archivePath)) {
    throw new Error(`Downloaded extension package archive does not exist: ${archivePath}`);
  }
  const listing = await execFileAsync("tar", ["-tzf", archivePath], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024
  });
  const entries = listing.stdout.split(/\r?\n/).filter(Boolean);
  if (entries.length === 0 || entries.some((entry) => !isSafeArchiveEntry(entry))) {
    throw new Error(`Extension package archive ${basename(archivePath)} contains an unsafe or invalid path.`);
  }
  const unpackDirectory = join(temporaryDirectory, "unpacked");
  await mkdir(unpackDirectory, { recursive: true });
  await execFileAsync("tar", ["-xzf", archivePath, "-C", unpackDirectory], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024
  });
  const packageDirectory = join(unpackDirectory, "package");
  if (!existsSync(join(packageDirectory, "package.json"))) {
    throw new Error("Extension package archive must contain package/package.json.");
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
    throw new Error(`Cannot read extension package manifest ${path}: ${errorMessage(error)}`);
  }
  if (!isRecord(value)) {
    throw new Error(`Extension package manifest ${path} must be an object.`);
  }
  return value;
}

function validateExtensionPackageManifest(value: unknown, packageName: unknown): OpenRuntimeExtensionPackageManifest {
  if (!isRecord(value) || value.schemaVersion !== OPENRUNTIME_EXTENSION_PACKAGE_SCHEMA_VERSION) {
    throw new Error(`Extension package "${String(packageName)}" must declare openruntime.schemaVersion 1.`);
  }
  if (!Array.isArray(value.extensions) || value.extensions.length === 0 || value.extensions.some((entry) => typeof entry !== "string")) {
    throw new Error(`Extension package "${String(packageName)}" must declare at least one openruntime.extensions entry.`);
  }
  return {
    schemaVersion: 1,
    extensions: value.extensions as string[]
  };
}

function ensureNoRuntimeDependencies(packageJson: Record<string, unknown>, packageName: string): void {
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"] as const) {
    const value = packageJson[field];
    if (isRecord(value) && Object.keys(value).length > 0) {
      throw new Error(`Extension package "${packageName}" must not declare ${field}. Publish a self-contained package instead.`);
    }
  }
}

function resolvePackageEntry(packageDirectory: string, entry: string): string {
  if (entry.length === 0 || entry.startsWith("/") || entry.includes("\\")) {
    throw new Error(`Invalid extension package entry "${entry}".`);
  }
  const resolved = resolve(packageDirectory, entry);
  const pathFromPackage = relative(packageDirectory, resolved);
  if (pathFromPackage.startsWith("..") || pathFromPackage === "") {
    throw new Error(`Extension package entry escapes the package directory: ${entry}`);
  }
  return resolved;
}

function ensureExtensionCommandsAvailable(
  commands: string[],
  registry: InstalledExtensionPackageRegistry,
  installingPackageName: string
): void {
  const reserved = createBuiltInCommandNameSet();
  for (const installed of registry.packages) {
    if (installed.name === installingPackageName) continue;
    for (const command of installed.extensions.flatMap((extension) => extension.commands)) reserved.add(command);
  }
  for (const command of commands) {
    if (reserved.has(command)) {
      throw new Error(`Command "${command}" conflicts with an existing built-in or installed command.`);
    }
    reserved.add(command);
  }
}

function ensureExtensionNamesAvailable(
  extensions: readonly InstalledExtensionSummary[],
  registry: InstalledExtensionPackageRegistry,
  installingPackageName: string
): void {
  const reserved = new Set(
    registry.packages
      .filter((installed) => installed.name !== installingPackageName)
      .flatMap((installed) => installed.extensions.map((extension) => extension.name))
  );
  for (const extension of extensions) {
    if (reserved.has(extension.name)) {
      throw new Error(`Extension "${extension.name}" conflicts with an installed extension.`);
    }
    reserved.add(extension.name);
  }
}

async function writeInstalledExtensionPackageRegistry(
  extensionsDirectory: string,
  registry: InstalledExtensionPackageRegistry
): Promise<void> {
  await mkdir(extensionsDirectory, { recursive: true });
  const path = join(extensionsDirectory, REGISTRY_FILE_NAME);
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

async function removeInstalledDirectory(extensionsDirectory: string, storedDirectory: string): Promise<void> {
  const directory = resolveInstalledDirectory(extensionsDirectory, storedDirectory);
  await rm(directory, { recursive: true, force: true });
  const versionParent = dirname(directory);
  try {
    await rm(versionParent, { recursive: false });
  } catch {
    // Another installed version still uses the package directory.
  }
}

function resolveInstalledDirectory(extensionsDirectory: string, storedDirectory: string): string {
  const packagesRoot = resolve(extensionsDirectory, PACKAGES_DIRECTORY_NAME);
  const directory = resolve(extensionsDirectory, storedDirectory);
  const relativePath = relative(packagesRoot, directory);
  if (relativePath.startsWith("..") || relativePath === "") {
    throw new Error(`Installed extension directory is outside ${PACKAGES_DIRECTORY_NAME}: ${storedDirectory}`);
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
    throw new Error(`Extension package ${field} must be a non-empty string.`);
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

export async function loadInstalledExtensionDefinitions(extensionsDirectory: string): Promise<OpenRuntimeExtensionDefinition[]> {
  const entries = await getInstalledExtensionEntryPaths(extensionsDirectory);
  return await Promise.all(entries.map(async (path) => {
    const module = await import(pathToFileURL(path).href) as { default?: unknown };
    return validateExtension(module.default, { path });
  }));
}
