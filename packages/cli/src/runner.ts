import { parseCliArgs } from "./utils/args.js";
import { exportAuthProfileWithConnector } from "./features/auth/connector/index.js";
import { createDefaultBrowserRunner } from "./features/browser/runner.js";
import { createDetachedBridgeStarter } from "./features/bridge/process.js";
import { createHelpText } from "./commands/help.js";
import { createFileOperationLogStore } from "./utils/operation-log.js";
import { createError, writeErrorOutput } from "./utils/output.js";
import { runAuthCommand } from "./commands/auth.js";
import {
  runBridgeServerCommand,
  runStartCommand,
  runStopCommand
} from "./commands/bridge.js";
import { createBridgeStateStore } from "./features/bridge/config.js";
import { runBrowserCliCommand } from "./commands/browser.js";
import { isBrowserCommand } from "./commands/names.js";
import { runExtensionCliCommand } from "./commands/extension.js";
import { runRuntimeCliCommand } from "./commands/runtime.js";
import { hasOption } from "./utils/command.js";
import { runCommandsCommand } from "./commands/installed.js";
import type {
  CliRunOptions,
  OpenRuntimeCliConfig
} from "./types/cli.js";

export async function runCliWithConfig(config: OpenRuntimeCliConfig, argv: string[], options: CliRunOptions): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const fetcher = options.fetcher ?? fetch;
  const browserRunner = options.browserRunner ?? createDefaultBrowserRunner();
  const bridgeStarter = options.bridgeStarter ?? createDetachedBridgeStarter(import.meta.url);
  const operationLogStore = createFileOperationLogStore(process.cwd(), options.operationLogDirectory);
  const args = parseCliArgs(argv);

  try {
    if (args.command.length === 0 || hasOption(args, "help")) {
      stdout.write(`${createHelpText({
        commandReferences: config.commandReferences,
        commandSkillReferences: config.commandSkillReferences
      })}\n`);
      return 0;
    }

    if (args.command[0] === "__bridge-server") {
      return await runBridgeServerCommand(args, stdout, options.waitUntilClosed);
    }

    if (args.command[0] === "start") {
      return await runStartCommand(args, stdout, fetcher, bridgeStarter, createBridgeStateStore(args, options.bridgeStateDirectory));
    }

    if (args.command[0] === "stop") {
      return await runStopCommand(args, stdout, browserRunner, createBridgeStateStore(args, options.bridgeStateDirectory), operationLogStore, options.bridgeProcessController);
    }

    if (args.command[0] === "auth") {
      return await runAuthCommand(args, stdout, browserRunner, options.authConnectorExporter ?? exportAuthProfileWithConnector, options.authStateApplier);
    }

    if (args.command[0] === "commands") {
      return await runCommandsCommand({
        args,
        stdout,
        ...(options.commandsDirectory === undefined ? {} : { commandsDirectory: options.commandsDirectory }),
        ...(options.commandPackageDownloader === undefined ? {} : { commandPackageDownloader: options.commandPackageDownloader })
      });
    }

    if (isBrowserCommand(args.command[0])) {
      return await runBrowserCliCommand(args, stdout, stderr, fetcher, browserRunner, bridgeStarter, createBridgeStateStore(args, options.bridgeStateDirectory), operationLogStore);
    }

    const runtimeExitCode = await runRuntimeCliCommand({
      args,
      stdout,
      stderr,
      fetcher,
      browserRunner,
      bridgeStarter,
      bridgeStateDirectory: options.bridgeStateDirectory,
      operationLogStore
    });
    if (runtimeExitCode !== undefined) {
      return runtimeExitCode;
    }

    const command = args.command[0];
    if (command === undefined) {
      throw createError({
        code: "CLI_COMMAND_MISSING",
        kind: "validation",
        message: "Missing command.",
        hint: "Run `openruntime --help` to see available commands."
      });
    }

    const extensionExitCode = await runExtensionCliCommand({
      args,
      stdout,
      stderr,
      fetcher,
      browserRunner,
      bridgeStarter,
      bridgeStateDirectory: options.bridgeStateDirectory,
      operationLogStore,
      extensionRegistry: config.extensionRegistry
    });
    if (extensionExitCode !== undefined) {
      return extensionExitCode;
    }

    throw createError({
      code: "CLI_UNKNOWN_COMMAND",
      kind: "validation",
      message: `Unknown command "${args.command.join(" ")}".`,
      hint: "Run `openruntime --help` to see available commands."
    });
  } catch (error) {
    writeErrorOutput(stdout, args.command.join(" ") || "openruntime", error);
    return 1;
  }
}
