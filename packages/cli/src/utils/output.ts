import type { CommandErrorKind, CommandOutputMeta, CommandOutputWriter, CommandErrorOptions, CommandOutput } from "../types/shared.js";
export type { CommandOutputStatus, CommandErrorKind, CommandOutputMeta, CommandOutputWriter, CommandErrorOptions, CommandOutput } from "../types/shared.js";

export class CommandError extends Error {
  readonly code: string;
  readonly kind: CommandErrorKind;
  readonly outputCommand?: string;
  readonly retryable: boolean;
  readonly hint?: string;
  readonly details?: Record<string, unknown>;
  readonly data?: unknown;

  constructor(options: CommandErrorOptions) {
    super(options.message);
    this.name = "CommandError";
    this.code = options.code;
    this.kind = options.kind;
    if (options.outputCommand !== undefined) {
      this.outputCommand = options.outputCommand;
    }
    this.retryable = options.retryable ?? false;
    if (options.hint !== undefined) {
      this.hint = options.hint;
    }
    if (options.details !== undefined) {
      this.details = options.details;
    }
    if (options.data !== undefined) {
      this.data = options.data;
    }
  }
}

export function createError(options: CommandErrorOptions): CommandError {
  return new CommandError(options);
}

export function isCommandError(error: unknown): error is CommandError {
  return error instanceof CommandError || (
    error instanceof Error
    && typeof (error as Partial<CommandError>).code === "string"
    && typeof (error as Partial<CommandError>).kind === "string"
    && typeof (error as Partial<CommandError>).retryable === "boolean"
  );
}

export function createCommandOutput(stdout: CommandOutputWriter, command: string): CommandOutput {
  return {
    ok: (data, message) => {
      writeOkOutput(stdout, command, data, message);
    },
    needsInput: (message, options, data) => {
      writeNeedsInputOutput(stdout, command, message, options, data);
    },
    error: (error) => {
      writeErrorOutput(stdout, command, error);
    }
  };
}

export async function runWithOutputErrorBoundary(
  output: CommandOutput,
  run: () => Promise<number>
): Promise<number> {
  try {
    return await run();
  } catch (error) {
    output.error(error);
    return 1;
  }
}

export function writeOkOutput<T>(
  stdout: CommandOutputWriter,
  command: string,
  data: T,
  message?: string
): void {
  writeOutput(stdout, {
    status: "ok",
    ...(message === undefined ? {} : { message }),
    data,
    meta: createMeta(command)
  });
}

export function writeNeedsInputOutput(
  stdout: CommandOutputWriter,
  command: string,
  message: string,
  options: readonly unknown[],
  data?: unknown
): void {
  writeOutput(stdout, {
    status: "needs_input",
    message,
    options,
    ...(data === undefined ? {} : { data }),
    meta: createMeta(command)
  });
}

export function writeErrorOutput(
  stdout: CommandOutputWriter,
  command: string,
  error: unknown
): void {
  const normalized = normalizeCommandError(error);
  const outputCommand = normalized.outputCommand ?? command;
  writeOutput(stdout, {
    status: "error",
    message: normalized.message,
    error: {
      code: normalized.code,
      kind: normalized.kind,
      retryable: normalized.retryable,
      ...(normalized.hint === undefined ? {} : { hint: normalized.hint }),
      ...(normalized.details === undefined ? {} : { details: normalized.details })
    },
    ...(normalized.data === undefined ? {} : { data: normalized.data }),
    meta: createMeta(outputCommand)
  });
}

function normalizeCommandError(error: unknown): CommandError {
  if (isCommandError(error)) {
    return error;
  }
  return createError({
    code: "INTERNAL_ERROR",
    kind: "internal",
    message: error instanceof Error ? error.message : String(error),
    retryable: false
  });
}

function createMeta(command: string): CommandOutputMeta {
  return {
    version: 1,
    command
  };
}

function writeOutput(stdout: CommandOutputWriter, value: unknown): void {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
