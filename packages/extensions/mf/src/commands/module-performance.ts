import { MfCommandError } from "../cli/errors.js";
import { mfCommandName } from "../cli/identity.js";
import { presentCommandResult, readCommandSnapshot } from "../cli/observability.js";
import type { MfCommandDefinition } from "../cli/router.js";
import {
  createModulePerformanceResult
} from "../module-performance/result.js";
import {
  createModulePerformanceReport
} from "../module-performance/report.js";
import {
  readModulePerformanceSnapshot
} from "../module-performance/open.js";
import { visibleInstanceName } from "../selection.js";
import type { BrowserObservabilitySnapshot } from "../types.js";
import {
  modulePerformanceCommandMetadata,
  renderMfCommandUsage
} from "./metadata.js";

export const modulePerformanceCommand: MfCommandDefinition = {
  metadata: modulePerformanceCommandMetadata,
  async run({ options, positionals }) {
    const commandName = mfCommandName(options);
    if (positionals.length > 1) {
      throw new MfCommandError({
        code: "MF_COMMAND_USAGE_INVALID",
        kind: "validation",
        message: "module-perf accepts at most one remote/expose target.",
        hint: `Run \`${renderMfCommandUsage(
          modulePerformanceCommandMetadata.usage,
          commandName
        )}\`.`
      });
    }
    const target = positionals[0];
    const name = option(options.args.options, "mf");
    const instanceRef = option(options.args.options, "instance");
    const report = booleanOption(options.args.options, "report");
    validateView(options.args.options, report);
    const snapshot = await readCommandSnapshot(options);
    validateConsumer(snapshot, name, instanceRef, commandName);
    let performance;
    try {
      performance = await readModulePerformanceSnapshot(options.divebell.browser);
    } catch (error) {
      throw new MfCommandError({
        code: "MF_MODULE_PERFORMANCE_READ_FAILED",
        kind: "browser",
        message: error instanceof Error ? error.message : String(error),
        hint: "Confirm that the current page is still open, then retry."
      });
    }
    const result = createModulePerformanceResult(snapshot, performance, {
      ...(target === undefined ? {} : { target }),
      ...(name === undefined ? {} : { name }),
      ...(instanceRef === undefined ? {} : { instanceRef })
    });
    return presentCommandResult(
      report ? createModulePerformanceReport(result) : result,
      options
    );
  }
};

function validateConsumer(
  snapshot: BrowserObservabilitySnapshot,
  name: string | undefined,
  instanceRef: string | undefined,
  commandName: string
): void {
  if (name === undefined && instanceRef === undefined) return;
  const candidates = snapshot.state.instances.filter((instance) =>
    (instance.role === "consumer" || instance.role === "mixed") &&
    (instanceRef === undefined || instance.instanceRef === instanceRef) &&
    (name === undefined || [
      instance.name,
      instance.optionsName,
      visibleInstanceName(instance)
    ].includes(name))
  );
  if (candidates.length === 1) return;
  throw new MfCommandError({
    code: candidates.length === 0
      ? "MF_MODULE_PERFORMANCE_CONSUMER_NOT_FOUND"
      : "MF_MODULE_PERFORMANCE_CONSUMER_AMBIGUOUS",
    kind: candidates.length === 0 ? "not_found" : "needs_input",
    message: candidates.length === 0
      ? "No consumer matches the requested MF selector."
      : "More than one consumer matches the requested MF selector.",
    hint: candidates.length === 0
      ? `Run \`divebell ${commandName} status --role consumer\` and choose a current instance.`
      : `Repeat the command with one of these --instance values: ${candidates
          .map((instance) => instance.instanceRef).join(", ")}.`,
    details: {
      candidates: candidates.map((instance) => ({
        instanceRef: instance.instanceRef,
        name: visibleInstanceName(instance)
      }))
    }
  });
}

function option(options: Map<string, string[]>, name: string): string | undefined {
  return options.get(name)?.at(-1);
}

function booleanOption(options: Map<string, string[]>, name: string): boolean {
  const value = option(options, name);
  if (value === undefined || value === "true") return value !== undefined;
  if (value === "false") return false;
  throw new MfCommandError({
    code: "MF_COMMAND_OPTION_INVALID",
    kind: "validation",
    message: `Invalid --${name} value ${JSON.stringify(value)}.`,
    hint: "Use --report or --report=false."
  });
}

function validateView(options: Map<string, string[]>, report: boolean): void {
  const value = option(options, "view");
  if (value === undefined) return;
  if (value !== "timeline") {
    throw new MfCommandError({
      code: "MF_COMMAND_OPTION_INVALID",
      kind: "validation",
      message: `Invalid --view value ${JSON.stringify(value)}.`,
      hint: "Use --view timeline or omit --view."
    });
  }
  if (!report) {
    throw new MfCommandError({
      code: "MF_COMMAND_OPTION_INVALID",
      kind: "validation",
      message: "--view timeline requires --report.",
      hint: "Run `divebell mf module-perf --report --view timeline`."
    });
  }
}
