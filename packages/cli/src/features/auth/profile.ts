import { gzipSync, gunzipSync } from "node:zlib";
import { Buffer } from "node:buffer";
import {
  existsSync
} from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { resolveBrowserProfileDirectory } from "../browser/runner.js";

export const PROFILE_TOKEN_PREFIX = "openruntime-profile:v1";
export const AUTH_STATE_FILE_NAME = ".openruntime-auth-state.json";

import type { AuthProfileBundle, ProfileExportResult, ProfileImportResult, ProfileListResult, ProfileClearResult, AuthStateApplier, NormalizedProfileUrl } from "./types.js";
export type { ProfileExportResult, ProfileImportResult, ProfileListResult, ProfileClearResult, AuthStateApplier } from "./types.js";

export function getProfileDirectory(env: NodeJS.ProcessEnv = process.env): string {
  return resolveBrowserProfileDirectory(env);
}

export function getAuthStatePath(profileDirectory: string): string {
  return join(resolve(profileDirectory), AUTH_STATE_FILE_NAME);
}

export async function exportAuthStateProfile(options: {
  storageState: unknown;
  outputPath: string;
}): Promise<ProfileExportResult> {
  const content = encodeProfileBundle({
    version: 1,
    kind: "auth",
    createdAt: new Date().toISOString(),
    storageState: options.storageState
  });

  const path = resolve(options.outputPath);
  await writeTextFile(path, content);
  return {
    kind: "auth",
    path
  };
}

export async function importProfile(options: {
  input: string;
  profileDirectory: string;
  currentStorageState?: unknown;
  applyAuthState?: AuthStateApplier;
}): Promise<ProfileImportResult> {
  const bundle = decodeProfileBundle(options.input);
  const profileDirectory = resolve(options.profileDirectory);
  const savedStorageState = await readSavedAuthState(profileDirectory);
  const existingStorageState = options.currentStorageState === undefined
    ? savedStorageState
    : mergeStorageStates(savedStorageState, options.currentStorageState);
  const storageState = mergeStorageStates(existingStorageState, bundle.storageState);

  await saveAuthState(profileDirectory, storageState);
  if (options.applyAuthState !== undefined) {
    await options.applyAuthState(profileDirectory, storageState);
  }
  return {
    kind: "auth",
    profileDirectory
  };
}

export async function listProfile(options: {
  profileDirectory: string;
}): Promise<ProfileListResult> {
  const profileDirectory = resolve(options.profileDirectory);
  const authStatePath = getAuthStatePath(profileDirectory);
  const storageState = await readSavedAuthState(profileDirectory);

  return {
    kind: "auth",
    profileDirectory,
    authStatePath,
    imported: storageState !== undefined,
    sites: listStorageStateSites(storageState)
  };
}

export async function clearProfile(options: {
  profileDirectory: string;
  url?: string;
  currentStorageState?: unknown;
}): Promise<ProfileClearResult> {
  const profileDirectory = resolve(options.profileDirectory);
  assertSafeProfileClearPath(profileDirectory);

  if (options.url !== undefined) {
    const savedStorageState = await readSavedAuthState(profileDirectory);
    const storageState = options.currentStorageState === undefined
      ? savedStorageState
      : mergeStorageStates(savedStorageState, options.currentStorageState);
    const cleared = clearStorageStateByUrl(storageState, options.url);
    const removed = cleared.removedCookies > 0 || cleared.removedOrigins.length > 0;
    if (removed || options.currentStorageState !== undefined) {
      await rm(profileDirectory, {
        recursive: true,
        force: true
      });
      if (hasStorageStateEntries(cleared.storageState)) {
        await saveAuthState(profileDirectory, cleared.storageState);
      }
    }
    return {
      kind: "auth",
      profileDirectory,
      removed,
      url: cleared.url.href,
      removedCookies: cleared.removedCookies,
      removedOrigins: cleared.removedOrigins
    };
  }

  const removed = existsSync(profileDirectory);
  await rm(profileDirectory, {
    recursive: true,
    force: true
  });

  return {
    kind: "auth",
    profileDirectory,
    removed
  };
}

export async function readProfileInputFile(path: string): Promise<string> {
  return await readFile(resolve(path), "utf8");
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

function listStorageStateSites(storageState: unknown | undefined): ProfileListResult["sites"] {
  if (!isStorageState(storageState)) return [];

  const sites = new Map<string, {
    cookies: number;
    origins: Set<string>;
  }>();

  for (const cookie of storageState.cookies) {
    if (typeof cookie.domain !== "string") continue;
    const site = normalizeCookieDomain(cookie.domain);
    if (site.length === 0) continue;
    const entry = sites.get(site) ?? {
      cookies: 0,
      origins: new Set<string>()
    };
    entry.cookies += 1;
    sites.set(site, entry);
  }

  for (const origin of storageState.origins) {
    if (typeof origin.origin !== "string") continue;
    const site = getOriginHost(origin.origin);
    if (site === undefined) continue;
    const entry = sites.get(site) ?? {
      cookies: 0,
      origins: new Set<string>()
    };
    entry.origins.add(origin.origin);
    sites.set(site, entry);
  }

  return [...sites.entries()]
    .sort(([siteA], [siteB]) => siteA.localeCompare(siteB))
    .map(([site, entry]) => ({
      site,
      cookies: entry.cookies,
      origins: [...entry.origins].sort()
    }));
}

function clearStorageStateByUrl(storageState: unknown | undefined, requestedUrl: string): {
  storageState: unknown;
  url: NormalizedProfileUrl;
  removedCookies: number;
  removedOrigins: string[];
} {
  const url = normalizeProfileUrl(requestedUrl);
  if (!isStorageState(storageState)) {
    return {
      storageState: createEmptyStorageState(),
      url,
      removedCookies: 0,
      removedOrigins: []
    };
  }

  const remainingCookies: Record<string, unknown>[] = [];
  let removedCookies = 0;
  for (const cookie of storageState.cookies) {
    const cookieDomain = typeof cookie.domain === "string" ? normalizeCookieDomain(cookie.domain) : undefined;
    if (cookieDomain !== undefined && domainMatchesCookie(cookieDomain, url.host)) {
      removedCookies += 1;
      continue;
    }
    remainingCookies.push(cookie);
  }

  const remainingOrigins: Record<string, unknown>[] = [];
  const removedOrigins: string[] = [];
  for (const origin of storageState.origins) {
    if (origin.origin === url.origin) {
      removedOrigins.push(url.origin);
      continue;
    }
    remainingOrigins.push(origin);
  }

  return {
    storageState: {
      ...storageState,
      cookies: remainingCookies,
      origins: remainingOrigins
    },
    url,
    removedCookies,
    removedOrigins: [...new Set(removedOrigins)].sort()
  };
}

function hasStorageStateEntries(storageState: unknown): boolean {
  return isStorageState(storageState) && (storageState.cookies.length > 0 || storageState.origins.length > 0);
}

function createEmptyStorageState(): {
  cookies: Record<string, unknown>[];
  origins: Record<string, unknown>[];
} {
  return {
    cookies: [],
    origins: []
  };
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

function normalizeProfileUrl(input: string): NormalizedProfileUrl {
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed === "true") {
    throw new Error("--url requires a URL value.");
  }
  const urlLike = hasUrlScheme(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(urlLike);
  } catch {
    throw new Error(`Invalid profile clear URL "${input}".`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Profile clear URL must use http or https.");
  }
  return {
    href: url.href,
    origin: url.origin,
    host: normalizeCookieDomain(url.hostname)
  };
}

function hasUrlScheme(input: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(input);
}

function normalizeCookieDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^\.+/, "").replace(/\.+$/, "");
}

function getOriginHost(origin: string): string | undefined {
  try {
    return normalizeCookieDomain(new URL(origin).hostname);
  } catch {
    return undefined;
  }
}

function domainMatchesCookie(cookieDomain: string, requestedDomain: string): boolean {
  return domainMatchesHost(cookieDomain, requestedDomain) || domainMatchesHost(requestedDomain, cookieDomain);
}

function domainMatchesHost(host: string, requestedDomain: string): boolean {
  return host === requestedDomain || host.endsWith(`.${requestedDomain}`);
}

async function readSavedAuthState(profileDirectory: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(getAuthStatePath(profileDirectory), "utf8"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
}

function assertSafeProfileClearPath(profileDirectory: string): void {
  const resolved = resolve(profileDirectory);
  const home = resolve(homedir());
  if (resolved === "/" || resolved === home || dirname(resolved) === resolved) {
    throw new Error(`Refusing to clear unsafe OpenRuntime profile path: ${resolved}.`);
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

function encodeProfileBundle(bundle: AuthProfileBundle): string {
  const encoded = gzipSync(JSON.stringify(bundle)).toString("base64url");
  return `${PROFILE_TOKEN_PREFIX}:${bundle.kind}:${encoded}`;
}

function decodeProfileBundle(input: string): AuthProfileBundle {
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
  if (kind !== "auth") {
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

function isProfileBundle(value: unknown, kind: "auth"): value is AuthProfileBundle {
  if (value === null || typeof value !== "object") return false;
  const bundle = value as Record<string, unknown>;
  if (bundle.version !== 1 || bundle.kind !== kind || typeof bundle.createdAt !== "string") return false;
  return "storageState" in bundle;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
