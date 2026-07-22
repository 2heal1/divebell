import type { CommandErrorKind } from "@openruntime/cli";

export class MfCommandError extends Error {
  readonly code: string;
  readonly kind: CommandErrorKind;
  readonly retryable = false;
  readonly hint?: string;
  readonly details?: Record<string, unknown>;
  readonly data?: unknown;

  constructor(options: {
    code: string;
    kind: CommandErrorKind;
    message: string;
    hint?: string;
    details?: Record<string, unknown>;
    data?: unknown;
  }) {
    super(options.message);
    this.name = "CommandError";
    this.code = options.code;
    this.kind = options.kind;
    if (options.hint !== undefined) this.hint = options.hint;
    if (options.details !== undefined) this.details = options.details;
    if (options.data !== undefined) this.data = options.data;
  }
}
