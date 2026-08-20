import type { CliExtensionRunOptions } from "@divebell/cli";

import { MfCoreError } from "./errors.js";
import { coreErrorToCommandError } from "./cli/errors.js";
import { mfCommandName } from "./cli/identity.js";
import { remoteCoreErrorToCommandError } from "./cli/remote-errors.js";
import { dispatchMfCommand } from "./cli/router.js";
import { mfCommandRegistry } from "./commands/registry.js";
import { RemoteCoreError } from "./remote/errors.js";

interface LegacyCommandOutput {
  ok(value: unknown): void;
}

export async function runMfCommand(
  options: CliExtensionRunOptions & { output?: LegacyCommandOutput }
): Promise<unknown> {
  const commandName = mfCommandName(options);
  try {
    const result = await dispatchMfCommand(
      options,
      mfCommandRegistry,
      commandName
    );
    if (options.output !== undefined) {
      options.output.ok(result);
      return 0;
    }
    if (
      options.stdout !== undefined
      && usesModulePerformanceTimelineView(options.args)
    ) {
      const rendered = (await import("./module-performance/format.js"))
        .formatModulePerformanceReportTimeline(result, {
          ...(options.stdout.columns === undefined
            ? {}
            : { columns: options.stdout.columns })
        });
      options.stdout.write(rendered.endsWith("\n") ? rendered : `${rendered}\n`);
    }
    return result;
  } catch (error) {
    if (error instanceof MfCoreError) {
      throw coreErrorToCommandError(error, commandName);
    }
    if (error instanceof RemoteCoreError) {
      throw remoteCoreErrorToCommandError(error, commandName);
    }
    throw error;
  }
}

function usesModulePerformanceTimelineView(
  args: CliExtensionRunOptions["args"]
): boolean {
  const segments = args.command.slice(1);
  const modulePerformance = segments[0] === "module-perf" || (
    segments[0] === "module" && segments[1] === "perf"
  );
  return modulePerformance && args.options.get("view")?.at(-1) === "timeline";
}
