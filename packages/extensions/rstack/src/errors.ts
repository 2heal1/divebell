import type { CommandErrorKind } from "@divebell/cli";

export function rstackError(options: {
  code: string;
  kind: CommandErrorKind;
  message: string;
  hint?: string;
  details?: unknown;
}): Error {
  return Object.assign(new Error(options.message), {
    name: "CommandError",
    code: options.code,
    kind: options.kind,
    retryable: false,
    ...(options.hint === undefined ? {} : { hint: options.hint }),
    ...(options.details === undefined ? {} : { details: options.details })
  });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
