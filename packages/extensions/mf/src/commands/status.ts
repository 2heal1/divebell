import type { RoleFilter } from "../types.js";
import { createStatusResult } from "../results.js";
import { MfCommandError } from "../cli/errors.js";
import { mfCommandName } from "../cli/identity.js";
import { presentCommandResult, readCommandSnapshot } from "../cli/observability.js";
import type { MfCommandDefinition } from "../cli/router.js";
import {
  renderMfCommandUsage,
  statusCommandMetadata
} from "./metadata.js";

export const statusCommand: MfCommandDefinition = {
  metadata: statusCommandMetadata,
  async run({ options, positionals }) {
    if (positionals.length > 1) {
      throw usageError(
        "status accepts at most one name.",
        mfCommandName(options)
      );
    }
    const rawRole = option(options.args.options, "role");
    if (rawRole !== undefined && rawRole !== "consumer" && rawRole !== "producer") {
      throw new MfCommandError({
        code: "MF_ROLE_INVALID",
        kind: "validation",
        message: `Unsupported MF role ${rawRole}.`,
        hint: "Use --role consumer or --role producer."
      });
    }
    const name = positionals[0];
    const instanceRef = option(options.args.options, "instance");
    const verbose = booleanOption(options.args.options, "verbose");
    const snapshot = await readCommandSnapshot(options, { verbose });
    const result = createStatusResult(snapshot, {
      ...(name === undefined ? {} : { name }),
      ...(rawRole === undefined ? {} : { role: rawRole as RoleFilter }),
      ...(instanceRef === undefined ? {} : { instanceRef })
    }, {
      verbose
    });
    return presentCommandResult(result, options);
  }
};

function usageError(message: string, commandName: string): MfCommandError {
  return new MfCommandError({
    code: "MF_COMMAND_USAGE_INVALID",
    kind: "validation",
    message,
    hint: `Run \`${renderMfCommandUsage(statusCommandMetadata.usage, commandName)}\`.`
  });
}

function option(options: Map<string, string[]>, name: string): string | undefined {
  return options.get(name)?.at(-1);
}

function booleanOption(options: Map<string, string[]>, name: string): boolean {
  const value = option(options, name);
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new MfCommandError({
    code: "MF_COMMAND_OPTION_INVALID",
    kind: "validation",
    message: `Invalid --${name} value ${JSON.stringify(value)}.`,
    hint: `Use --${name} or --${name}=false.`
  });
}
