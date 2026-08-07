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
import { runKillAllCommand, runKillCommand, runPsCommand } from "./commands/daemon.js";
import { runRuntimeCliCommand } from "./commands/runtime.js";
import { runStackCommand } from "./commands/stack.js";
import { hasOption } from "./utils/command.js";
import { runExtensionsCommand } from "./commands/installed.js";
import { runSetupCommand } from "./commands/setup.js";
import { createRemoteDebuggingPageOpener } from "./features/browser/remote-debugging.js";
import { CLI_VERSION, isCliVersionRequest } from "./version.js";
import { createLoadingController, type LoadingController } from "./features/loading.js";
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
    if (isCliVersionRequest(args)) {
      stdout.write(`${CLI_VERSION}\n`);
      return 0;
    }

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

    const loading = createLoadingController(stderr);
    const commandStdout = createLoadingAwareWriter(stdout, loading);
    const commandStderr = createLoadingAwareWriter(stderr, loading);
    return await loading.withLoading(async () => {
      if (args.command[0] === "__bridge-server") {
        return await runBridgeServerCommand(args, commandStdout, options.waitUntilClosed);
      }

      if (args.command[0] === "setup") {
        return await runSetupCommand({
          args,
          stdout: commandStdout,
          fetcher,
          browserRunner,
          bridgeStarter,
          ...(options.bridgeProcessController === undefined
            ? {}
            : { bridgeProcessController: options.bridgeProcessController }),
          remoteDebuggingPageOpener: options.remoteDebuggingPageOpener
            ?? createRemoteDebuggingPageOpener({ env }),
          ...(options.setupWaiter === undefined
            ? {}
            : { wait: options.setupWaiter }),
          env
        });
      }

      if (args.command[0] === "start") {
        return await runStartCommand(args, commandStdout, fetcher, bridgeStarter, createBridgeStateStore(args, options.bridgeStateDirectory));
      }

      if (args.command[0] === "stop") {
        return await runStopCommand(
          args,
          commandStdout,
          browserRunner,
          options.bridgeStateDirectory,
          operationLogStore,
          options.bridgeProcessController,
          async () => await runExtensionCloseHooks({
            args,
            stderr: commandStderr,
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

      if (args.command[0] === "ps") {
        return await runPsCommand({
          args,
          stdout: commandStdout,
          ...(options.bridgeStateDirectory === undefined
            ? {}
            : { stateDirectory: options.bridgeStateDirectory }),
          ...(options.bridgeProcessController === undefined
            ? {}
            : { processController: options.bridgeProcessController })
        });
      }

      if (args.command[0] === "kill") {
        return await runKillCommand({
          args,
          stdout: commandStdout,
          stderr: commandStderr,
          ...(options.bridgeStateDirectory === undefined
            ? {}
            : { stateDirectory: options.bridgeStateDirectory }),
          ...(options.bridgeProcessController === undefined
            ? {}
            : { processController: options.bridgeProcessController })
        });
      }

      if (args.command[0] === "kill-all") {
        return await runKillAllCommand({
          args,
          stdout: commandStdout,
          ...(options.bridgeStateDirectory === undefined
            ? {}
            : { stateDirectory: options.bridgeStateDirectory }),
          ...(options.bridgeProcessController === undefined
            ? {}
            : { processController: options.bridgeProcessController })
        });
      }

      if (args.command[0] === "profiles") {
        return await runAgentBrowserProfilesCommand(args, commandStdout, commandStderr, browserRunner);
      }

      if (args.command[0] === "state") {
        return await runAgentBrowserStateCommand(args, commandStdout, commandStderr, browserRunner);
      }

      if (args.command[0] === "auth") {
        return await runAgentBrowserAuthCommand(args, commandStdout, commandStderr, options.stdin ?? process.stdin, browserRunner);
      }

      if (args.command[0] === "extensions") {
        return await runExtensionsCommand({
          args,
          stdout: commandStdout,
          ...(options.extensionsDirectory === undefined ? {} : { extensionsDirectory: options.extensionsDirectory }),
          ...(options.extensionPackageDownloader === undefined ? {} : { extensionPackageDownloader: options.extensionPackageDownloader })
        });
      }

      if (args.command[0] === "stack") {
        return await runStackCommand({
          args,
          stdout: commandStdout,
          stderr: commandStderr,
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
          commandStdout,
          commandStderr,
          fetcher,
          browserRunner,
          bridgeStarter,
          options.bridgeStateDirectory,
          operationLogStore,
          config.extensions,
          config.hookPlans.open,
          options.stdin ?? process.stdin
        );
      }

      const runtimeExitCode = await runRuntimeCliCommand({
        args,
        stdout: commandStdout,
        stderr: commandStderr,
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
        stdout: commandStdout,
        withLoading: loading.withLoading,
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
    });
  } catch (error) {
    writeErrorOutput(stdout, args.command.join(" ") || "divebell", error);
    return 1;
  }
}

function createLoadingAwareWriter(
  writer: { write(chunk: string): void },
  loading: LoadingController
): { write(chunk: string): void } {
  return {
    write(chunk) {
      loading.clear();
      writer.write(chunk);
    }
  };
}
