import type { CliExtensionRunOptions } from "@openruntime/cli";

import { MfCoreError } from "./errors.js";
import { coreErrorToCommandError } from "./cli/errors.js";
import { dispatchMfCommand } from "./cli/router.js";
import { mfCommandRegistry } from "./commands/registry.js";

export async function runMfCommand(options: CliExtensionRunOptions): Promise<number> {
  try {
    return await dispatchMfCommand(options, mfCommandRegistry);
  } catch (error) {
    if (error instanceof MfCoreError) throw coreErrorToCommandError(error);
    throw error;
  }
}
