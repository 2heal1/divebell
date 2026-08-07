import type { BrowserCommandName, RuntimeResourceCommandName } from "../types/commands.js";
export type { BrowserCommandName, RuntimeResourceCommandName } from "../types/commands.js";

export const BROWSER_COMMAND_NAMES: readonly BrowserCommandName[] = [
  "open",
  "goto",
  "navigate",
  "page-snapshot",
  "read",
  "click",
  "dblclick",
  "type",
  "fill",
  "keyboard",
  "keydown",
  "keyup",
  "hover",
  "tap",
  "swipe",
  "focus",
  "press",
  "check-element",
  "uncheck",
  "select",
  "drag",
  "upload",
  "download",
  "scroll",
  "scrollintoview",
  "wait",
  "eval",
  "wait-eval",
  "get-window",
  "screenshot",
  "pdf",
  "back",
  "forward",
  "reload",
  "pushstate",
  "get",
  "is",
  "find",
  "mouse",
  "set",
  "device",
  "cookies",
  "storage",
  "tab",
  "window",
  "frame",
  "dialog",
  "diff",
  "network",
  "console",
  "errors",
  "highlight",
  "trace",
  "profiler",
  "video",
  "inspect",
  "clipboard",
  "stream",
  "react",
  "vitals",
  "a11y",
  "addinitscript",
  "removeinitscript",
  "confirm",
  "deny",
  "coverage"
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
    "setup",
    "start",
    "stop",
    "auth",
    "profiles",
    "state",
    "extensions",
    "stack",
    "runtimes",
    "run-action",
    "wait-for",
    "ps",
    "kill",
    "kill-all",
    ...BROWSER_COMMAND_NAMES,
    ...RUNTIME_RESOURCE_COMMAND_NAMES
  ]);
}

export function isBrowserCommand(command: string | undefined): command is BrowserCommandName {
  return BROWSER_COMMAND_NAMES.includes(command as BrowserCommandName);
}

export function isBrowserPageCommand(command: string | undefined): command is BrowserCommandName {
  return isBrowserCommand(command) && command !== "open";
}

export function isRuntimeResourceCommand(command: string | undefined): command is RuntimeResourceCommandName {
  return RUNTIME_RESOURCE_COMMAND_NAMES.includes(command as RuntimeResourceCommandName);
}
