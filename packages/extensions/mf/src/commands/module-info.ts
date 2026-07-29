import { createModuleInfoResult } from "../results.js";
import { MfCommandError } from "../cli/errors.js";
import { mfCommandName } from "../cli/identity.js";
import { presentCommandResult, readCommandSnapshot } from "../cli/observability.js";
import type { MfCommandDefinition } from "../cli/router.js";
import {
  moduleInfoCommandMetadata,
  renderMfCommandUsage
} from "./metadata.js";

export const moduleInfoCommand: MfCommandDefinition = {
  metadata: moduleInfoCommandMetadata,
  async run({ options, positionals }) {
    if (positionals.length > 1) {
      throw new MfCommandError({
        code: "MF_COMMAND_USAGE_INVALID",
        kind: "validation",
        message: "module-info accepts at most one remote name.",
        hint: `Run \`${renderMfCommandUsage(
          moduleInfoCommandMetadata.usage,
          mfCommandName(options)
        )}\`.`
      });
    }
    const remote = positionals[0];
    const name = option(options.args.options, "mf");
    const instanceRef = option(options.args.options, "instance");
    const snapshot = await readCommandSnapshot(options);
    const result = createModuleInfoResult(
      snapshot,
      {
        ...(name === undefined ? {} : { name }),
        ...(instanceRef === undefined ? {} : { instanceRef })
      },
      remote
    );
    return presentCommandResult(result, options);
  }
};

function option(options: Map<string, string[]>, name: string): string | undefined {
  return options.get(name)?.at(-1);
}
