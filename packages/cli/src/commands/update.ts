import type { DivebellCliUpdater } from "../features/update/types.js";
import { runCliUpdateWithLock } from "../features/update/manager.js";
import type { ParsedCliArgs } from "../types/shared.js";
import { createError, writeOkOutput } from "../utils/output.js";

export async function runUpdateCommand(options: {
  args: ParsedCliArgs;
  stdout: { write(chunk: string): void };
  updater: DivebellCliUpdater;
  env: NodeJS.ProcessEnv;
}): Promise<number> {
  validateUpdateArgs(options.args);
  const check = options.args.options.has("check");
  try {
    const result = await runCliUpdateWithLock(
      options.updater,
      { check },
      options.env
    );
    writeOkOutput(options.stdout, "update", result, result.message);
    return 0;
  } catch (error) {
    throw createError({
      code: "CLI_UPDATE_FAILED",
      kind: "internal",
      message: error instanceof Error ? error.message : String(error),
      retryable: true,
      hint: "Check registry access and the global npm installation, then retry `divebell update`."
    });
  }
}

function validateUpdateArgs(args: ParsedCliArgs): void {
  if (args.command.length !== 1) {
    throw createError({
      code: "CLI_UPDATE_USAGE_INVALID",
      kind: "validation",
      message: "The update command does not accept positional arguments.",
      hint: "Run `divebell update --check` or `divebell update`."
    });
  }

  for (const option of args.options.keys()) {
    if (option !== "check") {
      throw createError({
        code: "CLI_UPDATE_OPTION_INVALID",
        kind: "validation",
        message: `Unknown update option --${option}.`,
        hint: "Run `divebell update --check` or `divebell update`."
      });
    }
  }

  const checkValues = args.options.get("check") ?? [];
  if (checkValues.length > 1 || (checkValues.length === 1 && checkValues[0] !== "true")) {
    throw createError({
      code: "CLI_UPDATE_OPTION_INVALID",
      kind: "validation",
      message: "--check is a flag and does not accept a value.",
      hint: "Run `divebell update --check`."
    });
  }
}
