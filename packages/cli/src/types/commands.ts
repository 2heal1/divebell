import type { BrowserRunner } from "../features/browser/types.js";
import type { BridgeStarter } from "../features/bridge/types.js";
import type { OpenRuntimeExtensionApi } from "../features/extension/types.js";
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

export interface CliExtensionRunOptions {
  args: ParsedCliArgs;
  fetcher: Fetcher;
  page?: CliExtensionPageContext;
  headers?: Readonly<Record<string, string>>;
  openruntime: OpenRuntimeExtensionApi;
  runExtension: CliExtensionRunFunction;
}

export interface OpenRuntimeExtensionCommand {
  name: string;
  requires?: readonly string[];
  requiresOpenHook?: boolean;
  skill?: OpenRuntimeCommandSkill;
  commandReferences?: readonly CliCommandReference[];
  run(options: CliExtensionRunOptions): Promise<unknown>;
}

export interface OpenRuntimeOpenHookOptions {
  args: ParsedCliArgs;
  url: string;
  openedUrl: string;
  headers?: Readonly<Record<string, string>>;
}

export interface OpenRuntimeOpenHookResult {
  scripts?: readonly string[];
}

export interface OpenRuntimePageHookOptions {
  args: ParsedCliArgs;
  page: CliExtensionPageContext;
  openruntime: OpenRuntimeExtensionApi;
}

export interface OpenRuntimeStackDetection {
  id: string;
  name: string;
  version?: string;
  evidence?: readonly string[];
  recommendedExtensions?: readonly string[];
}

export interface OpenRuntimeOrderedHook<Handler> {
  run: Handler;
  before?: readonly string[];
  after?: readonly string[];
  requires?: readonly string[];
}

export type OpenRuntimeOpenHook = (
  options: OpenRuntimeOpenHookOptions
) => Promise<OpenRuntimeOpenHookResult | void>;

export type OpenRuntimeDetectStackHook = (
  options: OpenRuntimePageHookOptions
) => Promise<OpenRuntimeStackDetection | readonly OpenRuntimeStackDetection[] | void>;

export type OpenRuntimeCloseHook = (
  options: OpenRuntimePageHookOptions
) => Promise<void>;

export interface OpenRuntimeExtensionHooks {
  open?: OpenRuntimeOpenHook | OpenRuntimeOrderedHook<OpenRuntimeOpenHook>;
  detectStack?: OpenRuntimeDetectStackHook | OpenRuntimeOrderedHook<OpenRuntimeDetectStackHook>;
  close?: OpenRuntimeCloseHook;
}

export interface OpenRuntimeExtensionDefinition {
  schemaVersion: 1;
  name: string;
  displayName?: string;
  description?: string;
  commands?: readonly OpenRuntimeExtensionCommand[];
  hooks?: OpenRuntimeExtensionHooks;
}

export interface ExtensionCliCommandOptions {
  args: ParsedCliArgs;
  stdout: { write(chunk: string): void };
  fetcher: Fetcher;
  browserRunner: BrowserRunner;
  bridgeStarter: BridgeStarter;
  bridgeStateDirectory: string | undefined;
  operationLogStore: CliOperationLogStore;
  extensionRegistry: Map<string, OpenRuntimeExtensionDefinition>;
  commandRegistry: Map<string, {
    extension: OpenRuntimeExtensionDefinition;
    command: OpenRuntimeExtensionCommand;
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


export interface OpenRuntimeCommandSkill {
  path: string;
}


export interface ExternalExtensionLoadResult {
  extensions: OpenRuntimeExtensionDefinition[];
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
  | "page-snapshot"
  | "click"
  | "fill"
  | "eval"
  | "wait-eval"
  | "get-window"
  | "screenshot"
  | "network"
  | "console"
  | "memory"
  | "coverage";

export type RuntimeResourceCommandName = "targets" | "snapshot" | "events" | "actions";
