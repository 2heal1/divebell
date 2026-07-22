import { MfCommandError } from "../cli/errors.js";
import { readCommandSnapshot, writeCommandResult } from "../cli/observability.js";
import type { MfCommandDefinition } from "../cli/router.js";
import { sharedCoreErrorToCommandError } from "../cli/shared.js";
import { formatSharedStatus } from "../shared/format.js";
import { createSharedStatusResult } from "../shared/status.js";
import { sharedStatusCommandMetadata } from "./metadata.js";

export const sharedStatusCommand: MfCommandDefinition = {
  metadata: sharedStatusCommandMetadata,
  async run({ options, positionals }) {
    if (positionals.length > 1) {
      throw usageError("shared status accepts at most one package name.");
    }
    const snapshot = await readCommandSnapshot(options);
    let result: ReturnType<typeof createSharedStatusResult>;
    try {
      result = createSharedStatusResult(snapshot, {
        ...(positionals[0] === undefined ? {} : { package: positionals[0] }),
        ...selectedOption(options.args.options, "mf", "mf"),
        ...selectedOption(options.args.options, "instance", "instanceRef"),
        ...selectedOption(options.args.options, "scope", "scope")
      });
    } catch (error) {
      sharedCoreErrorToCommandError(error);
    }
    writeCommandResult(options, result, formatSharedStatus(result));
    return 0;
  }
};

function usageError(message: string): MfCommandError {
  return new MfCommandError({
    code: "MF_COMMAND_USAGE_INVALID",
    kind: "validation",
    message,
    hint: `Run \`${sharedStatusCommandMetadata.usage.replace(" [--json]", "")}\`.`
  });
}

function selectedOption<Key extends string>(
  options: Map<string, string[]>,
  optionName: string,
  key: Key
): { [Property in Key]?: string } {
  const value = options.get(optionName)?.at(-1);
  return value === undefined ? {} : { [key]: value } as { [Property in Key]?: string };
}
