import { randomUUID } from "node:crypto";
import {
  chmod,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  rename,
  rm
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { resolveDivebellHomeDirectory } from "../../utils/home.js";
import { createError } from "../../utils/output.js";

export interface BrowserTempProfile {
  path: string;
  session: string;
}

export async function createBrowserTempProfile(
  env: NodeJS.ProcessEnv = process.env
): Promise<BrowserTempProfile> {
  const root = resolveBrowserTempProfileRoot(env);
  await mkdir(root, { recursive: true, mode: 0o700 });
  await chmod(root, 0o700);
  const path = await mkdtemp(join(root, "profile-"));
  await chmod(path, 0o700);
  return {
    path,
    session: `divebell-temp-${basename(path).slice("profile-".length)}`
  };
}

export function resolveBrowserTempProfileRoot(
  env: NodeJS.ProcessEnv = process.env
): string {
  return join(resolveDivebellHomeDirectory(env), "temp-profiles");
}

export function resolveBrowserProfileExportPath(options: {
  outputPath?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}): string {
  if (options.outputPath !== undefined) {
    return resolve(options.cwd ?? process.cwd(), options.outputPath);
  }
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  return join(
    resolveDivebellHomeDirectory(options.env ?? process.env),
    "profiles",
    `profile-${timestamp}-${randomUUID().slice(0, 8)}`
  );
}

export async function exportBrowserTempProfile(options: {
  sourcePath: string;
  outputPath: string;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  const env = options.env ?? process.env;
  const sourcePath = resolve(options.sourcePath);
  const outputPath = resolve(options.outputPath);
  await validateBrowserTempProfileExport({ sourcePath, outputPath, env });
  const outputParent = dirname(outputPath);
  await mkdir(outputParent, { recursive: true });
  try {
    await rename(sourcePath, outputPath);
  } catch (error) {
    if (!isFileSystemError(error, "EXDEV")) throw error;
    await copyAcrossFileSystems(sourcePath, outputPath);
  }
  await chmod(outputPath, 0o700);
}

export async function validateBrowserTempProfileExport(options: {
  sourcePath: string;
  outputPath: string;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  const env = options.env ?? process.env;
  const sourcePath = resolve(options.sourcePath);
  const outputPath = resolve(options.outputPath);
  await assertManagedBrowserTempProfile(sourcePath, env);
  if (sourcePath === outputPath || isPathInside(outputPath, sourcePath)) {
    throw createError({
      code: "PROFILE_EXPORT_PATH_INVALID",
      kind: "validation",
      message: "The exported Profile path must be outside the temporary Profile directory.",
      retryable: false,
      hint: "Choose another output path, or omit it to use Divebell's managed Profile directory."
    });
  }
  if (await pathExists(outputPath)) {
    throw createError({
      code: "PROFILE_EXPORT_PATH_EXISTS",
      kind: "validation",
      message: `The Profile export path already exists: ${outputPath}`,
      retryable: false,
      hint: "Choose a new path. Divebell never overwrites an existing Profile export."
    });
  }
}

export async function removeBrowserTempProfile(
  path: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  if (path === undefined || !isManagedBrowserTempProfilePath(path, env)) return;
  try {
    const stats = await lstat(path);
    if (!stats.isDirectory() || stats.isSymbolicLink()) return;
  } catch (error) {
    if (isFileSystemError(error, "ENOENT")) return;
    throw error;
  }
  await rm(path, { recursive: true, force: true });
}

async function assertManagedBrowserTempProfile(
  path: string,
  env: NodeJS.ProcessEnv
): Promise<void> {
  if (!isManagedBrowserTempProfilePath(path, env)) {
    throw createError({
      code: "PROFILE_EXPORT_SOURCE_INVALID",
      kind: "validation",
      message: "The current open context does not reference a managed temporary Profile.",
      retryable: false,
      hint: "Start a new browser with `divebell open <url> --ui --temp-profile`."
    });
  }
  try {
    const stats = await lstat(path);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error("not a directory");
  } catch {
    throw createError({
      code: "PROFILE_EXPORT_SOURCE_MISSING",
      kind: "not_found",
      message: "The temporary Profile directory is missing or invalid.",
      retryable: false,
      hint: "Start a new temporary Profile, sign in again, and export it before running `divebell stop`."
    });
  }
}

function isManagedBrowserTempProfilePath(
  path: string,
  env: NodeJS.ProcessEnv
): boolean {
  const resolvedPath = resolve(path);
  return dirname(resolvedPath) === resolveBrowserTempProfileRoot(env)
    && basename(resolvedPath).startsWith("profile-")
    && basename(resolvedPath).length > "profile-".length;
}

async function copyAcrossFileSystems(sourcePath: string, outputPath: string): Promise<void> {
  const stagingPath = join(
    dirname(outputPath),
    `.${basename(outputPath)}-export-${randomUUID()}`
  );
  try {
    await cp(sourcePath, stagingPath, {
      recursive: true,
      force: false,
      errorOnExist: true,
      preserveTimestamps: true
    });
    await chmod(stagingPath, 0o700);
    await rename(stagingPath, outputPath);
    await rm(sourcePath, { recursive: true, force: true });
  } catch (error) {
    await rm(stagingPath, { recursive: true, force: true });
    throw error;
  }
}

function isPathInside(path: string, parent: string): boolean {
  const relativePath = relative(parent, path);
  return relativePath !== ""
    && relativePath !== ".."
    && !relativePath.startsWith(`..${sep}`)
    && !isAbsolute(relativePath);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isFileSystemError(error, "ENOENT")) return false;
    throw error;
  }
}

function isFileSystemError(error: unknown, code: string): boolean {
  return error !== null
    && typeof error === "object"
    && "code" in error
    && error.code === code;
}
