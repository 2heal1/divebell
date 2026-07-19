import type { BridgeServer } from "@openruntime/bridge";
import type { OpenRuntimePackageInfo } from "@openruntime/core";
import type { AuthStateApplier } from "../features/auth/profile.js";
import type { BrowserRunner } from "../features/browser/runner.js";
import type { BridgeProcessController, BridgeStarter } from "../features/bridge/process.js";
import type { Fetcher } from "../features/runtime/client.js";
import type {
  CliCommandReference,
  CliCommandSkillReference,
  ExtensionLoadRecord,
  OpenRuntimeCliExtension
} from "./commands.js";
import type { exportAuthProfileWithConnector } from "../features/auth/connector/index.js";
import type { CliOperationLogStore, ParsedCliArgs } from "./shared.js";
import type { CommandPackageDownloader } from "../commands/installed.js";

export type {
  CliExtensionPageContext,
  CliExtensionRunOptions,
  OpenRuntimeCliExtension
} from "./commands.js";

export interface CliRunOptions {
  stdout?: {
    write(chunk: string): void;
  };
  stderr?: {
    write(chunk: string): void;
  };
  fetcher?: Fetcher;
  browserRunner?: BrowserRunner;
  bridgeStarter?: BridgeStarter;
  bridgeProcessController?: BridgeProcessController;
  bridgeStateDirectory?: string;
  operationLogDirectory?: string;
  waitUntilClosed?: (server: BridgeServer) => Promise<void>;
  authConnectorExporter?: typeof exportAuthProfileWithConnector;
  authStateApplier?: AuthStateApplier;
  commandsDirectory?: string;
  commandPackageDownloader?: CommandPackageDownloader;
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
  extensions?: readonly OpenRuntimeCliExtension[];
  extensionLoadRecords?: readonly ExtensionLoadRecord[];
}

export interface OpenRuntimeCli {
  packageInfo: OpenRuntimePackageInfo;
  extensions: readonly OpenRuntimeCliExtension[];
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
  extensionRegistry: Map<string, OpenRuntimeCliExtension>;
  extensionLoadRecords: readonly ExtensionLoadRecord[];
}
