import { readCommandSnapshot, writeCommandResult } from "../cli/observability.js";
import type { MfCommandDefinition } from "../cli/router.js";
import { formatRemoteCheck } from "../remote/format.js";
import { createRemoteCheckResult } from "../remote/results.js";
import { remoteCheckCommandMetadata } from "./metadata.js";
import { option, singleTarget } from "./remote-command.js";

export const remoteCheckCommand: MfCommandDefinition = {
  metadata: remoteCheckCommandMetadata,
  async run({ options, positionals }) {
    const remote = singleTarget(positionals, remoteCheckCommandMetadata, {
      required: true,
      label: "remote check"
    });
    const name = option(options.args.options, "mf");
    const instanceRef = option(options.args.options, "instance");
    const snapshot = await readCommandSnapshot(options);
    const result = createRemoteCheckResult(snapshot, remote as string, {
      ...(name === undefined ? {} : { name }),
      ...(instanceRef === undefined ? {} : { instanceRef })
    });
    writeCommandResult(options, result, formatRemoteCheck(result));
    return 0;
  }
};
