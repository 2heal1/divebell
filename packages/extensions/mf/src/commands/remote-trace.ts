import { MfCommandError } from "../cli/errors.js";
import { mfCommandName } from "../cli/identity.js";
import { presentCommandResult, readCommandSnapshot } from "../cli/observability.js";
import type { MfCommandDefinition } from "../cli/router.js";
import { createRemoteTraceResult } from "../remote/results.js";
import {
  remoteTraceCommandMetadata,
  renderMfCommandUsage
} from "./metadata.js";
import { remoteSelectors, singleTarget } from "./remote-command.js";

export const remoteTraceCommand: MfCommandDefinition = {
  metadata: remoteTraceCommandMetadata,
  async run({ options, positionals }) {
    const commandName = mfCommandName(options);
    rejectSharedOptions(options.args.options, commandName);
    const target = singleTarget(positionals, remoteTraceCommandMetadata, {
      label: "remote trace",
      commandName
    });
    const preload = booleanOption(options.args.options, "preload");
    const snapshot = await readCommandSnapshot(options);
    const result = createRemoteTraceResult(
      snapshot,
      preload ? "preload" : "load",
      remoteSelectors(options, target)
    );
    return presentCommandResult(result, options);
  }
};

function rejectSharedOptions(
  options: Map<string, string[]>,
  commandName: string
): void {
  const optionName = ["shared", "scope", "operation"].find((name) =>
    options.has(name)
  );
  if (optionName === undefined) return;
  throw new MfCommandError({
    code: "MF_COMMAND_OPTION_INVALID",
    kind: "validation",
    message: `--${optionName} is not available for remote traces.`,
    hint: `Use \`${renderMfCommandUsage(
      remoteTraceCommandMetadata.usage,
      commandName
    )}\` or run \`divebell ${commandName} shared trace [package]\`.`
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
