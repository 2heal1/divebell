import { presentCommandResult, readCommandSnapshot } from "../cli/observability.js";
import type { MfCommandDefinition } from "../cli/router.js";
import { createRemoteStatusResult } from "../remote/results.js";
import { remoteStatusCommandMetadata } from "./metadata.js";
import { option, singleTarget } from "./remote-command.js";

export const remoteStatusCommand: MfCommandDefinition = {
  metadata: remoteStatusCommandMetadata,
  async run({ options, positionals }) {
    const remote = singleTarget(positionals, remoteStatusCommandMetadata, {
      required: true,
      label: "remote status"
    });
    const name = option(options.args.options, "mf");
    const instanceRef = option(options.args.options, "instance");
    const snapshot = await readCommandSnapshot(options);
    const result = createRemoteStatusResult(snapshot, remote as string, {
      ...(name === undefined ? {} : { name }),
      ...(instanceRef === undefined ? {} : { instanceRef })
    });
    return presentCommandResult(result);
  }
};
