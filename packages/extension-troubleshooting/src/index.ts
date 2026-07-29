import type {
  CliExtensionRunOptions,
  ParsedCliArgs
} from "@divebell/cli";
import type { VerifyCommandResult } from "./types.js";

import { runVerifyCommand } from "./verify.js";

export async function runVerifyCliCommand(
  options: CliExtensionRunOptions
): Promise<VerifyCommandResult> {
  const targetId = requireArgument(options.args, 1, "target id");
  const status = requireArgument(options.args, 2, "status");
  const where = parseWhereOptions(options.args);
  const result = await runVerifyCommand(
    options.divebell,
    targetId,
    status,
    where,
    getNumberOption(options.args, "timeout")
  );
  if (!result.result.success) {
    throw Object.assign(new Error(result.result.evidence.message), {
      name: "CommandError",
      code: "VERIFY_FAILED",
      kind: "runtime",
      retryable: false,
      data: result
    });
  }
  return result;
}
export { createVerifyCommandFailure, runVerifyCommand } from "./verify.js";
export { verifyTestCommand } from "./test-commands.js";
export type {
  VerifyTestCommandError,
  VerifyTestCommandOptions
} from "./test-commands.js";
export type * from "./types.js";

function requireArgument(args: ParsedCliArgs, index: number, label: string): string {
  const value = args.command[index];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required ${label}.`);
  }
  return value;
}

function getNumberOption(args: ParsedCliArgs, name: string): number | undefined {
  const value = args.options.get(name)?.at(-1);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseWhereOptions(args: ParsedCliArgs): Array<{ path: string; equals: unknown }> | undefined {
  const values = args.options.get("where") ?? [];
  if (values.length === 0) return undefined;
  return values.map((value) => {
    const equalsIndex = value.indexOf("=");
    if (equalsIndex <= 0) throw new Error("--where must use the form path=value.");
    const path = value.slice(0, equalsIndex).trim();
    if (path.length === 0) throw new Error("--where path must not be empty.");
    return {
      path,
      equals: parseValue(value.slice(equalsIndex + 1))
    };
  });
}

function parseValue(raw: string): unknown {
  const value = raw.trim();
  if (value.length === 0) return "";
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
