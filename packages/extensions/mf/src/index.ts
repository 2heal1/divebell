import type { CliExtensionRunOptions } from "@divebell/cli";

import { MfCoreError } from "./errors.js";
import { coreErrorToCommandError } from "./cli/errors.js";
import { mfCommandName } from "./cli/identity.js";
import { remoteCoreErrorToCommandError } from "./cli/remote-errors.js";
import { dispatchMfCommand } from "./cli/router.js";
import { mfCommandRegistry } from "./commands/registry.js";
import { RemoteCoreError } from "./remote/errors.js";

interface LegacyCommandOutput {
  ok(value: unknown): void;
}

export async function runMfCommand(
  options: CliExtensionRunOptions & { output?: LegacyCommandOutput }
): Promise<unknown> {
  const commandName = mfCommandName(options);
  try {
    const result = await dispatchMfCommand(
      options,
      mfCommandRegistry,
      commandName
    );
    if (options.output !== undefined) {
      options.output.ok(result);
      return 0;
    }
    return result;
  } catch (error) {
    if (error instanceof MfCoreError) {
      throw coreErrorToCommandError(error, commandName);
    }
    if (error instanceof RemoteCoreError) {
      throw remoteCoreErrorToCommandError(error, commandName);
    }
    throw error;
  }
}
