import { getOptionValue, type ParsedCliArgs } from "../../utils/args.js";
import { createOperationSessionId } from "../../utils/operation-log.js";
import { hasOption, requireCommandArgument } from "../../utils/command.js";
import { withDivebellSession } from "../../utils/url.js";

const DIVEBELL_ONLY_BROWSER_OPTIONS = new Set([
  "base64",
  "bridge",
  "cdp-session",
  "file",
  "full-page",
  "network-rules",
  "no-bridge",
  "no-default-profile",
  "no-webmcp",
  "port",
  "profile",
  "proxy-pac-url",
  "runtime",
  "session",
  "state",
  "ui"
]);

const FIRST_TARGET_COMMANDS = new Set([
  "check",
  "dblclick",
  "download",
  "fill",
  "focus",
  "highlight",
  "hover",
  "scrollintoview",
  "select",
  "tap",
  "type",
  "uncheck",
  "upload"
]);

export function normalizeAgentBrowserTarget(target: string): string {
  const trimmed = target.trim();
  return /^e\d+$/.test(trimmed) ? `@${trimmed}` : target;
}

function createAgentBrowserScreenshotArgs(args: ParsedCliArgs): string[] {
  const browserArgs = ["screenshot"];
  if (hasOption(args, "full-page")) {
    browserArgs.push("--full");
  }
  browserArgs.push(...args.command.slice(1));
  appendForwardedBrowserOptions(browserArgs, args);
  return browserArgs;
}

export function getOpenCommandSessionId(args: ParsedCliArgs): string {
  return getOptionValue(args, "session") ?? createOperationSessionId();
}

export function createBrowserCommandArgs(
  args: ParsedCliArgs,
  context: { sessionId?: string } = {}
): string[] {
  const command = args.command[0];
  if (command === "goto" || command === "navigate") {
    const browserArgs = [
      "goto",
      withDivebellSession(
        requireCommandArgument(args, 1, "URL"),
        getOptionValue(args, "session") ?? context.sessionId
      )
    ];
    appendForwardedBrowserOptions(browserArgs, args);
    return browserArgs;
  }
  if (command === "page-snapshot") {
    const browserArgs = ["snapshot"];
    appendForwardedBrowserOptions(browserArgs, args);
    return browserArgs;
  }
  if (command === "click") {
    const browserArgs = [
      "click",
      normalizeAgentBrowserTarget(requireCommandArgument(args, 1, "ref, selector, or text"))
    ];
    appendForwardedBrowserOptions(browserArgs, args);
    return browserArgs;
  }
  if (command === "fill") {
    const browserArgs = [
      "fill",
      normalizeAgentBrowserTarget(requireCommandArgument(args, 1, "ref or selector")),
      requireCommandArgument(args, 2, "value")
    ];
    appendForwardedBrowserOptions(browserArgs, args);
    return browserArgs;
  }
  if (command === "focus") {
    const browserArgs = [
      "focus",
      normalizeAgentBrowserTarget(requireCommandArgument(args, 1, "ref or selector"))
    ];
    appendForwardedBrowserOptions(browserArgs, args);
    return browserArgs;
  }
  if (command === "press") {
    const browserArgs = ["press", requireCommandArgument(args, 1, "key or shortcut")];
    appendForwardedBrowserOptions(browserArgs, args);
    return browserArgs;
  }
  if (command === "select") {
    const browserArgs = [
      "select",
      normalizeAgentBrowserTarget(requireCommandArgument(args, 1, "ref or selector")),
      ...args.command.slice(2)
    ];
    if (browserArgs.length < 3) requireCommandArgument(args, 2, "value or label");
    appendForwardedBrowserOptions(browserArgs, args);
    return browserArgs;
  }
  if (command === "eval") {
    const script = args.command[1];
    const base64 = getOptionValue(args, "base64");
    const browserArgs = script !== undefined
      ? ["eval", script]
      : base64 !== undefined
        ? ["eval", "--base64", base64]
        : ["eval", requireCommandArgument(args, 1, "eval script")];
    appendForwardedBrowserOptions(browserArgs, args);
    return browserArgs;
  }
  if (command === "screenshot") {
    return createAgentBrowserScreenshotArgs(args);
  }
  if (command === "coverage") {
    return createCoverageBrowserArgs(args);
  }
  if (command === "debug") {
    const browserArgs = ["debug", ...args.command.slice(1)];
    const cdpSession = getOptionValue(args, "cdp-session");
    if (cdpSession !== undefined) browserArgs.push("--session", cdpSession);
    appendForwardedBrowserOptions(browserArgs, args);
    return browserArgs;
  }
  if (command !== undefined) {
    const agentBrowserCommand = command === "video"
      ? "record"
      : command === "check-element"
        ? "check"
        : command;
    return createPassthroughBrowserArgs(args, agentBrowserCommand);
  }
  throw new Error(`Unsupported browser command "${command ?? ""}".`);
}

function createPassthroughBrowserArgs(args: ParsedCliArgs, command: string): string[] {
  const positionals = [...args.command.slice(1)];
  normalizePassthroughTargets(command, positionals);
  const browserArgs = [command, ...positionals];
  appendForwardedBrowserOptions(browserArgs, args);
  return browserArgs;
}

function normalizePassthroughTargets(command: string, positionals: string[]): void {
  if (FIRST_TARGET_COMMANDS.has(command) && positionals[0] !== undefined) {
    positionals[0] = normalizeAgentBrowserTarget(positionals[0]);
    return;
  }
  if (command === "drag") {
    if (positionals[0] !== undefined) positionals[0] = normalizeAgentBrowserTarget(positionals[0]);
    if (positionals[1] !== undefined) positionals[1] = normalizeAgentBrowserTarget(positionals[1]);
    return;
  }
  if (command === "wait" || command === "frame") {
    if (positionals[0] !== undefined) positionals[0] = normalizeAgentBrowserTarget(positionals[0]);
    return;
  }
  if ((command === "get" || command === "is") && positionals[1] !== undefined) {
    positionals[1] = normalizeAgentBrowserTarget(positionals[1]);
  }
}

function appendForwardedBrowserOptions(browserArgs: string[], args: ParsedCliArgs): void {
  for (const [name, values] of args.options) {
    if (DIVEBELL_ONLY_BROWSER_OPTIONS.has(name)) continue;
    for (const value of values) {
      browserArgs.push(`--${name}`);
      if (value !== "true") browserArgs.push(value);
    }
  }
}

function createCoverageBrowserArgs(args: ParsedCliArgs): string[] {
  const command = args.command.slice(1);
  const operation = command[0];
  const browserArgs = ["coverage"];

  if (["status", "cancel"].includes(operation ?? "") && command.length === 1) {
    browserArgs.push(operation as string);
  } else if (operation === "start" && command.length === 1) {
    browserArgs.push("start");
    if (hasOption(args, "call-count")) browserArgs.push("--call-count");
  } else if (["take", "stop"].includes(operation ?? "") && command.length <= 2) {
    browserArgs.push(operation as string, ...command.slice(1));
    const label = getOptionValue(args, "label");
    if (label !== undefined) browserArgs.push("--label", label);
    appendBrowserNumberOption(browserArgs, args, "max-size");
  } else {
    throw new Error("Invalid coverage command. Run `divebell --help` to see the supported forms.");
  }
  browserArgs.push("--json");
  return browserArgs;
}

function appendBrowserNumberOption(browserArgs: string[], args: ParsedCliArgs, name: string): void {
  const value = getOptionValue(args, name);
  if (value !== undefined) browserArgs.push(`--${name}`, value);
}

export function shouldPreferInteractiveTextClick(target: string): boolean {
  const trimmed = target.trim();
  if (trimmed.length === 0) return false;
  if (/^e\d+$/.test(trimmed)) return false;
  return !/^(css=|text=|role=|#|\[|\.|\w+\s*>)/.test(trimmed);
}
