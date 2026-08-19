import type {
  CliExtensionPageContext,
  CliExtensionRunOptions,
  CommandErrorKind,
  DivebellBrowserApi,
  ParsedCliArgs
} from "@divebell/cli";

import { runMemoryCheck } from "./memory-check.js";

export async function runMemoryCliCommand(options: CliExtensionRunOptions): Promise<unknown> {
  const page = requireCurrentPage(options.page);
  if (options.args.command[1] === "check") {
    return await runMemoryCheckCommand(options.args, options.divebell.browser, page);
  }
  return await runTypedMemoryCommand(options.args, options.divebell.browser);
}
export { runMemoryCheck } from "./memory-check.js";
export type * from "./types.js";

async function runMemoryCheckCommand(
  args: ParsedCliArgs,
  browser: DivebellBrowserApi,
  page: CliExtensionPageContext
): Promise<unknown> {
  if (args.command.length !== 2) {
    throw commandError({
      code: "MEMORY_CHECK_USAGE_INVALID",
      kind: "validation",
      message: "Memory check accepts options instead of positional paths.",
      hint: "Run `divebell open <url>`, then `divebell memory check --scenario <path>`."
    });
  }
  const scenarioPath = requireOption(args, "scenario");
  const warmup = positiveIntegerOption(args, "warmup", 3);
  const iterations = positiveIntegerOption(args, "iterations", 12);
  try {
    const result = await runMemoryCheck({
      url: page.url,
      scenarioPath,
      artifactDirectory: getOptionValue(args, "artifact-dir") ?? ".memory-artifacts",
      warmup,
      iterations,
      browser
    });
    return {
      reportPath: result.reportPath,
      baselineSnapshotPath: result.baselineSnapshotPath,
      finalSnapshotPath: result.finalSnapshotPath,
      allocationProfilePath: result.allocationProfilePath,
      verdict: result.report.verdict,
      reasons: result.report.reasons,
      deltas: result.report.deltas,
      slopesPerIteration: result.report.slopesPerIteration,
      topFunctions: result.report.topFunctions
    };
  } catch (error) {
    throw commandError({
      code: "MEMORY_CHECK_FAILED",
      kind: "browser",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

async function runTypedMemoryCommand(
  args: ParsedCliArgs,
  browser: DivebellBrowserApi
): Promise<unknown> {
  const command = args.command.slice(1);
  const key = command.slice(0, 2).join(" ");
  if (command.length === 1 && command[0] === "metrics") {
    return await browser.memory.metrics({ collectGarbage: !args.options.has("no-gc") });
  }
  if (command.length === 1 && command[0] === "status") {
    return await browser.memory.status();
  }
  if (command.length === 2 && key === "sampling start") {
    return await browser.memory.sampling.start({
      ...optionalPositiveIntegerProperty(args, "sampling-interval", "samplingInterval")
    });
  }
  if (command.length <= 3 && key === "sampling stop") {
    return await browser.memory.sampling.stop({
      ...(command[2] === undefined ? {} : { path: command[2] }),
      ...optionalPositiveIntegerProperty(args, "top", "top"),
      ...optionalPositiveIntegerProperty(args, "max-size", "maxSize")
    });
  }
  if (command.length <= 2 && command[0] === "snapshot") {
    return await browser.memory.snapshot({
      ...(command[1] === undefined ? {} : { path: command[1] }),
      collectGarbage: !args.options.has("no-gc"),
      ...optionalPositiveIntegerProperty(args, "timeout", "timeout"),
      ...optionalPositiveIntegerProperty(args, "max-size", "maxSize")
    });
  }
  if (command.length === 1 && command[0] === "collect-garbage") {
    return await browser.memory.collectGarbage();
  }
  if (command.length === 1 && command[0] === "cancel") {
    return await browser.memory.cancel();
  }
  throw commandError({
    code: "MEMORY_COMMAND_INVALID",
    kind: "validation",
    message: "Invalid memory command.",
    hint: "Run `divebell --help` to see the supported forms."
  });
}

function requireCurrentPage(
  page: CliExtensionPageContext | undefined
): CliExtensionPageContext {
  if (page === undefined) {
    throw commandError({
      code: "OPEN_CONTEXT_REQUIRED",
      kind: "validation",
      message: "This command requires a current page opened by Divebell.",
      hint: "Run `divebell open <url>` first."
    });
  }
  return page;
}

function getOptionValue(args: ParsedCliArgs, name: string): string | undefined {
  return args.options.get(name)?.at(-1);
}

function requireOption(args: ParsedCliArgs, name: string): string {
  const value = getOptionValue(args, name);
  if (value === undefined || value.length === 0) {
    throw commandError({
      code: "CLI_REQUIRED_OPTION_MISSING",
      kind: "validation",
      message: `Missing required option "--${name}".`
    });
  }
  return value;
}

function positiveIntegerOption(args: ParsedCliArgs, name: string, fallback: number): number {
  const value = getOptionValue(args, name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw commandError({
      code: "POSITIVE_INTEGER_OPTION_INVALID",
      kind: "validation",
      message: `--${name} must be a positive integer.`
    });
  }
  return parsed;
}

function optionalPositiveIntegerProperty<Name extends string>(
  args: ParsedCliArgs,
  optionName: string,
  propertyName: Name
): Record<Name, number> | Record<string, never> {
  const value = getOptionValue(args, optionName);
  if (value === undefined) return {};
  return {
    [propertyName]: positiveIntegerOption(args, optionName, 1)
  } as Record<Name, number>;
}

function commandError(options: {
  code: string;
  kind: CommandErrorKind;
  message: string;
  hint?: string;
}): Error {
  return Object.assign(new Error(options.message), {
    name: "CommandError",
    code: options.code,
    kind: options.kind,
    retryable: false,
    ...(options.hint === undefined ? {} : { hint: options.hint })
  });
}
