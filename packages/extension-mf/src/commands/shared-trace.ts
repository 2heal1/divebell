import { MfCommandError } from "../cli/errors.js";
import { mfCommandName } from "../cli/identity.js";
import { presentCommandResult, readCommandSnapshot } from "../cli/observability.js";
import type { MfCommandDefinition } from "../cli/router.js";
import {
  createSharedCommandPresenter,
  sharedCoreErrorToCommandError
} from "../cli/shared.js";
import { createSharedTraceResult } from "../shared/trace.js";
import type { PresentedSharedTraceResult, SharedTraceResult } from "../shared/types.js";
import {
  renderMfCommandUsage,
  sharedTraceCommandMetadata
} from "./metadata.js";

export const sharedTraceCommand: MfCommandDefinition = {
  metadata: sharedTraceCommandMetadata,
  async run({ options, positionals }) {
    const commandName = mfCommandName(options);
    if (positionals.length > 1) {
      throw usageError(
        "shared trace accepts at most one package name.",
        commandName
      );
    }
    const snapshot = await readCommandSnapshot(options);
    let result: ReturnType<typeof createSharedTraceResult>;
    try {
      result = createSharedTraceResult(snapshot, {
        ...(positionals[0] === undefined ? {} : { package: positionals[0] }),
        ...selectedOption(options.args.options, "mf", "mf"),
        ...selectedOption(options.args.options, "instance", "instanceRef"),
        ...selectedOption(options.args.options, "scope", "scope"),
        ...selectedOption(options.args.options, "operation", "operationId"),
        ...selectedOption(options.args.options, "trace-id", "traceId")
      });
    } catch (error) {
      sharedCoreErrorToCommandError(error, commandName);
    }
    const presented = presentCandidates(result, commandName);
    return presentCommandResult(presented, options);
  }
};

function presentCandidates(
  result: SharedTraceResult,
  commandName: string
): PresentedSharedTraceResult {
  const presenter = createSharedCommandPresenter(["divebell", commandName]);
  return {
    ...result,
    candidates: result.candidates.map((candidate) => ({
      ...candidate,
      command: presenter.trace({
        package: candidate.package,
        ...(candidate.instanceRef === "unknown" ? {} : { instanceRef: candidate.instanceRef }),
        ...(candidate.scope === "unknown" ? {} : { scope: candidate.scope }),
        ...(candidate.operationId === "unknown"
          ? { traceId: candidate.traceId }
          : { operationId: candidate.operationId })
      })
    }))
  };
}

function usageError(message: string, commandName: string): MfCommandError {
  return new MfCommandError({
    code: "MF_COMMAND_USAGE_INVALID",
    kind: "validation",
    message,
    hint: `Run \`${renderMfCommandUsage(
      sharedTraceCommandMetadata.usage,
      commandName
    )}\`.`
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
