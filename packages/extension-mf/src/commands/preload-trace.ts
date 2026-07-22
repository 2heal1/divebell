import { readCommandSnapshot, writeCommandResult } from "../cli/observability.js";
import type { MfCommandDefinition } from "../cli/router.js";
import { formatRemoteTrace } from "../remote/format.js";
import { createRemoteTraceResult } from "../remote/results.js";
import { preloadTraceCommandMetadata } from "./metadata.js";
import { remoteSelectors, singleTarget } from "./remote-command.js";

export const preloadTraceCommand: MfCommandDefinition = {
  metadata: preloadTraceCommandMetadata,
  async run({ options, positionals }) {
    const target = singleTarget(positionals, preloadTraceCommandMetadata, {
      label: "preload trace"
    });
    const snapshot = await readCommandSnapshot(options);
    const result = createRemoteTraceResult(
      snapshot,
      "preload",
      remoteSelectors(options, target)
    );
    writeCommandResult(options, result, formatRemoteTrace(result));
    return 0;
  }
};
