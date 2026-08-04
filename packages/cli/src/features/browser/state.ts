import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { BrowserRunner } from "./runner.js";
import { createError } from "../../utils/output.js";

interface BrowserStorageState {
  cookies: Record<string, unknown>[];
  origins: Record<string, unknown>[];
  [key: string]: unknown;
}

export interface UrlScopedStateSaveResult {
  path: string;
  url: string;
  includeUrls?: string[];
  cookies: number;
  origins: number;
}

export async function saveUrlScopedBrowserState(
  browserRunner: BrowserRunner,
  options: {
    url: string;
    includeUrls?: string[];
    outputPath?: string;
  }
): Promise<UrlScopedStateSaveResult> {
  const url = normalizeStateUrl(options.url);
  const includeUrls = normalizeIncludedStateUrls(options.includeUrls ?? [], url);
  if (options.outputPath === undefined || options.outputPath.length === 0) {
    throw createError({
      code: "STATE_SAVE_PATH_REQUIRED",
      kind: "validation",
      message: "state save requires <path>.",
      hint: "Use `divebell state save ./app-state.json --url https://app.example.com`."
    });
  }

  const outputPath = resolve(options.outputPath);
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "divebell-state-export-"));
  const temporaryPath = join(temporaryDirectory, "browser-state.json");
  try {
    const saveArgs = ["state", "save", temporaryPath];
    const includedOrigins = new Set(
      includeUrls
        .map((includeUrl) => includeUrl.origin)
        .filter((origin) => origin !== url.origin)
    );
    for (const origin of includedOrigins) {
      saveArgs.push("--include-origin", origin);
    }
    saveArgs.push("--json");
    const saveResult = await browserRunner.run(
      saveArgs,
      { unencryptedStateOutput: true }
    );
    if (saveResult.exitCode !== 0) {
      throw createError({
        code: "STATE_SAVE_FAILED",
        kind: "browser",
        message: saveResult.stderr.trim() || saveResult.stdout.trim() || "Could not save browser state.",
        details: { url: url.href }
      });
    }

    const state = parseBrowserStorageState(await readFile(temporaryPath, "utf8"));
    const scopedState = filterBrowserStateForUrls(state, [url, ...includeUrls]);
    await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
    await writeFile(outputPath, `${JSON.stringify(scopedState, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
    await chmod(outputPath, 0o600);
    return {
      path: outputPath,
      url: url.href,
      ...(includeUrls.length === 0
        ? {}
        : { includeUrls: includeUrls.map((includeUrl) => includeUrl.href) }),
      cookies: scopedState.cookies.length,
      origins: scopedState.origins.length
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export function filterBrowserStateForUrl(state: BrowserStorageState, url: URL): BrowserStorageState {
  return filterBrowserStateForUrls(state, [url]);
}

export function filterBrowserStateForUrls(state: BrowserStorageState, urls: URL[]): BrowserStorageState {
  const origins = new Set(urls.map((url) => url.origin));
  return {
    ...state,
    cookies: state.cookies.filter((cookie) => urls.some((url) => cookieAppliesToUrl(cookie, url))),
    origins: state.origins.filter((origin) => typeof origin.origin === "string" && origins.has(origin.origin))
  };
}

function normalizeIncludedStateUrls(inputs: string[], primaryUrl: URL): URL[] {
  const seen = new Set([primaryUrl.href]);
  const urls: URL[] = [];
  for (const input of inputs) {
    const url = normalizeStateUrl(input);
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    urls.push(url);
  }
  return urls;
}

function parseBrowserStorageState(input: string): BrowserStorageState {
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    throw invalidStateError();
  }
  if (value === null || typeof value !== "object") throw invalidStateError();
  const state = value as Record<string, unknown>;
  if (!Array.isArray(state.cookies) || !Array.isArray(state.origins)) throw invalidStateError();
  if (!state.cookies.every(isRecord) || !state.origins.every(isRecord)) throw invalidStateError();
  return state as BrowserStorageState;
}

function cookieAppliesToUrl(cookie: Record<string, unknown>, url: URL): boolean {
  if (typeof cookie.domain !== "string") return false;
  const cookieDomain = normalizeCookieDomain(cookie.domain);
  const host = normalizeCookieDomain(url.hostname);
  if (host !== cookieDomain && !host.endsWith(`.${cookieDomain}`)) return false;
  if (cookie.secure === true && url.protocol !== "https:") return false;

  const cookiePath = typeof cookie.path === "string" && cookie.path.startsWith("/")
    ? cookie.path
    : "/";
  return pathMatchesCookie(url.pathname || "/", cookiePath);
}

function pathMatchesCookie(requestPath: string, cookiePath: string): boolean {
  if (requestPath === cookiePath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith("/") || requestPath.charAt(cookiePath.length) === "/";
}

function normalizeStateUrl(input: string): URL {
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed === "true") {
    throw invalidUrlError(input);
  }
  const candidate = hasUrlScheme(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw invalidUrlError(input);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw invalidUrlError(input);
  }
  return url;
}

function hasUrlScheme(input: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(input);
}

function normalizeCookieDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^\.+/, "").replace(/\.+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidStateError(): Error {
  return createError({
    code: "STATE_FILE_INVALID",
    kind: "browser",
    message: "agent-browser produced an invalid state file."
  });
}

function invalidUrlError(input: string): Error {
  return createError({
    code: "STATE_URL_INVALID",
    kind: "validation",
    message: `Invalid state URL "${input}".`,
    hint: "Pass an http or https URL, or a plain domain."
  });
}
