import { getOptionValue, type ParsedCliArgs } from "../../utils/args.js";
import { createOperationSessionId } from "../../utils/operation-log.js";
import { hasOption, requireCommandArgument } from "../../utils/command.js";
import { withOpenRuntimeSession } from "../../utils/url.js";
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
  return browserArgs;
}

export function getOpenCommandSessionId(args: ParsedCliArgs): string {
  return getOptionValue(args, "session") ?? createOperationSessionId();
}

export function createBrowserCommandArgs(args: ParsedCliArgs): string[] {
  const command = args.command[0];
  if (command === "goto") {
    return ["goto", withOpenRuntimeSession(requireCommandArgument(args, 1, "URL"), getOptionValue(args, "session"))];
  }
  if (command === "page-snapshot") {
    return ["snapshot"];
  }
  if (command === "click") {
    return ["click", normalizeAgentBrowserTarget(requireCommandArgument(args, 1, "ref, selector, or text"))];
  }
  if (command === "fill") {
    return [
      "fill",
      normalizeAgentBrowserTarget(requireCommandArgument(args, 1, "ref or selector")),
      requireCommandArgument(args, 2, "value")
    ];
  }
  if (command === "eval") {
    return ["eval", requireCommandArgument(args, 1, "eval script")];
  }
  if (command === "screenshot") {
    return createAgentBrowserScreenshotArgs(args);
  }
  if (command === "coverage") {
    return createCoverageBrowserArgs(args);
  }
  return ["close"];
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
    throw new Error("Invalid coverage command. Run `openruntime --help` to see the supported forms.");
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
