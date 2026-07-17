import type { BrowserCommandName, RuntimeResourceCommandName } from "../types/commands.js";
export type { BrowserCommandName, RuntimeResourceCommandName } from "../types/commands.js";

export const BROWSER_COMMAND_NAMES: readonly BrowserCommandName[] = [
  "open",
  "goto",
  "page-snapshot",
  "click",
  "fill",
  "eval",
  "wait-eval",
  "get-window",
  "screenshot",
  "network",
  "console",
  "memory",
  "coverage",
  "close"
];

export const RUNTIME_RESOURCE_COMMAND_NAMES: readonly RuntimeResourceCommandName[] = [
  "targets",
  "snapshot",
  "events",
  "actions"
];

export function createBuiltInCommandNameSet(): Set<string> {
  return new Set([
    "__bridge-server",
    "start",
    "stop",
    "auth",
    "record",
    "code-usage",
    "runtimes",
    "input-options",
    "run-action",
    "verify",
    "wait-for",
    ...BROWSER_COMMAND_NAMES,
    ...RUNTIME_RESOURCE_COMMAND_NAMES
  ]);
}

export function isBrowserCommand(command: string | undefined): command is BrowserCommandName {
  return BROWSER_COMMAND_NAMES.includes(command as BrowserCommandName);
}

export function isBrowserPageCommand(command: string | undefined): command is BrowserCommandName {
  return isBrowserCommand(command) && command !== "open" && command !== "goto" && command !== "close";
}

export function isRuntimeResourceCommand(command: string | undefined): command is RuntimeResourceCommandName {
  return RUNTIME_RESOURCE_COMMAND_NAMES.includes(command as RuntimeResourceCommandName);
}
