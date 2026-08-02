import type { CliExtensionRunOptions } from "@divebell/cli";

import { MfCommandError } from "./errors.js";
import type { MfCommandMetadata } from "../commands/metadata.js";
import { renderMfCommandUsage } from "../commands/metadata.js";

export interface MfCommandContext {
  options: CliExtensionRunOptions;
  positionals: string[];
}

export interface MfCommandDefinition {
  metadata: MfCommandMetadata;
  run(context: MfCommandContext): Promise<unknown>;
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
  registrations: readonly MfCommandRegistration[],
  commandName = options.args.command[0] ?? "mf"
): Promise<unknown> {
  const segments = normalizeMfCommandSegments(options.args.command.slice(1));
  const match = matchMfCommand(registrations, segments);
  if (match === undefined) {
    throw commandRouteError(registrations, segments, commandName);
  }
  const definition = await match.registration.load();
  return definition.run({ options, positionals: match.positionals });
}

function normalizeMfCommandSegments(segments: readonly string[]): string[] {
  if (segments[0] === "module" && segments[1] === "perf") {
    return ["module-perf", ...segments.slice(2)];
  }
  return [...segments];
}

function commandRouteError(
  registrations: readonly MfCommandRegistration[],
  segments: readonly string[],
  commandName: string
): MfCommandError {
  const names = registrations.map((registration) => registration.path.join(" "));
  const usages = registrations.map((registration) =>
    `\`${renderMfCommandUsage(registration.summaryUsage, commandName)}\``
  );
  const available = joinWithOr(names);
  return new MfCommandError({
    code: segments.length === 0 ? "MF_COMMAND_REQUIRED" : "MF_COMMAND_INVALID",
    kind: "validation",
    message: segments.length === 0
      ? `${commandName} requires a subcommand. Available commands: ${available}.`
      : `Unknown ${commandName} subcommand \`${segments.join(" ")}\`. Available commands: ${available}.`,
    hint: `Run ${joinWithOr(usages)}.`
  });
}

function joinWithOr(values: readonly string[]): string {
  if (values.length < 2) return values[0] ?? "a supported command";
  return `${values.slice(0, -1).join(", ")} or ${values.at(-1)}`;
}
