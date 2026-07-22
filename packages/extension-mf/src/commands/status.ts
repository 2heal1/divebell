import type { RoleFilter } from "../types.js";
import { formatStatus } from "../format.js";
import { createStatusResult } from "../results.js";
import { MfCommandError } from "../cli/errors.js";
import { readCommandSnapshot, writeCommandResult } from "../cli/observability.js";
import type { MfCommandDefinition } from "../cli/router.js";
import { statusCommandMetadata } from "./metadata.js";

export const statusCommand: MfCommandDefinition = {
  metadata: statusCommandMetadata,
  async run({ options, positionals }) {
    if (positionals.length > 1) {
      throw usageError("status accepts at most one name.");
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
    const snapshot = await readCommandSnapshot(options);
    const result = createStatusResult(snapshot, {
      ...(name === undefined ? {} : { name }),
      ...(rawRole === undefined ? {} : { role: rawRole as RoleFilter }),
      ...(instanceRef === undefined ? {} : { instanceRef })
    });
    writeCommandResult(options, result, formatStatus(result));
    return 0;
  }
};

function usageError(message: string): MfCommandError {
  return new MfCommandError({
    code: "MF_COMMAND_USAGE_INVALID",
    kind: "validation",
    message,
    hint: `Run \`${statusCommandMetadata.usage.replace(" [--json]", "")}\`.`
  });
}

function option(options: Map<string, string[]>, name: string): string | undefined {
  return options.get(name)?.at(-1);
}
