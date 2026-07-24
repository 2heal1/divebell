import type { BridgeServer } from "@openruntime/bridge";
import type { OpenRuntimePackageInfo } from "@openruntime/core";
import type { BrowserRunner } from "../features/browser/runner.js";
import type { BridgeProcessController, BridgeStarter } from "../features/bridge/process.js";
import type { Fetcher } from "../features/runtime/client.js";
import type {
  CliCommandReference,
  CliCommandSkillReference,
  ExtensionLoadRecord,
  OpenRuntimeExtensionCommand,
  OpenRuntimeExtensionDefinition
} from "./commands.js";
import type { CliOperationLogStore, ParsedCliArgs } from "./shared.js";
import type { ExtensionPackageDownloader } from "../commands/installed.js";

export type {
  CliExtensionPageContext,
  CliExtensionRunOptions,
  OpenRuntimeExtensionCommand,
  OpenRuntimeExtensionContext,
  OpenRuntimeExtensionContextValue,
  OpenRuntimeExtensionDefinition
} from "./commands.js";

export interface CliRunOptions {
  stdout?: {
    write(chunk: string): void;
  };
  stderr?: {
    write(chunk: string): void;
  };
  stdin?: AsyncIterable<string | Uint8Array>;
  fetcher?: Fetcher;
  browserRunner?: BrowserRunner;
  bridgeStarter?: BridgeStarter;
  bridgeProcessController?: BridgeProcessController;
  bridgeStateDirectory?: string;
  operationLogDirectory?: string;
  waitUntilClosed?: (server: BridgeServer) => Promise<void>;
  extensionsDirectory?: string;
  extensionPackageDownloader?: ExtensionPackageDownloader;
}

export interface RuntimeCliCommandOptions {
  args: ParsedCliArgs;
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
  fetcher: Fetcher;
  browserRunner: BrowserRunner;
  bridgeStarter: BridgeStarter;
  bridgeStateDirectory: string | undefined;
  operationLogStore: CliOperationLogStore;
}

export interface CreateOpenRuntimeCliOptions {
  packageInfo?: OpenRuntimePackageInfo;
  extensions?: readonly OpenRuntimeExtensionDefinition[];
  extensionLoadRecords?: readonly ExtensionLoadRecord[];
}

export interface OpenRuntimeCli {
  packageInfo: OpenRuntimePackageInfo;
  extensions: readonly OpenRuntimeExtensionDefinition[];
  run(argv?: string[], options?: CliRunOptions): Promise<number>;
  createHelpText(): string;
  getCommandReferences(): CliCommandReference[];
}

export interface OpenRuntimeCliWithExternalExtensions {
  cli: OpenRuntimeCli;
  extensionLoadRecords: readonly ExtensionLoadRecord[];
}

export interface OpenRuntimeCliConfig {
  commandReferences: readonly CliCommandReference[];
  commandSkillReferences: readonly CliCommandSkillReference[];
  extensions: readonly OpenRuntimeExtensionDefinition[];
  commandRegistry: Map<string, {
    extension: OpenRuntimeExtensionDefinition;
    command: OpenRuntimeExtensionCommand;
  }>;
  extensionLoadRecords: readonly ExtensionLoadRecord[];
}
