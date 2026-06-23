import { gzipSync, gunzipSync } from "node:zlib";
import { Buffer } from "node:buffer";
import {
  constants,
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  type Stats
} from "node:fs";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { chromium, type BrowserContext } from "playwright";
import { resolveBrowserProfileDirectory } from "./browser.js";

export const PROFILE_TOKEN_PREFIX = "openruntime-profile:v1";
export const AUTH_STATE_FILE_NAME = ".openruntime-auth-state.json";

type ProfileKind = "auth" | "full";

interface AuthProfileBundle {
  version: 1;
  kind: "auth";
  createdAt: string;
  storageState: unknown;
}

interface FullProfileBundle {
  version: 1;
  kind: "full";
  createdAt: string;
  entries: FullProfileEntry[];
}

interface FullProfileEntry {
  path: string;
  type: "directory" | "file";
  mode?: number;
  content?: string;
}

export interface ProfileExportResult {
  kind: ProfileKind;
  path?: string;
  content?: string;
}

export interface ProfileImportResult {
  kind: ProfileKind;
  profileDirectory: string;
  backupDirectory?: string;
}

export function getProfileDirectory(env: NodeJS.ProcessEnv = process.env): string {
  return resolveBrowserProfileDirectory(env);
}

export function getAuthStatePath(profileDirectory: string): string {
  return join(resolve(profileDirectory), AUTH_STATE_FILE_NAME);
}

export async function exportAuthProfile(options: {
  profileDirectory: string;
  outputPath?: string;
}): Promise<ProfileExportResult> {
  const storageState = await captureAuthState(options.profileDirectory);
  const content = encodeProfileBundle({
    version: 1,
    kind: "auth",
    createdAt: new Date().toISOString(),
    storageState
  });

  if (options.outputPath !== undefined) {
    const path = resolve(options.outputPath);
    await writeTextFile(path, content);
    return {
      kind: "auth",
      path
    };
  }

  return {
    kind: "auth",
    content
  };
}

export async function exportFullProfile(options: {
  profileDirectory: string;
  outputPath?: string;
}): Promise<ProfileExportResult> {
  const profileDirectory = resolve(options.profileDirectory);
  await assertProfileDirectoryExists(profileDirectory);
  const path = resolve(options.outputPath ?? createDefaultProfileExportPath(profileDirectory, "full"));
  const content = encodeProfileBundle({
    version: 1,
    kind: "full",
    createdAt: new Date().toISOString(),
    entries: collectProfileEntries(profileDirectory)
  });
  await writeTextFile(path, content);
  return {
    kind: "full",
    path
  };
}

export async function importProfile(options: {
  input: string;
  profileDirectory: string;
}): Promise<ProfileImportResult> {
  const bundle = decodeProfileBundle(options.input);
  const profileDirectory = resolve(options.profileDirectory);

  if (bundle.kind === "auth") {
    await applyAuthState(profileDirectory, bundle.storageState);
    return {
      kind: "auth",
      profileDirectory
    };
  }

  const backupDirectory = await replaceProfileDirectory(profileDirectory, bundle);
  return {
    kind: "full",
    profileDirectory,
    ...(backupDirectory === undefined ? {} : { backupDirectory })
  };
}

export async function readProfileInput(input: string | undefined): Promise<string> {
  if (input === undefined || input.length === 0) {
    throw new Error("Missing profile content or --input <path>.");
  }

  const path = resolve(input);
  if (existsSync(path)) {
    return await readFile(path, "utf8");
  }

  return input;
}

export async function readProfileInputFile(path: string): Promise<string> {
  return await readFile(resolve(path), "utf8");
}

export function createDefaultProfileExportPath(profileDirectory: string, kind: ProfileKind): string {
  return join(dirname(resolve(profileDirectory)), `openruntime-profile-${kind}-${createTimestamp()}.oprprofile`);
}

export async function saveAuthState(profileDirectory: string, storageState: unknown): Promise<void> {
  const path = getAuthStatePath(profileDirectory);
  await mkdir(dirname(path), {
    recursive: true,
    mode: 0o700
  });
  await writeFile(path, `${JSON.stringify(storageState, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
}

export async function applyStoredAuthState(context: BrowserContext, profileDirectory: string): Promise<void> {
  const storageState = await readSavedAuthState(profileDirectory);
  if (storageState === undefined) return;
  await context.setStorageState(storageState as Parameters<BrowserContext["setStorageState"]>[0]);
}

export function persistAuthStateOnClose(context: BrowserContext, profileDirectory: string): BrowserContext {
  const originalClose = context.close.bind(context);
  let didPersist = false;
  const wrappedClose = (async (...args: Parameters<BrowserContext["close"]>) => {
    if (!didPersist) {
      didPersist = true;
      await persistCurrentAuthState(context, profileDirectory);
    }
    return await originalClose(...args);
  }) as BrowserContext["close"];
  context.close = wrappedClose;
  return context;
}

async function captureAuthState(profileDirectory: string): Promise<unknown> {
  const resolvedProfileDirectory = resolve(profileDirectory);
  await assertProfileDirectoryExists(resolvedProfileDirectory);
  const context = await chromium.launchPersistentContext(resolvedProfileDirectory, createProfileLaunchOptions());
  try {
    const savedState = await readSavedAuthState(resolvedProfileDirectory);
    const storageState = mergeStorageStates(savedState, await context.storageState({ indexedDB: true }));
    await saveAuthState(resolvedProfileDirectory, storageState);
    return storageState;
  } finally {
    await context.close();
  }
}

async function applyAuthState(profileDirectory: string, storageState: unknown): Promise<void> {
  const resolvedProfileDirectory = resolve(profileDirectory);
  await mkdir(resolvedProfileDirectory, {
    recursive: true,
    mode: 0o700
  });
  await saveAuthState(resolvedProfileDirectory, storageState);
  const context = await chromium.launchPersistentContext(resolvedProfileDirectory, createProfileLaunchOptions());
  try {
    await context.setStorageState(storageState as Parameters<BrowserContext["setStorageState"]>[0]);
  } finally {
    await context.close();
  }
}

async function persistCurrentAuthState(context: BrowserContext, profileDirectory: string): Promise<void> {
  try {
    const storageState = mergeStorageStates(
      await readSavedAuthState(profileDirectory),
      await context.storageState({ indexedDB: true })
    );
    await saveAuthState(profileDirectory, storageState);
  } catch (error) {
    process.stderr.write(`OpenRuntime profile state could not be saved: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

function mergeStorageStates(savedState: unknown | undefined, browserState: unknown): unknown {
  if (!isStorageState(savedState)) return browserState;
  if (!isStorageState(browserState)) return savedState;

  return {
    ...browserState,
    cookies: mergeStorageItems(
      savedState.cookies,
      browserState.cookies,
      (cookie) => [
        String(cookie.domain ?? ""),
        String(cookie.path ?? ""),
        String(cookie.name ?? "")
      ].join("\0")
    ),
    origins: mergeStorageItems(
      savedState.origins,
      browserState.origins,
      (origin) => String(origin.origin ?? ""),
      mergeStorageOrigins
    )
  };
}

function mergeStorageOrigins(savedOrigin: Record<string, unknown>, browserOrigin: Record<string, unknown>): Record<string, unknown> {
  const savedLocalStorage = Array.isArray(savedOrigin.localStorage)
    ? savedOrigin.localStorage
    : [];
  const browserLocalStorage = Array.isArray(browserOrigin.localStorage)
    ? browserOrigin.localStorage
    : [];

  return {
    ...savedOrigin,
    ...browserOrigin,
    localStorage: mergeStorageItems(
      toRecordItems(savedLocalStorage),
      toRecordItems(browserLocalStorage),
      (item) => String(item.name ?? "")
    )
  };
}

function mergeStorageItems<T extends Record<string, unknown>>(
  savedItems: T[],
  browserItems: T[],
  keyForItem: (item: T) => string,
  mergeItem?: (savedItem: T, browserItem: T) => T
): T[] {
  const items = new Map<string, T>();
  for (const item of savedItems) {
    items.set(keyForItem(item), item);
  }
  for (const item of browserItems) {
    const key = keyForItem(item);
    const savedItem = items.get(key);
    items.set(key, savedItem === undefined || mergeItem === undefined ? item : mergeItem(savedItem, item));
  }
  return [...items.values()];
}

function isStorageState(value: unknown): value is {
  cookies: Record<string, unknown>[];
  origins: Record<string, unknown>[];
} {
  if (value === null || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  return Array.isArray(state.cookies) && Array.isArray(state.origins);
}

function toRecordItems(items: unknown[]): Record<string, unknown>[] {
  return items.filter((item): item is Record<string, unknown> => item !== null && typeof item === "object");
}

async function readSavedAuthState(profileDirectory: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(getAuthStatePath(profileDirectory), "utf8"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function assertProfileDirectoryExists(profileDirectory: string): Promise<void> {
  try {
    await access(profileDirectory, constants.R_OK);
  } catch {
    throw new Error(`OpenRuntime browser profile was not found at ${profileDirectory}. Open a page and log in first.`);
  }
}

async function writeTextFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), {
    recursive: true,
    mode: 0o700
  });
  await writeFile(path, `${content}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
}

function encodeProfileBundle(bundle: AuthProfileBundle | FullProfileBundle): string {
  const encoded = gzipSync(JSON.stringify(bundle)).toString("base64url");
  return `${PROFILE_TOKEN_PREFIX}:${bundle.kind}:${encoded}`;
}

function decodeProfileBundle(input: string): AuthProfileBundle | FullProfileBundle {
  const trimmed = input.trim();
  const prefix = `${PROFILE_TOKEN_PREFIX}:`;
  if (!trimmed.startsWith(prefix)) {
    throw new Error("Profile content must start with openruntime-profile:v1.");
  }

  const payload = trimmed.slice(prefix.length);
  const separatorIndex = payload.indexOf(":");
  if (separatorIndex <= 0) {
    throw new Error("Profile content is missing a kind.");
  }

  const kind = payload.slice(0, separatorIndex);
  const encoded = payload.slice(separatorIndex + 1);
  if (kind !== "auth" && kind !== "full") {
    throw new Error(`Unsupported profile kind "${kind}".`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(gunzipSync(Buffer.from(encoded, "base64url")).toString("utf8"));
  } catch {
    throw new Error("Profile content is not valid.");
  }

  if (!isProfileBundle(parsed, kind)) {
    throw new Error("Profile content has an invalid shape.");
  }
  return parsed;
}

function isProfileBundle(value: unknown, kind: ProfileKind): value is AuthProfileBundle | FullProfileBundle {
  if (value === null || typeof value !== "object") return false;
  const bundle = value as Record<string, unknown>;
  if (bundle.version !== 1 || bundle.kind !== kind || typeof bundle.createdAt !== "string") return false;
  if (kind === "auth") {
    return "storageState" in bundle;
  }
  return Array.isArray(bundle.entries);
}

function collectProfileEntries(profileDirectory: string): FullProfileEntry[] {
  const root = resolve(profileDirectory);
  const entries: FullProfileEntry[] = [];
  visitProfilePath(root, root, entries);
  return entries;
}

function visitProfilePath(root: string, currentPath: string, entries: FullProfileEntry[]): void {
  for (const name of readdirSync(currentPath)) {
    const absolutePath = join(currentPath, name);
    const stat = lstatSync(absolutePath, {
      throwIfNoEntry: false
    });
    if (stat === undefined || shouldSkipProfileEntry(name, stat)) continue;
    const relativePath = toArchivePath(relative(root, absolutePath));
    if (stat.isDirectory()) {
      entries.push({
        path: relativePath,
        type: "directory",
        mode: stat.mode & 0o777
      });
      visitProfilePath(root, absolutePath, entries);
      continue;
    }
    if (stat.isFile()) {
      entries.push({
        path: relativePath,
        type: "file",
        mode: stat.mode & 0o777,
        content: readFileSync(absolutePath).toString("base64")
      });
    }
  }
}

function shouldSkipProfileEntry(name: string, stat: Stats): boolean {
  if (!stat.isFile() && !stat.isDirectory()) return true;
  return name === "SingletonLock" ||
    name === "SingletonSocket" ||
    name === "SingletonCookie" ||
    name === "DevToolsActivePort";
}

async function replaceProfileDirectory(profileDirectory: string, bundle: FullProfileBundle): Promise<string | undefined> {
  const resolvedProfileDirectory = resolve(profileDirectory);
  await mkdir(dirname(resolvedProfileDirectory), {
    recursive: true,
    mode: 0o700
  });

  const backupDirectory = existsSync(resolvedProfileDirectory)
    ? `${resolvedProfileDirectory}.backup-${createTimestamp()}`
    : undefined;
  if (backupDirectory !== undefined) {
    await rename(resolvedProfileDirectory, backupDirectory);
  }

  try {
    await restoreProfileEntries(resolvedProfileDirectory, bundle.entries);
    return backupDirectory;
  } catch (error) {
    await rm(resolvedProfileDirectory, {
      recursive: true,
      force: true
    });
    if (backupDirectory !== undefined) {
      await rename(backupDirectory, resolvedProfileDirectory);
    }
    throw error;
  }
}

async function restoreProfileEntries(profileDirectory: string, entries: FullProfileEntry[]): Promise<void> {
  await mkdir(profileDirectory, {
    recursive: true,
    mode: 0o700
  });

  for (const entry of entries) {
    const relativePath = validateArchivePath(entry.path);
    const absolutePath = join(profileDirectory, relativePath);
    if (entry.type === "directory") {
      await mkdir(absolutePath, {
        recursive: true,
        mode: entry.mode
      });
      continue;
    }
    if (entry.type !== "file" || typeof entry.content !== "string") {
      throw new Error(`Invalid profile archive entry "${entry.path}".`);
    }
    await mkdir(dirname(absolutePath), {
      recursive: true,
      mode: 0o700
    });
    await writeFile(absolutePath, Buffer.from(entry.content, "base64"), {
      mode: entry.mode
    });
  }
}

function validateArchivePath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error(`Invalid profile archive path "${path}".`);
  }
  return segments.join(sep);
}

function toArchivePath(path: string): string {
  return path.split(sep).join("/");
}

function createProfileLaunchOptions(): Parameters<typeof chromium.launchPersistentContext>[1] {
  return {
    headless: true,
    viewport: null,
    args: process.getuid?.() === 0 ? ["--no-sandbox"] : []
  };
}

function createTimestamp(): string {
  return new Date().toISOString().replaceAll(":", "").replaceAll(".", "-");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
