import type {
  CliCommandErrorResult,
  CliCommandInvocation,
  CliCommandOkResult
} from "@divebell/cli";

import type { VerifyCommandResult } from "./types.js";

export interface VerifyTestCommandOptions {
  bridge?: string;
  runtime?: string;
  session?: string;
  url?: string;
  where?: Record<string, unknown>;
  timeout?: number;
  next?: boolean;
  strict?: boolean;
  open?: boolean;
}

export type VerifyTestCommandError = Omit<
  CliCommandErrorResult<VerifyCommandResult>,
  "data"
> & {
  data: VerifyCommandResult;
};

export function verifyTestCommand(
  targetId: string,
  status: string,
  options: VerifyTestCommandOptions = {}
): CliCommandInvocation<
  CliCommandOkResult<VerifyCommandResult>,
  VerifyTestCommandError
> {
  return {
    args: [
      "verify",
      ...option("bridge", options.bridge),
      ...option("runtime", options.runtime),
      ...option("session", options.session),
      ...option("url", options.url),
      targetId,
      status,
      ...whereArgs(options.where),
      ...numberOption("timeout", options.timeout),
      ...flag("next", options.next),
      ...flag("strict", options.strict),
      ...flag("open", options.open)
    ]
  };
}

function whereArgs(where: Record<string, unknown> | undefined): string[] {
  if (where === undefined) return [];
  return Object.entries(where).flatMap(([path, value]) => [
    "--where",
    `${path}=${formatValue(value)}`
  ]);
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? String(value);
}

function option(name: string, value: string | undefined): string[] {
  return value === undefined ? [] : [`--${name}`, value];
}

function numberOption(name: string, value: number | undefined): string[] {
  return value === undefined ? [] : [`--${name}`, String(value)];
}

function flag(name: string, enabled: boolean | undefined): string[] {
  return enabled === true ? [`--${name}`] : [];
}
