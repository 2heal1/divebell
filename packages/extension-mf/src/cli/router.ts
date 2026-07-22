import type { CliExtensionRunOptions } from "@openruntime/cli";

import { MfCommandError } from "./errors.js";
import type { MfCommandMetadata } from "../commands/metadata.js";

export interface MfCommandContext {
  options: CliExtensionRunOptions;
  positionals: string[];
}

export interface MfCommandDefinition {
  metadata: MfCommandMetadata;
  run(context: MfCommandContext): Promise<number>;
}

export interface MfCommandRegistration extends MfCommandMetadata {
  load(): Promise<MfCommandDefinition>;
}

export interface MfCommandMatch {
  registration: MfCommandRegistration;
  positionals: string[];
}

export function matchMfCommand(
  registrations: readonly MfCommandRegistration[],
  segments: readonly string[]
): MfCommandMatch | undefined {
  const matches = registrations.filter((registration) =>
    registration.path.length <= segments.length &&
    registration.path.every((segment, index) => segments[index] === segment)
  );
  const registration = matches.reduce<MfCommandRegistration | undefined>(
    (longest, candidate) =>
      longest === undefined || candidate.path.length > longest.path.length
        ? candidate
        : longest,
    undefined
  );
  return registration === undefined
    ? undefined
    : {
        registration,
        positionals: segments.slice(registration.path.length)
      };
}

export async function dispatchMfCommand(
  options: CliExtensionRunOptions,
  registrations: readonly MfCommandRegistration[]
): Promise<number> {
  const match = matchMfCommand(registrations, options.args.command.slice(1));
  if (match === undefined) throw unknownCommandError(registrations);
  const definition = await match.registration.load();
  return definition.run({ options, positionals: match.positionals });
}

function unknownCommandError(
  registrations: readonly MfCommandRegistration[]
): MfCommandError {
  const names = registrations.map((registration) => registration.path.join(" "));
  const usages = registrations.map((registration) => `\`${registration.summaryUsage}\``);
  return new MfCommandError({
    code: "MF_COMMAND_INVALID",
    kind: "validation",
    message: `mf requires ${joinWithOr(names)}.`,
    hint: `Run ${joinWithOr(usages)}.`
  });
}

function joinWithOr(values: readonly string[]): string {
  if (values.length < 2) return values[0] ?? "a supported command";
  return `${values.slice(0, -1).join(", ")} or ${values.at(-1)}`;
}
