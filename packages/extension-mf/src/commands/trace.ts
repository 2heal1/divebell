import { readCommandSnapshot, writeCommandResult } from "../cli/observability.js";
import type { MfCommandDefinition } from "../cli/router.js";
import { createRemoteTraceResult } from "../remote/results.js";
import { traceCommandMetadata } from "./metadata.js";
import { remoteSelectors, singleTarget } from "./remote-command.js";

export const traceCommand: MfCommandDefinition = {
  metadata: traceCommandMetadata,
  async run({ options, positionals }) {
    const target = singleTarget(positionals, traceCommandMetadata, {
      label: "trace"
    });
    const snapshot = await readCommandSnapshot(options);
    const result = createRemoteTraceResult(
      snapshot,
      "load",
      remoteSelectors(options, target)
    );
    writeCommandResult(options, result);
    return 0;
  }
};
