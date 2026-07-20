import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getNumberOption, getOptionValue, type ParsedCliArgs } from "../utils/args.js";
import { exportAuthProfileWithConnector } from "../features/auth/connector/index.js";
import type { BrowserRunner } from "../features/browser/runner.js";
import { clearProfile, getProfileDirectory, importProfile, listProfile, readProfileInputFile, type AuthStateApplier } from "../features/auth/profile.js";
import { applySavedAuthState, applySavedAuthStateIfPresent, captureCurrentAuthState, clearAgentBrowserRestore, closeBrowserForAuthState } from "../features/auth/browser-state.js";
import { createError } from "../utils/output.js";
import { createOptionalNumberProperty, createOptionalStringProperty, writeJson } from "../utils/command.js";

export async function runAuthCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  browserRunner: BrowserRunner,
  authConnectorExporter: typeof exportAuthProfileWithConnector,
  authStateApplier: AuthStateApplier | undefined
): Promise<number> {
  const action = args.command[1];
  if (action === "export") {
    return await runAuthExportCommand(args, stdout, authConnectorExporter);
  }
  if (action === "import") {
    return await runAuthImportCommand(args, stdout, browserRunner, authStateApplier);
  }
  if (action === "list") {
    writeJson(stdout, await listProfile({
      profileDirectory: getBrowserProfileDirectory(browserRunner)
    }));
    return 0;
  }
  if (action === "clear") {
    const url = getOptionValue(args, "url") ?? args.command[2];
    const profileDirectory = getBrowserProfileDirectory(browserRunner);
    const currentStorageState = url === undefined
      ? undefined
      : await captureCurrentAuthState(browserRunner);
    await clearAgentBrowserRestore(browserRunner, profileDirectory);
    try {
      const result = await clearProfile({
        profileDirectory,
        ...createOptionalStringProperty("url", url),
        ...(currentStorageState === undefined ? {} : { currentStorageState })
      });
      await applySavedAuthStateIfPresent(browserRunner, profileDirectory);
      writeJson(stdout, result);
    } catch (error) {
      try {
        await applySavedAuthStateIfPresent(browserRunner, profileDirectory);
      } catch {
        // Keep the original clear error; a later `open` retries unapplied saved auth.
      }
      throw error;
    }
    return 0;
  }

  throw createError({
    code: "AUTH_COMMAND_INVALID",
    kind: "validation",
    message: "auth requires export, import, list, or clear.",
    outputCommand: "auth",
    hint: "Use `openruntime auth export <url>`, `openruntime auth import <path>`, `openruntime auth list`, or `openruntime auth clear --url <url>`."
  });
}

async function runAuthExportCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  authConnectorExporter: typeof exportAuthProfileWithConnector
): Promise<number> {
  const requestedUrl = args.command[2];
  if (requestedUrl === undefined || requestedUrl.length === 0) {
    throw createError({
      code: "AUTH_EXPORT_URL_REQUIRED",
      kind: "validation",
      message: "auth export requires <url>.",
      hint: "Use `openruntime auth export https://app.example.com`."
    });
  }

  const outputPath = getOptionValue(args, "output") ?? await createTemporaryProfilePath();
  const result = await authConnectorExporter({
    requestedUrl: normalizeAuthExportUrl(requestedUrl),
    outputPath,
    ...createOptionalNumberProperty("timeout", getNumberOption(args, "timeout")),
    ...createOptionalStringProperty("extensionDirectory", getOptionValue(args, "extension-dir")),
    ...createOptionalStringProperty("extensionInstallUrl", getOptionValue(args, "extension-install-url")),
    ...createOptionalStringProperty("extensionIconPath", getOptionValue(args, "extension-icon"))
  });
  stdout.write(`${result.path}\n`);
  return 0;
}

async function runAuthImportCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  browserRunner: BrowserRunner,
  authStateApplier: AuthStateApplier | undefined
): Promise<number> {
  const inputPath = args.command[2];
  if (inputPath === undefined || inputPath.length === 0) {
    throw createError({
      code: "AUTH_IMPORT_PATH_REQUIRED",
      kind: "validation",
      message: "auth import requires <path>.",
      hint: "Use `openruntime auth import /path/to/auth.oprprofile`."
    });
  }
  const input = await readProfileInputFile(inputPath);
  const profileDirectory = getBrowserProfileDirectory(browserRunner);
  let currentStorageState: unknown | undefined;
  if (authStateApplier === undefined) {
    currentStorageState = await captureCurrentAuthState(browserRunner);
  } else {
    await closeBrowserForAuthState(browserRunner);
  }
  const result = await importProfile({
    input,
    profileDirectory,
    ...(currentStorageState === undefined ? {} : { currentStorageState }),
    applyAuthState: authStateApplier ?? (async (applierProfileDirectory) => {
      await applySavedAuthState(browserRunner, applierProfileDirectory);
    })
  });
  writeJson(stdout, result);
  return 0;
}

function normalizeAuthExportUrl(input: string): string {
  let url: URL;
  const trimmed = input.trim();
  const urlLike = hasUrlScheme(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    url = new URL(urlLike);
  } catch {
    throw createError({
      code: "AUTH_EXPORT_URL_INVALID",
      kind: "validation",
      message: `Invalid auth export URL "${input}".`,
      hint: "Pass an http or https URL, or a plain domain."
    });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw createError({
      code: "AUTH_EXPORT_URL_UNSUPPORTED",
      kind: "validation",
      message: "Auth export URL must use http or https.",
      hint: "Pass an http or https URL, or a plain domain."
    });
  }
  return url.href;
}

function hasUrlScheme(input: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(input);
}

async function createTemporaryProfilePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "openruntime-profile-export-"));
  return join(directory, "openruntime-profile.oprprofile");
}

function getBrowserProfileDirectory(browserRunner: BrowserRunner): string {
  return browserRunner.authState?.profileDirectory ?? getProfileDirectory();
}
