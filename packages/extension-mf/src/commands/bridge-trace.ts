import { createCommandPresenter } from "../cli/presenter.js";
import { mfCommandName } from "../cli/identity.js";
import { presentCommandResult, readCommandSnapshot } from "../cli/observability.js";
import { MfCommandError } from "../cli/errors.js";
import type { MfCommandDefinition } from "../cli/router.js";
import { presentBridgeTraceResult } from "../bridge/format.js";
import { createBridgeTraceResult } from "../bridge/result.js";
import {
  bridgeTraceCommandMetadata,
  renderMfCommandUsage
} from "./metadata.js";

export const bridgeTraceCommand: MfCommandDefinition = {
  metadata: bridgeTraceCommandMetadata,
  async run({ options, positionals }) {
    const commandName = mfCommandName(options);
    if (positionals.length > 1) {
      throw new MfCommandError({
        code: "MF_COMMAND_USAGE_INVALID",
        kind: "validation",
        message: "bridge trace accepts at most one remote name or alias.",
        hint: `Run \`${renderMfCommandUsage(
          bridgeTraceCommandMetadata.usage,
          commandName
        )}\`.`
      });
    }
    const remote = positionals[0];
    const name = option(options.args.options, "mf");
    const instanceRef = option(options.args.options, "instance");
    const bridgeId = option(options.args.options, "bridge-id");
    const operationId = option(options.args.options, "operation");
    const snapshot = await readCommandSnapshot(options);
    const result = createBridgeTraceResult(snapshot, {
      ...(remote === undefined ? {} : { remote }),
      ...(name === undefined ? {} : { name }),
      ...(instanceRef === undefined ? {} : { instanceRef }),
      ...(bridgeId === undefined ? {} : { bridgeId }),
      ...(operationId === undefined ? {} : { operationId })
    });
    const presented = presentBridgeTraceResult(
      result,
      createCommandPresenter(["divebell", commandName])
    );
    return presentCommandResult(presented, options);
  }
};

function option(options: Map<string, string[]>, name: string): string | undefined {
  return options.get(name)?.at(-1);
}
