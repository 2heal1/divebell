import type { BrowserRunner } from "../features/browser/types.js";
import type { BridgeStarter } from "../features/bridge/types.js";
import type { OpenRuntimeExtensionApi } from "../features/extension/types.js";
import type { Fetcher } from "../features/runtime/types.js";
import type {
  CliOperationLogStore,
  CommandOutput,
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
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
  fetcher: Fetcher;
  page?: CliExtensionPageContext;
  openruntime: OpenRuntimeExtensionApi;
  output: CommandOutput;
}

export interface OpenRuntimeCliExtension {
  name: string;
  skill?: OpenRuntimeCommandSkill;
  commandReferences?: readonly CliCommandReference[];
  run(options: CliExtensionRunOptions): Promise<number>;
}

export interface ExtensionCliCommandOptions {
  args: ParsedCliArgs;
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
  fetcher: Fetcher;
  browserRunner: BrowserRunner;
  bridgeStarter: BridgeStarter;
  bridgeStateDirectory: string | undefined;
  operationLogStore: CliOperationLogStore;
  extensionRegistry: Map<string, OpenRuntimeCliExtension>;
}

export interface ExtensionLoadRecord {
  name: string;
  source: "internal" | "external";
  status: "loaded" | "skipped" | "failed";
  path?: string;
  reason?: string;
}

export interface OpenRuntimeCommandDefinition {
  schemaVersion: 1;
  name: string;
  displayName?: string;
  description?: string;
  skill?: OpenRuntimeCommandSkill;
  commandReferences?: readonly CliCommandReference[];
  run(options: CliExtensionRunOptions): Promise<number>;
}

export interface ValidateCommandOptions {
  path?: string;
}


export interface OpenRuntimeCommandSkill {
  path: string;
}


export interface ExternalExtensionLoadResult {
  extensions: OpenRuntimeCliExtension[];
  records: ExtensionLoadRecord[];
}

export interface ExternalExtensionModule {
  default?: unknown;
}

export interface ExternalExtensionCandidate {
  path: string;
}


export interface CliCommandReference {
  category: "Bridge and Browser" | "Runtime" | "Commands" | "External Commands";
  usage: string;
  description: string;
}


export interface CliCommandSkillReference {
  category: "Commands" | "External Commands";
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
  | "coverage"
  | "close";

export type RuntimeResourceCommandName = "targets" | "snapshot" | "events" | "actions";
