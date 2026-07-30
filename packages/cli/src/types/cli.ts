import type { BridgeServer } from "@divebell/bridge";
import type { DivebellPackageInfo } from "@divebell/core";
import type { BrowserRunner } from "../features/browser/runner.js";
import type { RemoteDebuggingPageOpener } from "../features/browser/remote-debugging.js";
import type { BridgeProcessController, BridgeStarter } from "../features/bridge/process.js";
import type { Fetcher } from "../features/runtime/client.js";
import type {
  CliExtensionRunFunction,
  CliExtensionLoadingFunction,
  CliExtensionRunOptionScalar,
  CliExtensionRunOptionValue,
  CliExtensionRunRequest,
  CliCommandReference,
  CliCommandSkillReference,
  ExtensionLoadRecord,
  DivebellExtensionCommand,
  DivebellExtensionDefinition
} from "./commands.js";
import type { CliOperationLogStore, ParsedCliArgs } from "./shared.js";
import type { ExtensionPackageDownloader } from "../commands/installed.js";
import type { ExtensionHookPlans } from "../features/extension/plan.js";

export type {
  CliExtensionPageContext,
  CliExtensionRunFunction,
  CliExtensionLoadingFunction,
  CliExtensionRunOptionScalar,
  CliExtensionRunOptionValue,
  CliExtensionRunRequest,
  CliExtensionRunOptions,
  DivebellExtensionCommand,
  DivebellExtensionDefinition
} from "./commands.js";

export interface CliRunOptions {
  stdout?: {
    write(chunk: string): void;
  };
  stderr?: {
    isTTY?: boolean;
    write(chunk: string): void;
  };
  stdin?: AsyncIterable<string | Uint8Array>;
  env?: NodeJS.ProcessEnv;
  fetcher?: Fetcher;
  browserRunner?: BrowserRunner;
  remoteDebuggingPageOpener?: RemoteDebuggingPageOpener;
  setupWaiter?: (milliseconds: number) => Promise<void>;
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

export interface CreateDivebellCliOptions {
  packageInfo?: DivebellPackageInfo;
  extensions?: readonly DivebellExtensionDefinition[];
  extensionLoadRecords?: readonly ExtensionLoadRecord[];
}

export interface DivebellCli {
  packageInfo: DivebellPackageInfo;
  extensions: readonly DivebellExtensionDefinition[];
  run(argv?: string[], options?: CliRunOptions): Promise<number>;
  createHelpText(): string;
  getCommandReferences(): CliCommandReference[];
}

export interface DivebellCliWithExternalExtensions {
  cli: DivebellCli;
  extensionLoadRecords: readonly ExtensionLoadRecord[];
}

export interface DivebellCliConfig {
  commandReferences: readonly CliCommandReference[];
  commandSkillReferences: readonly CliCommandSkillReference[];
  extensions: readonly DivebellExtensionDefinition[];
  hookPlans: ExtensionHookPlans;
  extensionRegistry: Map<string, DivebellExtensionDefinition>;
  commandRegistry: Map<string, {
    extension: DivebellExtensionDefinition;
    command: DivebellExtensionCommand;
  }>;
  extensionLoadRecords: readonly ExtensionLoadRecord[];
}
