import type { CliExtensionRunOptions } from "@divebell/cli";

export function mfCommandName(options: CliExtensionRunOptions): string {
  return options.args.command[0] ?? "mf";
}

export function mfCommandPrefix(options: CliExtensionRunOptions): string[] {
  return ["divebell", mfCommandName(options)];
}
