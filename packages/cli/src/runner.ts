import { parseCliArgs } from "./utils/args.js";
import { createDefaultBrowserRunner } from "./features/browser/runner.js";
import { createDetachedBridgeStarter } from "./features/bridge/process.js";
import { createCommandHelpText, createHelpText } from "./commands/help.js";
import { createFileOperationLogStore } from "./utils/operation-log.js";
import { createError, writeErrorOutput } from "./utils/output.js";
import { runAgentBrowserAuthCommand, runAgentBrowserProfilesCommand, runAgentBrowserStateCommand } from "./commands/browser-auth.js";
import {
  runBridgeServerCommand,
  runStartCommand,
  runStopCommand
} from "./commands/bridge.js";
import { createBridgeStateStore } from "./features/bridge/config.js";
import { runBrowserCliCommand, runExtensionCloseHooks } from "./commands/browser.js";
import { isBrowserCommand } from "./commands/names.js";
import { runExtensionCliCommand } from "./commands/extension.js";
import { runRuntimeCliCommand } from "./commands/runtime.js";
import { runStackCommand } from "./commands/stack.js";
import { hasOption } from "./utils/command.js";
import { runExtensionsCommand } from "./commands/installed.js";
import { runCheckCommand } from "./commands/check.js";
import { createRemoteDebuggingPageOpener } from "./features/browser/remote-debugging.js";
import type {
  CliRunOptions,
  DivebellCliConfig
} from "./types/cli.js";

export async function runCliWithConfig(config: DivebellCliConfig, argv: string[], options: CliRunOptions): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const fetcher = options.fetcher ?? fetch;
  const env = options.env ?? process.env;
  const browserRunner = options.browserRunner ?? createDefaultBrowserRunner({ env });
  const bridgeStarter = options.bridgeStarter ?? createDetachedBridgeStarter(
    new URL("./bin.js", import.meta.url).href
  );
  const operationLogStore = createFileOperationLogStore(process.cwd(), options.operationLogDirectory);
  const args = parseCliArgs(argv);

  try {
    if (args.command.length === 0) {
      stdout.write(`${createHelpText({
        commandReferences: config.commandReferences,
        commandSkillReferences: config.commandSkillReferences
      })}\n`);
      return 0;
    }

    if (hasOption(args, "help")) {
      const helpText = createCommandHelpText(args.command, {
        commandReferences: config.commandReferences,
        commandSkillReferences: config.commandSkillReferences
      });
      if (helpText === undefined) {
        throw createError({
          code: "CLI_UNKNOWN_COMMAND",
          kind: "validation",
          message: `Unknown command "${args.command.join(" ")}".`,
          hint: "Run `divebell --help` to see available commands."
        });
      }
      stdout.write(`${helpText}\n`);
      return 0;
    }

    if (args.command[0] === "__bridge-server") {
      return await runBridgeServerCommand(args, stdout, options.waitUntilClosed);
    }

    if (args.command[0] === "check") {
      return await runCheckCommand({
        args,
        stdout,
        fetcher,
        browserRunner,
        bridgeStarter,
        ...(options.bridgeProcessController === undefined
          ? {}
          : { bridgeProcessController: options.bridgeProcessController }),
        remoteDebuggingPageOpener: options.remoteDebuggingPageOpener
          ?? createRemoteDebuggingPageOpener({ env }),
        ...(options.checkWaiter === undefined
          ? {}
          : { wait: options.checkWaiter }),
        env
      });
    }

    if (args.command[0] === "start") {
      return await runStartCommand(args, stdout, fetcher, bridgeStarter, createBridgeStateStore(args, options.bridgeStateDirectory));
    }

    if (args.command[0] === "stop") {
      return await runStopCommand(
        args,
        stdout,
        browserRunner,
        options.bridgeStateDirectory,
        operationLogStore,
        options.bridgeProcessController,
        async () => await runExtensionCloseHooks({
          args,
          stderr,
          fetcher,
          browserRunner,
          bridgeStarter,
          bridgeStateDirectory: options.bridgeStateDirectory,
          operationLogStore,
          extensions: config.extensions,
          openHookPlan: config.hookPlans.open
        })
      );
    }

    if (args.command[0] === "profiles") {
      return await runAgentBrowserProfilesCommand(args, stdout, stderr, browserRunner);
    }

    if (args.command[0] === "state") {
      return await runAgentBrowserStateCommand(args, stdout, stderr, browserRunner);
    }

    if (args.command[0] === "auth") {
      return await runAgentBrowserAuthCommand(args, stdout, stderr, options.stdin ?? process.stdin, browserRunner);
    }

    if (args.command[0] === "extensions") {
      return await runExtensionsCommand({
        args,
        stdout,
        ...(options.extensionsDirectory === undefined ? {} : { extensionsDirectory: options.extensionsDirectory }),
        ...(options.extensionPackageDownloader === undefined ? {} : { extensionPackageDownloader: options.extensionPackageDownloader })
      });
    }

    if (args.command[0] === "stack") {
      return await runStackCommand({
        args,
        stdout,
        stderr,
        fetcher,
        browserRunner,
        bridgeStarter,
        bridgeStateDirectory: options.bridgeStateDirectory,
        operationLogStore,
        extensions: config.extensions,
        detectStackHookPlan: config.hookPlans.detectStack
      });
    }

    if (isBrowserCommand(args.command[0])) {
      return await runBrowserCliCommand(
        args,
        stdout,
        stderr,
        fetcher,
        browserRunner,
        bridgeStarter,
        options.bridgeStateDirectory,
        operationLogStore,
        config.extensions,
        config.hookPlans.open
      );
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
        hint: "Run `divebell --help` to see available commands."
      });
    }

    const extensionExitCode = await runExtensionCliCommand({
      args,
      stdout,
      fetcher,
      browserRunner,
      bridgeStarter,
      bridgeStateDirectory: options.bridgeStateDirectory,
      operationLogStore,
      extensionRegistry: config.extensionRegistry,
      commandRegistry: config.commandRegistry
    });
    if (extensionExitCode !== undefined) {
      return extensionExitCode;
    }

    throw createError({
      code: "CLI_UNKNOWN_COMMAND",
      kind: "validation",
      message: `Unknown command "${args.command.join(" ")}".`,
      hint: "Run `divebell --help` to see available commands."
    });
  } catch (error) {
    writeErrorOutput(stdout, args.command.join(" ") || "divebell", error);
    return 1;
  }
}
