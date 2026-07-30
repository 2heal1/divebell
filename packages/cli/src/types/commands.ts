import type { BrowserRunner } from "../features/browser/types.js";
import type { BridgeStarter } from "../features/bridge/types.js";
import type { DivebellExtensionApi } from "../features/extension/types.js";
import type { Fetcher } from "../features/runtime/types.js";
import type {
  CliOperationLogStore,
  ParsedCliArgs
} from "./shared.js";

export interface CliExtensionPageContext {
  url: string;
  openedUrl: string;
  normalizedUrl: string;
  bridgeUrl: string | null;
  sessionId: string | null;
  openedAt: number;
}

export type CliExtensionRunOptionScalar = string | number | boolean;

export type CliExtensionRunOptionValue =
  | CliExtensionRunOptionScalar
  | readonly CliExtensionRunOptionScalar[];

export interface CliExtensionRunRequest {
  command: string;
  args?: readonly string[];
  options?: Readonly<Record<string, CliExtensionRunOptionValue>>;
}

export interface CliExtensionRunFunction {
  <T = unknown>(extensionName: string, request: CliExtensionRunRequest): Promise<T>;
}

export interface CliExtensionLoadingFunction {
  <T>(run: () => T | PromiseLike<T>): Promise<T>;
}

export interface CliExtensionRunOptions {
  args: ParsedCliArgs;
  fetcher: Fetcher;
  page?: CliExtensionPageContext;
  headers?: Readonly<Record<string, string>>;
  divebell: DivebellExtensionApi;
  runExtension: CliExtensionRunFunction;
  withLoading: CliExtensionLoadingFunction;
}

export interface DivebellExtensionCommand {
  name: string;
  requiresOpenHook?: boolean;
  skill?: DivebellCommandSkill;
  commandReferences?: readonly CliCommandReference[];
  run(options: CliExtensionRunOptions): Promise<unknown>;
}

export interface DivebellOpenHookOptions {
  args: ParsedCliArgs;
  url: string;
  openedUrl: string;
  bridgeUrl: string | null;
  headers?: Readonly<Record<string, string>>;
}

export interface DivebellOpenHookCompanionPage {
  url: string;
  label?: string;
  waitFor?: {
    script: string;
    timeout?: number;
  };
}

export interface DivebellOpenHookResult {
  openedUrl?: string;
  scripts?: readonly string[];
  companionPages?: readonly DivebellOpenHookCompanionPage[];
}

export interface DivebellPageHookOptions {
  args: ParsedCliArgs;
  page: CliExtensionPageContext;
  divebell: DivebellExtensionApi;
}

export interface DivebellStackDetection {
  id: string;
  name: string;
  version?: string;
  evidence?: readonly string[];
  command?: string;
}

export interface DivebellOrderedHook<Handler> {
  run: Handler;
  before?: readonly string[];
  after?: readonly string[];
}

export type DivebellOpenHook = (
  options: DivebellOpenHookOptions
) => Promise<DivebellOpenHookResult | void>;

export type DivebellDetectStackHook = (
  options: DivebellPageHookOptions
) => Promise<DivebellStackDetection | readonly DivebellStackDetection[] | void>;

export type DivebellCloseHook = (
  options: DivebellPageHookOptions
) => Promise<void>;

export interface DivebellExtensionHooks {
  open?: DivebellOpenHook | DivebellOrderedHook<DivebellOpenHook>;
  detectStack?: DivebellDetectStackHook | DivebellOrderedHook<DivebellDetectStackHook>;
  close?: DivebellCloseHook;
}

export interface DivebellExtensionDefinition {
  schemaVersion: 1;
  name: string;
  requires?: readonly string[];
  displayName?: string;
  description?: string;
  commands?: readonly DivebellExtensionCommand[];
  hooks?: DivebellExtensionHooks;
}

export interface ExtensionCliCommandOptions {
  args: ParsedCliArgs;
  stdout: { write(chunk: string): void };
  stderr: {
    isTTY?: boolean;
    write(chunk: string): void;
  };
  fetcher: Fetcher;
  browserRunner: BrowserRunner;
  bridgeStarter: BridgeStarter;
  bridgeStateDirectory: string | undefined;
  operationLogStore: CliOperationLogStore;
  extensionRegistry: Map<string, DivebellExtensionDefinition>;
  commandRegistry: Map<string, {
    extension: DivebellExtensionDefinition;
    command: DivebellExtensionCommand;
  }>;
}

export interface ExtensionLoadRecord {
  name: string;
  source: "internal" | "external";
  status: "loaded" | "skipped" | "failed";
  path?: string;
  reason?: string;
}

export interface ValidateExtensionOptions {
  path?: string;
}


export interface DivebellCommandSkill {
  path: string;
}


export interface ExternalExtensionLoadResult {
  extensions: DivebellExtensionDefinition[];
  records: ExtensionLoadRecord[];
}

export interface ExternalExtensionModule {
  default?: unknown;
}

export interface ExternalExtensionCandidate {
  path: string;
}


export interface CliCommandReference {
  category: "Bridge and Browser" | "Runtime" | "Extensions" | "External Extensions";
  usage: string;
  description: string;
}


export interface CliCommandSkillReference {
  category: "Extensions" | "External Extensions";
  command: string;
}

export interface CliReferenceCollection {
  commandReferences?: readonly CliCommandReference[];
  commandSkillReferences?: readonly CliCommandSkillReference[];
}


export type BrowserCommandName =
  | "open"
  | "goto"
  | "navigate"
  | "page-snapshot"
  | "read"
  | "click"
  | "dblclick"
  | "type"
  | "fill"
  | "keyboard"
  | "keydown"
  | "keyup"
  | "hover"
  | "tap"
  | "swipe"
  | "focus"
  | "press"
  | "check-element"
  | "uncheck"
  | "select"
  | "drag"
  | "upload"
  | "download"
  | "scroll"
  | "scrollintoview"
  | "wait"
  | "eval"
  | "wait-eval"
  | "get-window"
  | "screenshot"
  | "pdf"
  | "back"
  | "forward"
  | "reload"
  | "pushstate"
  | "get"
  | "is"
  | "find"
  | "mouse"
  | "set"
  | "device"
  | "cookies"
  | "storage"
  | "tab"
  | "window"
  | "frame"
  | "dialog"
  | "diff"
  | "network"
  | "console"
  | "errors"
  | "highlight"
  | "trace"
  | "profiler"
  | "video"
  | "inspect"
  | "clipboard"
  | "stream"
  | "react"
  | "vitals"
  | "a11y"
  | "addinitscript"
  | "removeinitscript"
  | "confirm"
  | "deny"
  | "memory"
  | "coverage";

export type RuntimeResourceCommandName = "targets" | "snapshot" | "events" | "actions";
