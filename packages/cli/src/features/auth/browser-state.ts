import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAgentBrowserSession, type BrowserRunner } from "../browser/runner.js";
import { AUTH_STATE_FILE_NAME, getAuthStatePath } from "./profile.js";

export const AUTH_STATE_APPLIED_FILE_NAME = ".openruntime-auth-state.applied";

export async function captureCurrentAuthState(browserRunner: BrowserRunner): Promise<unknown | undefined> {
  const directory = await mkdtemp(join(tmpdir(), "openruntime-auth-current-"));
  const statePath = join(directory, AUTH_STATE_FILE_NAME);
  let browserOpened = false;
  try {
    const openResult = await browserRunner.run(["open"]);
    if (openResult.exitCode !== 0) {
      const message = getBrowserRunError(openResult);
      if (isMissingBrowserError(message)) return undefined;
      throw new Error(message);
    }
    browserOpened = true;

    const saveResult = await browserRunner.run(["state", "save", statePath]);
    if (saveResult.exitCode !== 0) {
      throw new Error(getBrowserRunError(saveResult));
    }
    return JSON.parse(await readFile(statePath, "utf8"));
  } finally {
    if (browserOpened) {
      await closeBrowserForAuthState(browserRunner, {
        allowMissingBrowser: true
      });
    }
    await rm(directory, {
      recursive: true,
      force: true
    });
  }
}

export async function ensureSavedAuthStateApplied(
  browserRunner: BrowserRunner,
  profileDirectory: string
): Promise<void> {
  const statePath = getAuthStatePath(profileDirectory);
  if (!existsSync(statePath)) return;

  const stateDigest = getAuthStateDigest(await readFile(statePath));
  const applicationKey = getAuthStateApplicationKey(browserRunner, profileDirectory, stateDigest);
  const appliedDigest = await readAppliedDigest(profileDirectory);
  if (appliedDigest === applicationKey) return;

  await applySavedAuthState(browserRunner, profileDirectory, stateDigest);
}

export async function applySavedAuthStateIfPresent(
  browserRunner: BrowserRunner,
  profileDirectory: string
): Promise<void> {
  if (!existsSync(getAuthStatePath(profileDirectory))) return;
  await applySavedAuthState(browserRunner, profileDirectory);
}

export async function applySavedAuthState(
  browserRunner: BrowserRunner,
  profileDirectory: string,
  knownStateDigest?: string
): Promise<void> {
  const statePath = getAuthStatePath(profileDirectory);
  const stateDigest = knownStateDigest ?? getAuthStateDigest(await readFile(statePath));
  const openResult = await browserRunner.run(["open"]);
  if (openResult.exitCode !== 0) {
    const message = getBrowserRunError(openResult);
    if (isMissingBrowserError(message)) return;
    throw new Error(message);
  }
  try {
    const loadResult = await browserRunner.run(["state", "load", statePath]);
    if (loadResult.exitCode !== 0) {
      throw new Error(getBrowserRunError(loadResult));
    }
  } finally {
    await closeBrowserForAuthState(browserRunner, {
      allowMissingBrowser: true
    });
  }
  const applicationKey = getAuthStateApplicationKey(browserRunner, profileDirectory, stateDigest);
  await writeFile(getAppliedDigestPath(profileDirectory), `${applicationKey}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
}

export async function clearAgentBrowserRestore(
  browserRunner: BrowserRunner,
  profileDirectory: string
): Promise<void> {
  await closeBrowserForAuthState(browserRunner, {
    allowMissingBrowser: true
  });
  const restoreName = getRestoreName(browserRunner, profileDirectory);
  const result = await browserRunner.run(["state", "clear", restoreName, "--json"]);
  if (result.exitCode === 0) return;
  const message = getBrowserRunError(result);
  if (isMissingBrowserError(message)) return;
  throw new Error(message);
}

export async function closeBrowserForAuthState(
  browserRunner: BrowserRunner,
  options: {
    allowMissingBrowser?: boolean;
  } = {}
): Promise<void> {
  const result = await browserRunner.run(["close"]);
  if (result.exitCode !== 0) {
    const message = getBrowserRunError(result);
    if (options.allowMissingBrowser === true && isMissingBrowserError(message)) {
      return;
    }
    throw new Error(message);
  }
}

export function getAppliedDigestPath(profileDirectory: string): string {
  return join(profileDirectory, AUTH_STATE_APPLIED_FILE_NAME);
}

async function readAppliedDigest(profileDirectory: string): Promise<string | undefined> {
  try {
    return (await readFile(getAppliedDigestPath(profileDirectory), "utf8")).trim();
  } catch (error) {
    if (isFileNotFoundError(error)) return undefined;
    throw error;
  }
}

function getAuthStateDigest(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function getAuthStateApplicationKey(
  browserRunner: BrowserRunner,
  profileDirectory: string,
  stateDigest: string
): string {
  return createHash("sha256")
    .update(getRestoreName(browserRunner, profileDirectory))
    .update("\0")
    .update(stateDigest)
    .digest("hex");
}

function getRestoreName(browserRunner: BrowserRunner, profileDirectory: string): string {
  return browserRunner.authState?.restoreName
    ?? resolveAgentBrowserSession(process.env, profileDirectory);
}

function getBrowserRunError(result: { stdout: string; stderr: string }): string {
  return result.stderr.trim() || result.stdout.trim() || "OpenRuntime browser command failed.";
}

function isMissingBrowserError(message: string): boolean {
  return message.includes("daemon failed to start")
    || message.includes("ECONNREFUSED")
    || message.includes("ENOENT");
}

function isFileNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
