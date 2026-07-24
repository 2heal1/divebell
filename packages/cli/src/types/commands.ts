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

export interface CliExtensionRunOptions {
  args: ParsedCliArgs;
  fetcher: Fetcher;
  page?: CliExtensionPageContext;
  openruntime: OpenRuntimeExtensionApi;
}

export interface OpenRuntimeExtensionCommand {
  name: string;
  skill?: OpenRuntimeCommandSkill;
  commandReferences?: readonly CliCommandReference[];
  run(options: CliExtensionRunOptions): Promise<unknown>;
}

export interface OpenRuntimeOpenHookOptions {
  args: ParsedCliArgs;
  url: string;
  openedUrl: string;
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

export interface OpenRuntimeExtensionHooks {
  open?(options: OpenRuntimeOpenHookOptions): Promise<OpenRuntimeOpenHookResult | void>;
  detectStack?(
    options: OpenRuntimePageHookOptions
  ): Promise<OpenRuntimeStackDetection | readonly OpenRuntimeStackDetection[] | void>;
  close?(options: OpenRuntimePageHookOptions): Promise<void>;
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
