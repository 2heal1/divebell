import type { CliExtensionRunOptions } from "@divebell/cli";

import { rstackError } from "./errors.js";
import { runHmrCommand } from "./hmr.js";

export async function runRstackCommand(
  options: CliExtensionRunOptions
): Promise<unknown> {
  const segments = options.args.command.slice(1);
  if (segments[0] !== "hmr") {
    throw rstackError({
      code: segments.length === 0
        ? "RSTACK_COMMAND_REQUIRED"
        : "RSTACK_COMMAND_INVALID",
      kind: "validation",
      message: segments.length === 0
        ? "rstack requires the hmr subcommand."
        : `Unknown rstack subcommand ${JSON.stringify(segments.join(" "))}.`,
      hint: "Run `divebell rstack hmr <inspect|start|status|wait|stop>`."
    });
  }
  return await runHmrCommand(options, segments.slice(1));
}

export { discoverProfilesInSource, locationAt } from "./profiles.js";
export { detectRstackStack } from "./detect-stack.js";
export {
  createRstackStackDetectionInitScript,
  openRstackStackDetection
} from "./open.js";
export { reactDomBuildsInSource } from "./react-refresh-preflight.js";
export { appendDebugEvents, currentOutcome, reduceCycles, refreshSummary } from "./reducer.js";
export { createHmrResult, resultShouldFinish } from "./report.js";
export { compareState, loadStateCheck } from "./state-check.js";
export type * from "./types.js";
