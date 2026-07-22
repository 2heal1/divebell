import type { CliExtensionRunOptions } from "@openruntime/cli";

import { MfCoreError } from "./errors.js";
import { coreErrorToCommandError } from "./cli/errors.js";
import { remoteCoreErrorToCommandError } from "./cli/remote-errors.js";
import { dispatchMfCommand } from "./cli/router.js";
import { mfCommandRegistry } from "./commands/registry.js";
import { RemoteCoreError } from "./remote/errors.js";

export async function runMfCommand(options: CliExtensionRunOptions): Promise<number> {
  try {
    return await dispatchMfCommand(options, mfCommandRegistry);
  } catch (error) {
    if (error instanceof MfCoreError) throw coreErrorToCommandError(error);
    if (error instanceof RemoteCoreError) throw remoteCoreErrorToCommandError(error);
    throw error;
  }
}
