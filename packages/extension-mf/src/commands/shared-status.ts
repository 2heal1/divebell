import { MfCommandError } from "../cli/errors.js";
import { mfCommandName } from "../cli/identity.js";
import { presentCommandResult, readCommandSnapshot } from "../cli/observability.js";
import type { MfCommandDefinition } from "../cli/router.js";
import { createSharedStatusResult } from "../shared/status.js";
import {
  renderMfCommandUsage,
  sharedStatusCommandMetadata
} from "./metadata.js";

export const sharedStatusCommand: MfCommandDefinition = {
  metadata: sharedStatusCommandMetadata,
  async run({ options, positionals }) {
    if (positionals.length > 1) {
      throw usageError(
        "shared status accepts at most one package name.",
        mfCommandName(options)
      );
    }
    const removedOption = ["mf", "instance"].find((name) =>
      options.args.options.has(name)
    );
    if (removedOption !== undefined) {
      throw new MfCommandError({
        code: "MF_COMMAND_OPTION_INVALID",
        kind: "validation",
        message: `--${removedOption} is not available for shared status.`,
        hint: `Shared status reads the merged global share registry. Run \`${renderMfCommandUsage(
          sharedStatusCommandMetadata.usage,
          mfCommandName(options)
        )}\`.`
      });
    }
    const verbose = booleanOption(options.args.options, "verbose");
    const snapshot = await readCommandSnapshot(options, { verbose });
    const result = createSharedStatusResult(snapshot, {
      ...(positionals[0] === undefined ? {} : { package: positionals[0] }),
      ...selectedOption(options.args.options, "scope", "scope"),
      ...selectedOption(options.args.options, "version", "version")
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
    hint: `Run \`${renderMfCommandUsage(
      sharedStatusCommandMetadata.usage,
      commandName
    )}\`.`
  });
}

function booleanOption(options: Map<string, string[]>, name: string): boolean {
  const value = options.get(name)?.at(-1);
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new MfCommandError({
    code: "MF_COMMAND_OPTION_INVALID",
    kind: "validation",
    message: `Invalid --${name} value ${JSON.stringify(value)}.`,
    hint: `Use --${name} or --${name}=false.`
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
