import type { CliExtensionRunOptions } from "@divebell/cli";

import { MfCommandError } from "../cli/errors.js";
import type { MfCommandMetadata } from "./metadata.js";

export function singleTarget(
  positionals: string[],
  metadata: MfCommandMetadata,
  options: { required?: boolean; label: string }
): string | undefined {
  if (positionals.length > 1 || (options.required === true && positionals.length !== 1)) {
    throw new MfCommandError({
      code: "MF_COMMAND_USAGE_INVALID",
      kind: "validation",
      message: options.required === true
        ? `${options.label} requires exactly one remote.`
        : `${options.label} accepts at most one target.`,
      hint: `Run \`${metadata.usage}\`.`
    });
  }
  return positionals[0];
}

export function remoteSelectors(
  options: CliExtensionRunOptions,
  target?: string
): {
  target?: string;
  name?: string;
  instanceRef?: string;
  traceId?: string;
} {
  const name = option(options.args.options, "mf");
  const instanceRef = option(options.args.options, "instance");
  const traceId = option(options.args.options, "trace-id");
  return {
    ...(target === undefined ? {} : { target }),
    ...(name === undefined ? {} : { name }),
    ...(instanceRef === undefined ? {} : { instanceRef }),
    ...(traceId === undefined ? {} : { traceId })
  };
}

export function option(
  options: Map<string, string[]>,
  name: string
): string | undefined {
  return options.get(name)?.at(-1);
}
