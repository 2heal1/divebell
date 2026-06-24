import { gzipSync, gunzipSync } from "node:zlib";
import { Buffer } from "node:buffer";
import {
  constants,
  existsSync,
  lstatSync,
  readFileSync
} from "node:fs";
import { access, cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import { resolveBrowserProfileDirectory } from "./browser.js";

export const PROFILE_TOKEN_PREFIX = "openruntime-profile:v1";
export const AUTH_STATE_FILE_NAME = ".openruntime-auth-state.json";
const CHROME_PROFILE_EXPORT_TIMEOUT_MS = 60_000;
const CHROME_CDP_PROBE_TIMEOUT_MS = 250;
const DEFAULT_CHROME_CDP_ENDPOINTS = [
  "http://127.0.0.1:9222",
  "http://localhost:9222"
];

interface AuthProfileBundle {
  version: 1;
  kind: "auth";
  createdAt: string;
  storageState: unknown;
}

export interface ProfileExportResult {
  kind: "auth";
  path?: string;
  content?: string;
}

export interface ProfileImportResult {
  kind: "auth";
  profileDirectory: string;
}

export interface ChromeProfileExportOptions {
  outputPath?: string;
  userDataDirectory?: string;
  profile?: string;
  timeout?: number;
  domains?: string[];
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}

export interface ResolvedChromeProfile {
  userDataDirectory: string;
  profileDirectoryName: string;
  profileDirectory: string;
  label: string;
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
  domains?: string[];
}): Promise<ProfileExportResult> {
  const domains = normalizeProfileDomains(options.domains ?? []);
  const storageState = filterStorageStateByNormalizedDomains(
    await captureAuthState(options.profileDirectory),
    domains
  );
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

export async function exportChromeAuthProfile(options: ChromeProfileExportOptions = {}): Promise<ProfileExportResult> {
  const domains = normalizeProfileDomains(options.domains ?? []);
  const chromeProfile = resolveChromeProfile(options);
  let storageState: unknown;
  try {
    storageState = domains.length > 0
      ? await captureChromeDomainAuthState(chromeProfile, options.timeout, domains, options.env ?? process.env)
      : await captureChromeAuthState(chromeProfile, options.timeout, domains);
  } catch (error) {
    throw new Error(`Could not read Chrome profile "${chromeProfile.label}". ${formatChromeProfileReadError(error, domains.length > 0)}`);
  }

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

export async function importProfile(options: {
  input: string;
  profileDirectory: string;
}): Promise<ProfileImportResult> {
  const bundle = decodeProfileBundle(options.input);
  const profileDirectory = resolve(options.profileDirectory);

  await applyAuthState(profileDirectory, bundle.storageState);
  return {
    kind: "auth",
    profileDirectory
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

export function getDefaultChromeUserDataDirectory(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): string {
  const home = env.HOME ?? homedir();
  if (platform === "darwin") {
    return join(home, "Library", "Application Support", "Google", "Chrome");
  }
  if (platform === "win32") {
    return join(env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "Google", "Chrome", "User Data");
  }
  return join(env.XDG_CONFIG_HOME ?? join(home, ".config"), "google-chrome");
}

export function resolveChromeProfile(options: ChromeProfileExportOptions = {}): ResolvedChromeProfile {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const defaultUserDataDirectory = getDefaultChromeUserDataDirectory(env, platform);
  const rawProfile = options.profile;

  if (rawProfile !== undefined && isAbsolute(rawProfile)) {
    const profileDirectory = resolve(rawProfile);
    return createResolvedChromeProfile(dirname(profileDirectory), basename(profileDirectory), undefined);
  }

  const userDataDirectory = resolve(options.userDataDirectory ?? defaultUserDataDirectory);
  assertChromeUserDataDirectoryExists(userDataDirectory);
  const localState = readChromeLocalState(userDataDirectory);
  const profileDirectoryName = selectChromeProfileDirectoryName(localState, rawProfile);
  return createResolvedChromeProfile(userDataDirectory, profileDirectoryName, localState);
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

async function captureChromeAuthState(
  chromeProfile: ResolvedChromeProfile,
  timeout: number | undefined,
  domains: string[]
): Promise<unknown> {
  assertChromeProfileIsNotLocked(chromeProfile);
  const launchOptions = createProfileLaunchOptions() ?? {};
  const context = await chromium.launchPersistentContext(chromeProfile.userDataDirectory, {
    ...launchOptions,
    channel: "chrome",
    timeout: timeout ?? CHROME_PROFILE_EXPORT_TIMEOUT_MS,
    args: [
      ...(launchOptions.args ?? []),
      `--profile-directory=${chromeProfile.profileDirectoryName}`,
      "--no-first-run",
      "--no-default-browser-check"
    ]
  });
  try {
    if (domains.length > 0) {
      return await captureVisitedDomainAuthState(context, domains, timeout);
    }
    return await context.storageState({ indexedDB: true });
  } finally {
    await context.close();
  }
}

async function captureCopiedChromeDomainAuthState(
  chromeProfile: ResolvedChromeProfile,
  timeout: number | undefined,
  domains: string[]
): Promise<unknown> {
  const copiedProfile = await copyChromeProfileForDomainExport(chromeProfile, domains);
  try {
    return await captureChromeAuthState(copiedProfile, timeout, domains);
  } finally {
    await rm(copiedProfile.userDataDirectory, {
      recursive: true,
      force: true
    });
  }
}

async function captureChromeDomainAuthState(
  chromeProfile: ResolvedChromeProfile,
  timeout: number | undefined,
  domains: string[],
  env: NodeJS.ProcessEnv
): Promise<unknown> {
  const cdpEndpoint = await resolveChromeCdpEndpoint(env);
  if (cdpEndpoint !== undefined) {
    try {
      return await captureChromeDomainAuthStateViaCdp(cdpEndpoint, timeout, domains);
    } catch {
      // A discovered CDP endpoint can be stale or incompatible. Keep export reliable
      // by falling back to the isolated profile copy.
    }
  }
  return await captureCopiedChromeDomainAuthState(chromeProfile, timeout, domains);
}

async function captureChromeDomainAuthStateViaCdp(
  endpoint: string,
  timeout: number | undefined,
  domains: string[]
): Promise<unknown> {
  const browser = await chromium.connectOverCDP(endpoint, {
    timeout: timeout ?? CHROME_PROFILE_EXPORT_TIMEOUT_MS
  });
  try {
    const context = browser.contexts()[0];
    if (context === undefined) {
      throw new Error("Connected Chrome has no browser context.");
    }
    return await captureVisitedDomainAuthState(context, domains, timeout);
  } finally {
    await browser.close();
  }
}

async function captureVisitedDomainAuthState(
  context: BrowserContext,
  domains: string[],
  timeout: number | undefined
): Promise<unknown> {
  const pages: Page[] = [];
  try {
    for (const domain of domains) {
      const page = await context.newPage();
      pages.push(page);
      await page.goto(`https://${domain}`, {
        waitUntil: "domcontentloaded",
        timeout: timeout ?? CHROME_PROFILE_EXPORT_TIMEOUT_MS
      });
    }
    return filterStorageStateByNormalizedDomains(
      await context.storageState({ indexedDB: true }),
      domains
    );
  } finally {
    await Promise.all(pages.map(async (page) => {
      if (!page.isClosed()) {
        await page.close().catch(() => undefined);
      }
    }));
  }
}

async function resolveChromeCdpEndpoint(env: NodeJS.ProcessEnv): Promise<string | undefined> {
  const configuredEndpoint = env.OPENRUNTIME_CHROME_CDP_ENDPOINT?.trim() || env.OPENRUNTIME_CHROME_CDP_URL?.trim();
  if (configuredEndpoint !== undefined && configuredEndpoint.length > 0) {
    if (configuredEndpoint.startsWith("ws://") || configuredEndpoint.startsWith("wss://")) {
      return configuredEndpoint;
    }
    return await isChromeCdpEndpoint(configuredEndpoint) ? configuredEndpoint : undefined;
  }

  for (const endpoint of DEFAULT_CHROME_CDP_ENDPOINTS) {
    if (await isChromeCdpEndpoint(endpoint)) {
      return endpoint;
    }
  }
  return undefined;
}

async function isChromeCdpEndpoint(endpoint: string): Promise<boolean> {
  let response: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHROME_CDP_PROBE_TIMEOUT_MS);
  try {
    response = await fetch(createChromeCdpVersionUrl(endpoint), {
      signal: controller.signal
    });
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) return false;
  try {
    const metadata = await response.json() as Record<string, unknown>;
    return typeof metadata.Browser === "string" || typeof metadata.webSocketDebuggerUrl === "string";
  } catch {
    return false;
  }
}

function createChromeCdpVersionUrl(endpoint: string): string {
  const url = new URL(endpoint);
  url.pathname = "/json/version";
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function copyChromeProfileForDomainExport(
  chromeProfile: ResolvedChromeProfile,
  domains: string[]
): Promise<ResolvedChromeProfile> {
  const userDataDirectory = await mkdtemp(join(tmpdir(), "openruntime-chrome-profile-"));
  const profileDirectory = join(userDataDirectory, chromeProfile.profileDirectoryName);
  await mkdir(profileDirectory, {
    recursive: true,
    mode: 0o700
  });

  await copyChromeProfileEntry(chromeProfile.userDataDirectory, userDataDirectory, "Local State");
  for (const name of [
    "Preferences",
    "Secure Preferences",
    "Cookies",
    "Cookies-journal",
    "Network",
    "Local Storage"
  ]) {
    await copyChromeProfileEntry(chromeProfile.profileDirectory, profileDirectory, name);
  }
  await copyChromeIndexedDbForDomains(chromeProfile.profileDirectory, profileDirectory, domains);

  return {
    userDataDirectory,
    profileDirectoryName: chromeProfile.profileDirectoryName,
    profileDirectory,
    label: `${chromeProfile.label} copy`
  };
}

async function copyChromeProfileEntry(sourceDirectory: string, targetDirectory: string, name: string): Promise<void> {
  const sourcePath = join(sourceDirectory, name);
  if (!existsSync(sourcePath)) return;
  await mkdir(targetDirectory, {
    recursive: true,
    mode: 0o700
  });
  await cp(sourcePath, join(targetDirectory, name), {
    recursive: true,
    force: true,
    filter: shouldCopyChromeProfilePath
  });
}

async function copyChromeIndexedDbForDomains(sourceProfileDirectory: string, targetProfileDirectory: string, domains: string[]): Promise<void> {
  const sourceIndexedDbDirectory = join(sourceProfileDirectory, "IndexedDB");
  if (!existsSync(sourceIndexedDbDirectory)) return;

  const entries = await readdir(sourceIndexedDbDirectory, {
    withFileTypes: true
  });
  for (const entry of entries) {
    if (!entry.isDirectory() || !chromeIndexedDbDirectoryMatchesDomains(entry.name, domains)) {
      continue;
    }
    await copyChromeProfileEntry(sourceIndexedDbDirectory, join(targetProfileDirectory, "IndexedDB"), entry.name);
  }
}

function chromeIndexedDbDirectoryMatchesDomains(name: string, domains: string[]): boolean {
  const normalizedName = name.toLowerCase();
  if (!normalizedName.endsWith(".indexeddb.leveldb") && !normalizedName.endsWith(".indexeddb.blob")) {
    return false;
  }

  return domains.some((domain) => normalizedName.includes(`_${domain}_`) || normalizedName.includes(`.${domain}_`));
}

function shouldCopyChromeProfilePath(sourcePath: string): boolean {
  return basename(sourcePath) !== "LOCK";
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

export function filterStorageStateByDomains(storageState: unknown, domains: string[]): unknown {
  return filterStorageStateByNormalizedDomains(storageState, normalizeProfileDomains(domains));
}

function filterStorageStateByNormalizedDomains(storageState: unknown, normalizedDomains: string[]): unknown {
  if (!isStorageState(storageState)) return storageState;
  if (normalizedDomains.length === 0) return storageState;

  return {
    ...storageState,
    cookies: storageState.cookies.filter((cookie) => {
      const cookieDomain = typeof cookie.domain === "string" ? normalizeCookieDomain(cookie.domain) : undefined;
      return cookieDomain !== undefined && normalizedDomains.some((domain) => domainMatchesCookie(cookieDomain, domain));
    }),
    origins: storageState.origins.filter((origin) => {
      const originHost = typeof origin.origin === "string" ? getOriginHost(origin.origin) : undefined;
      return originHost !== undefined && normalizedDomains.some((domain) => domainMatchesHost(originHost, domain));
    })
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

function normalizeProfileDomains(domains: string[]): string[] {
  return domains.map(normalizeProfileDomain);
}

function normalizeProfileDomain(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed === "true") {
    throw new Error("--domain requires a domain value.");
  }

  const urlLike = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
  try {
    return normalizeCookieDomain(new URL(urlLike).hostname);
  } catch {
    throw new Error(`Invalid profile domain "${input}".`);
  }
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

function createResolvedChromeProfile(
  userDataDirectory: string,
  profileDirectoryName: string,
  localState: Record<string, unknown> | undefined
): ResolvedChromeProfile {
  const profileDirectory = resolve(userDataDirectory, profileDirectoryName);
  assertProfilePathInside(userDataDirectory, profileDirectory);
  if (!existsSync(profileDirectory)) {
    throw new Error(`Chrome profile was not found at ${profileDirectory}.`);
  }

  const metadata = getChromeProfileMetadata(localState, profileDirectoryName);
  const labelParts = [
    metadata.name,
    metadata.userName,
    profileDirectoryName
  ].filter((value): value is string => value !== undefined && value.length > 0);

  return {
    userDataDirectory,
    profileDirectoryName,
    profileDirectory,
    label: labelParts.join(" / ")
  };
}

function assertChromeProfileIsNotLocked(chromeProfile: ResolvedChromeProfile): void {
  const lockPaths = [
    join(chromeProfile.userDataDirectory, "SingletonLock"),
    join(chromeProfile.userDataDirectory, "SingletonSocket"),
    join(chromeProfile.userDataDirectory, "SingletonCookie")
  ];
  if (lockPaths.some((path) => lstatSync(path, { throwIfNoEntry: false }) !== undefined)) {
    throw new Error(`Chrome profile "${chromeProfile.label}" is currently in use. Quit Google Chrome and retry.`);
  }
}

function formatChromeProfileReadError(error: unknown, usedDomainCopy: boolean): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("currently in use") || message.includes("ProcessSingleton") || message.includes("SingletonLock") || message.includes("profile is already in use")) {
    return "Chrome profile is currently in use. Quit Google Chrome and retry.";
  }
  if (message.includes("Timeout")) {
    if (usedDomainCopy) {
      return "Timed out while reading the copied Chrome profile or visiting the domain. Pass --timeout <ms>.";
    }
    return "Timed out while opening the Chrome profile. Make sure Google Chrome is fully quit and retry, pass --timeout <ms>, or use --domain <domain> if you only need one site.";
  }
  return "Quit Google Chrome and retry, or pass --chrome-profile <name>.";
}

function assertChromeUserDataDirectoryExists(userDataDirectory: string): void {
  if (!existsSync(userDataDirectory)) {
    throw new Error(`Chrome user data directory was not found at ${userDataDirectory}.`);
  }
}

function readChromeLocalState(userDataDirectory: string): Record<string, unknown> {
  const path = join(userDataDirectory, "Local State");
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(`Chrome Local State was not found at ${path}.`);
    }
    throw new Error(`Chrome Local State could not be read at ${path}.`);
  }
}

function selectChromeProfileDirectoryName(localState: Record<string, unknown>, requestedProfile: string | undefined): string {
  const profiles = getChromeProfileInfoCache(localState);
  if (requestedProfile !== undefined && requestedProfile.length > 0) {
    const match = profiles.find((profile) =>
      profile.directory === requestedProfile ||
      profile.name === requestedProfile ||
      profile.userName === requestedProfile
    );
    if (match !== undefined) return match.directory;
    return requestedProfile;
  }

  const profileState = getRecord(localState.profile);
  const lastUsed = typeof profileState?.last_used === "string" ? profileState.last_used : undefined;
  if (lastUsed !== undefined && lastUsed.length > 0) return lastUsed;
  return "Default";
}

function getChromeProfileInfoCache(localState: Record<string, unknown>): Array<{
  directory: string;
  name?: string;
  userName?: string;
}> {
  const profileState = getRecord(localState.profile);
  const infoCache = getRecord(profileState?.info_cache);
  if (infoCache === undefined) return [];
  return Object.entries(infoCache).map(([directory, value]) => {
    const metadata = getRecord(value);
    const name = typeof metadata?.name === "string" ? metadata.name : undefined;
    const userName = typeof metadata?.user_name === "string" ? metadata.user_name : undefined;
    return {
      directory,
      ...(name === undefined ? {} : { name }),
      ...(userName === undefined ? {} : { userName })
    };
  });
}

function getChromeProfileMetadata(localState: Record<string, unknown> | undefined, profileDirectoryName: string): {
  name?: string;
  userName?: string;
} {
  if (localState === undefined) return {};
  return getChromeProfileInfoCache(localState).find((profile) => profile.directory === profileDirectoryName) ?? {};
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function assertProfilePathInside(userDataDirectory: string, profileDirectory: string): void {
  const relativePath = relative(resolve(userDataDirectory), resolve(profileDirectory));
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`Chrome profile must be inside ${userDataDirectory}.`);
  }
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

function createProfileLaunchOptions(): Parameters<typeof chromium.launchPersistentContext>[1] {
  return {
    headless: true,
    viewport: null,
    args: process.getuid?.() === 0 ? ["--no-sandbox"] : []
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
