import { parseCliArgs } from "./utils/args.js";
import { createDefaultBrowserRunner } from "./features/browser/runner.js";
import { createDetachedBridgeStarter } from "./features/bridge/process.js";
import { createCommandHelpText, createHelpText } from "./commands/help.js";
import { createFileOperationLogStore } from "./utils/operation-log.js";
import { createError, writeErrorOutput, writeOkOutput } from "./utils/output.js";
import { runAgentBrowserAuthCommand, runAgentBrowserProfilesCommand, runAgentBrowserStateCommand } from "./commands/browser-auth.js";
import { runProfileCommand } from "./commands/profile.js";
import {
  runBridgeServerCommand,
  runStartCommand,
  runStopCommand
} from "./commands/bridge.js";
import { createBridgeStateStore } from "./features/bridge/config.js";
import { runBrowserCliCommand, runExtensionCloseHooks } from "./commands/browser.js";
import { runBrowserRawCommand } from "./commands/browser-raw-command.js";
import { isBrowserCommand } from "./commands/names.js";
import { runExtensionCliCommand } from "./commands/extension.js";
import { runKillAllCommand, runKillCommand, runPsCommand } from "./commands/daemon.js";
import { runRuntimeCliCommand } from "./commands/runtime.js";
import { getCliSkillPath } from "./commands/skill.js";
import { runStackCommand } from "./commands/stack.js";
import { hasOption } from "./utils/command.js";
import { runExtensionsCommand } from "./commands/installed.js";
import { runSetupCommand } from "./commands/setup.js";
import { createRemoteDebuggingPageOpener } from "./features/browser/remote-debugging.js";
import { CLI_VERSION, isCliVersionRequest } from "./version.js";
import { createLoadingController, type LoadingController } from "./features/loading.js";
import { removeBrowserTempProfile } from "./features/browser/temp-profile.js";
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
  const bufferedStdout = createBufferedWriter();
  const bufferedStderr = createBufferedWriter();

  try {
    if (argv[0] === "raw") {
      return await runBrowserRawCommand(
        argv.slice(1),
        stdout,
        stderr,
        browserRunner
      );
    }

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
    const rawOutput = shouldUseRawOutput(args);
    const commandStdout = createLoadingAwareWriter(rawOutput ? stdout : bufferedStdout, loading);
    const commandStderr = createLoadingAwareWriter(rawOutput ? stderr : bufferedStderr, loading);
    const exitCode = await loading.withLoading(async () => {
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
          {
            beforeBrowserClose: async () => await runExtensionCloseHooks({
              args,
              stderr: commandStderr,
              fetcher,
              browserRunner,
              bridgeStarter,
              bridgeStateDirectory: options.bridgeStateDirectory,
              operationLogStore,
              extensions: config.extensions,
              openHookPlan: config.hookPlans.open
            }),
            afterBrowserClose: async ({ openContext, browserResult }) => {
              const path = openContext?.browserTempProfile?.path;
              if (path === undefined) return;
              if (browserResult.exitCode !== 0) {
                throw createError({
                  code: "TEMP_PROFILE_BROWSER_CLOSE_FAILED",
                  kind: "browser",
                  message: "Could not close the browser cleanly, so the temporary Profile was retained.",
                  retryable: true,
                  hint: "Retry `divebell stop` or export the Profile before stopping.",
                  details: { exitCode: browserResult.exitCode }
                });
              }
              await removeBrowserTempProfile(path, env);
            }
          }
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

      if (args.command[0] === "profile") {
        return await runProfileCommand({
          args,
          stdout: commandStdout,
          operationLogStore,
          env,
          cwd: process.cwd(),
          closeCurrentPage: async (afterBrowserClose) => {
            const stopArgs = {
              command: ["stop"],
              options: new Map<string, string[]>()
            };
            await runStopCommand(
              stopArgs,
              { write: () => undefined },
              browserRunner,
              options.bridgeStateDirectory,
              operationLogStore,
              options.bridgeProcessController,
              {
                beforeBrowserClose: async () => await runExtensionCloseHooks({
                  args: stopArgs,
                  stderr: commandStderr,
                  fetcher,
                  browserRunner,
                  bridgeStarter,
                  bridgeStateDirectory: options.bridgeStateDirectory,
                  operationLogStore,
                  extensions: config.extensions,
                  openHookPlan: config.hookPlans.open
                }),
                afterBrowserClose: async ({ browserResult }) => await afterBrowserClose({
                  browserExitCode: browserResult.exitCode
                })
              }
            );
          }
        });
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

      if (args.command[0] === "skill") {
        if (args.command.length !== 1 || args.options.size !== 0) {
          throw createError({
            code: "CLI_SKILL_USAGE_INVALID",
            kind: "validation",
            message: "The Divebell CLI skill command does not accept arguments or options.",
            hint: "Run `divebell skill` to print the bundled Divebell CLI Skill path."
          });
        }
        commandStdout.write(`${getCliSkillPath()}\n`);
        return 0;
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
          options.stdin ?? process.stdin,
          env
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
    if (!rawOutput) {
      writeCommandOutput(stdout, args.command.join(" "), exitCode, bufferedStdout.value(), bufferedStderr.value());
      if (exitCode === 0 && bufferedStderr.value().length > 0) {
        stderr.write(bufferedStderr.value());
      }
    }
    return exitCode;
  } catch (error) {
    writeErrorOutput(stdout, args.command.join(" ") || "divebell", error);
    return 1;
  }
}

function shouldUseRawOutput(args: ReturnType<typeof parseCliArgs>): boolean {
  return args.command[0] === "__bridge-server"
    || args.command[0] === "skill"
    || hasOption(args, "skill");
}

function writeCommandOutput(
  stdout: { write(chunk: string): void },
  command: string,
  exitCode: number,
  rawStdout: string,
  rawStderr: string
): void {
  const existingEnvelope = parseOutputEnvelope(rawStdout);
  if (existingEnvelope !== undefined) {
    stdout.write(rawStdout);
    return;
  }

  const data = parseCommandData(rawStdout);
  if (exitCode === 0) {
    writeOkOutput(stdout, command, data);
    return;
  }

  const forwardedError = readForwardedError(data);
  writeErrorOutput(stdout, command, createError({
    code: forwardedError.code ?? "COMMAND_FAILED",
    kind: "browser",
    message: forwardedError.message
      ?? stripTrailingNewline(rawStderr)
      ?? `Command exited with code ${exitCode}.`,
    retryable: true,
    details: { exitCode },
    ...(data === null ? {} : { data })
  }));
}

function parseOutputEnvelope(value: string): Record<string, unknown> | undefined {
  const parsed = parseJsonObject(value);
  const meta = parsed?.meta;
  if (
    parsed === undefined
    || !["ok", "needs_input", "error"].includes(String(parsed.status))
    || meta === null
    || typeof meta !== "object"
    || (meta as Record<string, unknown>).version !== 1
    || typeof (meta as Record<string, unknown>).command !== "string"
  ) {
    return undefined;
  }
  return parsed;
}

function parseCommandData(value: string): unknown {
  const text = stripTrailingNewline(value);
  if (text === undefined || text.length === 0) return null;
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      // Preserve non-JSON browser text verbatim.
    }
  }
  return text;
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function readForwardedError(data: unknown): { code?: string; message?: string } {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return {};
  const item = data as Record<string, unknown>;
  return {
    ...(typeof item.errorCode === "string" ? { code: item.errorCode } : {}),
    ...(typeof item.error === "string" ? { message: item.error } : {})
  };
}

function stripTrailingNewline(value: string): string | undefined {
  if (value.length === 0) return undefined;
  if (value.endsWith("\r\n")) return value.slice(0, -2);
  if (value.endsWith("\n")) return value.slice(0, -1);
  return value;
}

function createBufferedWriter(): { write(chunk: string): void; value(): string } {
  let output = "";
  return {
    write(chunk) {
      output += chunk;
    },
    value() {
      return output;
    }
  };
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
