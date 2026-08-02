import { getOptionValue } from "../utils/args.js";
import { createBridgeStateStore } from "../features/bridge/config.js";
import { validateCommandSkill } from "./skill.js";
import {
  createError,
  isCommandError,
  writeOkOutput
} from "../utils/output.js";
import {
  applyOpenContextDefaults,
  createExtensionPageContext
} from "../open-context.js";
import type {
  CliExtensionRunOptionValue,
  CliExtensionRunRequest,
  ExtensionCliCommandOptions,
  DivebellExtensionCommand,
  DivebellExtensionDefinition
} from "../types/commands.js";
import type { CliOperationLogEntry, ParsedCliArgs } from "../types/shared.js";
import { createDivebellExtensionApi } from "../features/extension/api.js";

const MAX_EXTENSION_CALL_DEPTH = 16;
const INHERITED_CONTEXT_OPTIONS = ["bridge", "port", "runtime", "session", "url"] as const;

interface RegisteredExtensionCommand {
  extension: DivebellExtensionDefinition;
  command: DivebellExtensionCommand;
}

interface ExtensionCall {
  extension: string;
  command: string;
}

interface ExtensionCommandExecutor {
  fetcher: ExtensionCliCommandOptions["fetcher"];
  browserRunner: ExtensionCliCommandOptions["browserRunner"];
  bridgeStarter: ExtensionCliCommandOptions["bridgeStarter"];
  bridgeStateDirectory: string | undefined;
  openContext: CliOperationLogEntry | undefined;
  extensionRegistry: ExtensionCliCommandOptions["extensionRegistry"];
  commandRegistry: ExtensionCliCommandOptions["commandRegistry"];
  withLoading: ExtensionCliCommandOptions["withLoading"];
}

export async function runExtensionCliCommand(
  options: ExtensionCliCommandOptions
): Promise<number | undefined> {
  const {
    args,
    stdout,
    withLoading,
    fetcher,
    browserRunner,
    bridgeStarter,
    bridgeStateDirectory,
    operationLogStore,
    extensionRegistry,
    commandRegistry
  } = options;
  const command = args.command[0];
  if (command === undefined) {
    return undefined;
  }

  const registered = commandRegistry.get(command);
  if (registered === undefined) {
    return undefined;
  }

  if (args.options.has("skill")) {
    if (args.command.length !== 1 || getOptionValue(args, "skill") !== "true") {
      throw createError({
        code: "CLI_COMMAND_SKILL_USAGE_INVALID",
        kind: "validation",
        message: "Command skill lookup only accepts the command name.",
        hint: `Run \`divebell ${command} --skill\`.`
      });
    }
    if (registered.command.skill === undefined) {
      throw createError({
        code: "CLI_COMMAND_SKILL_UNAVAILABLE",
        kind: "not_found",
        message: `Command "${command}" does not provide a skill.`,
        hint: "Run `divebell --help` to see commands with available skills."
      });
    }
    const skill = validateCommandSkill(registered.command.skill, registered.command.name);
    stdout.write(`${skill.path}\n`);
    return 0;
  }

  const openContext = await operationLogStore.read();
  const extensionArgs = applyOpenContextDefaults(args, openContext);
  const result = await executeExtensionCommand(
    {
      fetcher,
      browserRunner,
      bridgeStarter,
      bridgeStateDirectory,
      openContext,
      extensionRegistry,
      commandRegistry,
      withLoading
    },
    registered,
    extensionArgs,
    [{
      extension: registered.extension.name,
      command: registered.command.name
    }]
  );
  writeOkOutput(stdout, extensionArgs.command.join(" "), result);
  return 0;
}

async function executeExtensionCommand<T = unknown>(
  executor: ExtensionCommandExecutor,
  registered: RegisteredExtensionCommand,
  args: ParsedCliArgs,
  calls: readonly ExtensionCall[]
): Promise<T> {
  assertRequiredOpenHook(executor.openContext, registered);
  const runExtension = async <Result = unknown>(
    extensionName: string,
    request: CliExtensionRunRequest
  ): Promise<Result> => {
    assertDeclaredDependency(registered, extensionName);
    const target = resolveExtensionCommand(executor, extensionName, request);
    const nextCall = {
      extension: target.extension.name,
      command: target.command.name
    };
    const nextCalls = [...calls, nextCall];
    if (calls.some((call) =>
      call.extension === nextCall.extension && call.command === nextCall.command
    )) {
      throw createError({
        code: "EXTENSION_COMMAND_CYCLE",
        kind: "validation",
        message: `Extension Command call cycle detected: ${formatCallChain(nextCalls)}.`,
        details: {
          extensionCallChain: nextCalls
        }
      });
    }
    if (nextCalls.length > MAX_EXTENSION_CALL_DEPTH) {
      throw createError({
        code: "EXTENSION_COMMAND_DEPTH_EXCEEDED",
        kind: "validation",
        message: `Extension Command calls cannot exceed ${MAX_EXTENSION_CALL_DEPTH} levels.`,
        details: {
          extensionCallChain: nextCalls
        }
      });
    }
    const childArgs = createChildArgs(request, args, executor.openContext);
    try {
      return await executeExtensionCommand<Result>(executor, target, childArgs, nextCalls);
    } catch (error) {
      throw withExtensionCallChain(error, nextCalls);
    }
  };

  return await registered.command.run({
    args,
    fetcher: executor.fetcher,
    ...(executor.openContext === undefined
      ? {}
      : { page: createExtensionPageContext(executor.openContext) }),
    ...(executor.openContext?.headers === undefined
      ? {}
      : { headers: executor.openContext.headers }),
    divebell: createDivebellExtensionApi({
      args,
      fetcher: executor.fetcher,
      browserRunner: executor.browserRunner,
      bridgeStarter: executor.bridgeStarter,
      bridgeStateStore: createBridgeStateStore(args, executor.bridgeStateDirectory),
      ...(executor.openContext === undefined ? {} : { openContext: executor.openContext })
    }),
    runExtension,
    withLoading: executor.withLoading
  }) as T;
}

function assertRequiredOpenHook(
  openContext: CliOperationLogEntry | undefined,
  registered: RegisteredExtensionCommand
): void {
  if (registered.command.requiresOpenHook !== true) return;
  if (openContext?.activeExtensions.includes(registered.extension.name) === true) return;
  throw createError({
    code: "EXTENSION_OPEN_HOOK_REQUIRED",
    kind: "validation",
    message: `Command "${registered.command.name}" requires Extension "${registered.extension.name}" to complete its open hook for the current page.`,
    hint: "Open the page again after confirming the Extension open hook can complete successfully.",
    details: {
      extension: registered.extension.name,
      command: registered.command.name
    }
  });
}

function assertDeclaredDependency(
  caller: RegisteredExtensionCommand,
  extensionName: string
): void {
  if (
    extensionName === caller.extension.name
    || caller.extension.requires?.includes(extensionName) === true
  ) {
    return;
  }
  throw createError({
    code: "EXTENSION_DEPENDENCY_UNDECLARED",
    kind: "validation",
    message: `Extension "${caller.extension.name}" cannot call undeclared Extension "${extensionName}".`,
    hint: `Add "${extensionName}" to the Extension requires list.`,
    details: {
      extension: caller.extension.name,
      command: caller.command.name,
      requestedExtension: extensionName
    }
  });
}

function resolveExtensionCommand(
  executor: ExtensionCommandExecutor,
  extensionName: string,
  request: CliExtensionRunRequest
): RegisteredExtensionCommand {
  validateRunRequest(extensionName, request);
  if (!executor.extensionRegistry.has(extensionName)) {
    throw createError({
      code: "EXTENSION_NOT_FOUND",
      kind: "not_found",
      message: `Extension "${extensionName}" is not loaded.`
    });
  }
  const registered = executor.commandRegistry.get(request.command);
  if (registered === undefined || registered.extension.name !== extensionName) {
    throw createError({
      code: "EXTENSION_COMMAND_NOT_FOUND",
      kind: "not_found",
      message: `Extension "${extensionName}" does not provide Command "${request.command}".`,
      details: {
        extension: extensionName,
        command: request.command
      }
    });
  }
  return registered;
}

function validateRunRequest(
  extensionName: string,
  request: CliExtensionRunRequest
): void {
  if (typeof extensionName !== "string" || extensionName.length === 0) {
    throw createError({
      code: "EXTENSION_RUN_REQUEST_INVALID",
      kind: "validation",
      message: "runExtension requires a non-empty Extension name."
    });
  }
  if (request === null || typeof request !== "object" || Array.isArray(request)) {
    throw createError({
      code: "EXTENSION_RUN_REQUEST_INVALID",
      kind: "validation",
      message: "runExtension requires a request object."
    });
  }
  if (typeof request.command !== "string" || request.command.length === 0) {
    throw createError({
      code: "EXTENSION_RUN_REQUEST_INVALID",
      kind: "validation",
      message: "runExtension requires a non-empty Command name."
    });
  }
  if (
    request.args !== undefined
    && (!Array.isArray(request.args) || !request.args.every((value) => typeof value === "string"))
  ) {
    throw createError({
      code: "EXTENSION_RUN_REQUEST_INVALID",
      kind: "validation",
      message: "runExtension args must be an array of strings."
    });
  }
  if (
    request.options !== undefined
    && (
      !isPlainObject(request.options)
      || !Object.values(request.options).every(isRunOptionValue)
    )
  ) {
    throw createError({
      code: "EXTENSION_RUN_REQUEST_INVALID",
      kind: "validation",
      message: "runExtension options must contain string, number, boolean, or array values."
    });
  }
}

function createChildArgs(
  request: CliExtensionRunRequest,
  parentArgs: ParsedCliArgs,
  openContext: CliOperationLogEntry | undefined
): ParsedCliArgs {
  const options = new Map<string, string[]>();
  for (const [name, value] of Object.entries(request.options ?? {})) {
    const values = Array.isArray(value) ? value : [value];
    options.set(name, values.map(String));
  }
  for (const name of INHERITED_CONTEXT_OPTIONS) {
    if (options.has(name)) continue;
    const values = parentArgs.options.get(name);
    if (values !== undefined) options.set(name, [...values]);
  }
  return applyOpenContextDefaults({
    command: [request.command, ...(request.args ?? [])],
    options
  }, openContext);
}

function isRunOptionValue(value: CliExtensionRunOptionValue): boolean {
  if (Array.isArray(value)) {
    return value.every(isRunOptionScalar);
  }
  return isRunOptionScalar(value);
}

function isRunOptionScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function withExtensionCallChain(
  error: unknown,
  calls: readonly ExtensionCall[]
): Error {
  if (
    isCommandError(error)
    && Array.isArray(error.details?.extensionCallChain)
  ) {
    return error;
  }
  if (isCommandError(error)) {
    return createError({
      code: error.code,
      kind: error.kind,
      message: error.message,
      retryable: error.retryable,
      ...(error.outputCommand === undefined ? {} : { outputCommand: error.outputCommand }),
      ...(error.hint === undefined ? {} : { hint: error.hint }),
      details: {
        ...error.details,
        extensionCallChain: calls
      },
      ...(error.data === undefined ? {} : { data: error.data })
    });
  }
  return createError({
    code: "EXTENSION_COMMAND_FAILED",
    kind: "internal",
    message: error instanceof Error ? error.message : String(error),
    details: {
      extensionCallChain: calls
    }
  });
}

function formatCallChain(calls: readonly ExtensionCall[]): string {
  return calls.map((call) => `${call.extension}:${call.command}`).join(" -> ");
}
