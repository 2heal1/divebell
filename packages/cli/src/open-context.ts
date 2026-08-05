import type { ParsedCliArgs } from "./utils/args.js";
import type { CliOperationLogEntry } from "./utils/operation-log.js";
import { createError } from "./utils/output.js";
import { hasOption } from "./utils/command.js";
import { withDivebellSession } from "./utils/url.js";
import type { CliExtensionPageContext } from "./types/commands.js";
import { bindBrowserRunOptions, type BrowserRunner } from "./features/browser/runner.js";

export function applyOpenContextBrowserMode(
  browserRunner: BrowserRunner,
  openContext: CliOperationLogEntry | undefined
): BrowserRunner {
  return openContext?.browserRestoreDisabled === true
    ? bindBrowserRunOptions(browserRunner, { disableRestore: true })
    : browserRunner;
}

export function applyOpenContextDefaults(
  args: ParsedCliArgs,
  openContext: CliOperationLogEntry | undefined
): ParsedCliArgs {
  if (openContext === undefined) {
    return args;
  }

  const options = cloneOptions(args.options);
  if (
    openContext.bridgeUrl !== null &&
    !hasOption(args, "bridge") &&
    !hasOption(args, "port")
  ) {
    setDefaultOption(options, "bridge", openContext.bridgeUrl);
  }
  if (!hasRuntimeSelectorOption(args)) {
    setDefaultOption(options, "url", openContext.url);
    if (openContext.sessionId !== null) {
      setDefaultOption(options, "session", openContext.sessionId);
    }
  }

  return {
    command: args.command,
    options
  };
}

export function createExtensionPageContext(openContext: CliOperationLogEntry): CliExtensionPageContext {
  return {
    url: openContext.url,
    openedUrl: openContext.openedUrl ??
      withDivebellSession(openContext.url, openContext.sessionId ?? undefined),
    normalizedUrl: openContext.normalizedUrl,
    bridgeUrl: openContext.bridgeUrl,
    sessionId: openContext.sessionId,
    openedAt: openContext.openedAt
  };
}

export function applyOpenContextDefaultsOrThrow(
  args: ParsedCliArgs,
  openContext: CliOperationLogEntry | undefined,
  requirement: "always" | "unless-selector"
): ParsedCliArgs {
  if (openContext === undefined && (requirement === "always" || (!hasRuntimeSelectorOption(args) && !hasOption(args, "bridge")))) {
    throw createOpenContextRequiredError(args);
  }
  if (
    openContext !== undefined &&
    openContext.bridgeUrl === null &&
    requirement === "unless-selector" &&
    !hasRuntimeSelectorOption(args) &&
    !hasOption(args, "bridge")
  ) {
    throw createError({
      code: "OPEN_CONTEXT_REQUIRES_BRIDGE",
      kind: "validation",
      message: "The opened page context was created without a Bridge.",
      retryable: false,
      hint: "Run `divebell open <url>` without `--no-bridge`, or pass `--bridge <url>` explicitly."
    });
  }
  return applyOpenContextDefaults(args, openContext);
}

function createOpenContextRequiredError(args: ParsedCliArgs): Error {
  const command = args.command.join(" ") || "divebell";
  return createError({
    code: "OPEN_CONTEXT_REQUIRED",
    kind: "validation",
    message: "No opened page context was found.",
    retryable: false,
    hint: `Run \`divebell open <url>\` before \`divebell ${command}\`.`,
    details: {
      command
    }
  });
}

function hasRuntimeSelectorOption(args: ParsedCliArgs): boolean {
  return hasOption(args, "runtime") || hasOption(args, "session") || hasOption(args, "url");
}

function cloneOptions(options: Map<string, string[]>): Map<string, string[]> {
  return new Map([...options.entries()].map(([name, values]) => [name, [...values]]));
}

function setDefaultOption(options: Map<string, string[]>, name: string, value: string): void {
  if (!options.has(name)) {
    options.set(name, [value]);
  }
}
