import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getNumberOption, getOptionValue, type ParsedCliArgs } from "../utils/args.js";
import { exportAuthProfileWithConnector } from "../features/auth/connector/index.js";
import type { BrowserRunner } from "../features/browser/runner.js";
import { clearProfile, getProfileDirectory, importProfile, listProfile, readProfileInput, readProfileInputFile, type AuthStateApplier, type ProfileExportResult } from "../features/auth/profile.js";
import { createError } from "../utils/output.js";
import { createOptionalNumberProperty, createOptionalObjectProperty, createOptionalStringProperty, writeJson } from "../utils/command.js";

const PROFILE_INLINE_OUTPUT_MAX_CHARS = 32_768;
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
      profileDirectory: getProfileDirectory()
    }));
    return 0;
  }
  if (action === "clear") {
    const url = getOptionValue(args, "url") ?? args.command[2];
    await closeBrowserForProfileCommand(browserRunner, {
      allowMissingBrowser: true
    });
    writeJson(stdout, await clearProfile({
      profileDirectory: getProfileDirectory(),
      ...createOptionalStringProperty("url", url)
    }));
    return 0;
  }

  throw createError({
    code: "AUTH_COMMAND_INVALID",
    kind: "validation",
    message: "auth requires export, import, list, or clear.",
    outputCommand: "auth",
    hint: "Use `openruntime auth export --url <url>`, `openruntime auth import --input <path>`, `openruntime auth list`, or `openruntime auth clear --url <url>`."
  });
}

async function runAuthExportCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  authConnectorExporter: typeof exportAuthProfileWithConnector
): Promise<number> {
  const requestedUrl = getOptionValue(args, "url") ?? args.command[2];
  if (requestedUrl === undefined || requestedUrl.length === 0) {
    throw createError({
      code: "AUTH_EXPORT_URL_REQUIRED",
      kind: "validation",
      message: "auth export requires --url <url>.",
      hint: "Use `openruntime auth export --url https://app.example.com`."
    });
  }

  const result = await authConnectorExporter({
    requestedUrl: normalizeAuthExportUrl(requestedUrl),
    ...createOptionalStringProperty("outputPath", getOptionValue(args, "output")),
    ...createOptionalNumberProperty("timeout", getNumberOption(args, "timeout")),
    ...createOptionalStringProperty("extensionDirectory", getOptionValue(args, "extension-dir")),
    ...createOptionalStringProperty("extensionInstallUrl", getOptionValue(args, "extension-install-url")),
    ...createOptionalStringProperty("extensionIconPath", getOptionValue(args, "extension-icon"))
  });
  stdout.write(`${await getPrintableProfileExportResult(result)}\n`);
  return 0;
}

async function runAuthImportCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  browserRunner: BrowserRunner,
  authStateApplier: AuthStateApplier | undefined
): Promise<number> {
  await closeBrowserForProfileCommand(browserRunner);
  const inputPath = getOptionValue(args, "input");
  const input = inputPath === undefined
    ? await readProfileInput(args.command[2])
    : await readProfileInputFile(inputPath);
  const result = await importProfile({
    input,
    profileDirectory: getProfileDirectory(),
    ...createOptionalObjectProperty("applyAuthState", authStateApplier)
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

async function getPrintableProfileExportResult(result: ProfileExportResult): Promise<string> {
  if (result.path !== undefined) return result.path;
  if (result.content === undefined) {
    throw new Error("Profile export did not return content.");
  }
  if (result.content.length <= PROFILE_INLINE_OUTPUT_MAX_CHARS) return result.content;

  const directory = await mkdtemp(join(tmpdir(), "openruntime-profile-export-"));
  const path = join(directory, "openruntime-profile.oprprofile");
  await writeFile(path, `${result.content}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  return path;
}

async function closeBrowserForProfileCommand(
  browserRunner: BrowserRunner,
  options: {
    allowMissingBrowser?: boolean;
  } = {}
): Promise<void> {
  const result = await browserRunner.run(["close"]);
  if (result.exitCode !== 0) {
    const message = result.stderr.trim() || result.stdout.trim() || "Could not close OpenRuntime browser.";
    if (options.allowMissingBrowser === true && isMissingBrowserCloseError(message)) {
      return;
    }
    throw new Error(message);
  }
}

function isMissingBrowserCloseError(message: string): boolean {
  return message.includes("daemon failed to start")
    || message.includes("ECONNREFUSED")
    || message.includes("ENOENT");
}
