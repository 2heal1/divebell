import type {
  CliExtensionRunOptions,
  CommandErrorKind,
  ParsedCliArgs
} from "@openruntime/cli";

import { runMemoryCheck } from "./memory-check.js";

export async function runMemoryCliCommand(options: CliExtensionRunOptions): Promise<unknown> {
  if (options.args.command[1] === "check") {
    return await runMemoryCheckCommand(options.args, options.openruntime.browser);
  }
  return await runRawMemoryCommand(options.args, options.openruntime.browser.raw);
}
export { runMemoryCheck } from "./memory-check.js";
export type * from "./types.js";

async function runMemoryCheckCommand(
  args: ParsedCliArgs,
  browser: Parameters<typeof runMemoryCheck>[0]["browser"]
): Promise<unknown> {
  if (args.command.length !== 2) {
    throw commandError({
      code: "MEMORY_CHECK_USAGE_INVALID",
      kind: "validation",
      message: "Memory check accepts options instead of positional paths.",
      hint: "Run `openruntime memory check --url <url> --scenario <path>`."
    });
  }
  const url = requireOption(args, "url");
  const scenarioPath = requireOption(args, "scenario");
  const warmup = positiveIntegerOption(args, "warmup", 3);
  const iterations = positiveIntegerOption(args, "iterations", 12);
  try {
    const result = await runMemoryCheck({
      url,
      scenarioPath,
      artifactDirectory: getOptionValue(args, "artifact-dir") ?? ".memory-artifacts",
      warmup,
      iterations,
      browser,
      ui: args.options.has("ui")
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

async function runRawMemoryCommand(
  args: ParsedCliArgs,
  run: (args: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
): Promise<unknown> {
  if (args.command[1] === "metrics" && !args.options.has("no-gc")) {
    const garbageCollection = await run(["memory", "collect-garbage", "--json"]);
    if (garbageCollection.exitCode !== 0) {
      throw browserCommandError(garbageCollection);
    }
  }
  const result = await run(createMemoryBrowserArgs(args));
  if (result.exitCode !== 0) throw browserCommandError(result);
  return parseBrowserResult(result.stdout);
}

function createMemoryBrowserArgs(args: ParsedCliArgs): string[] {
  const command = args.command.slice(1);
  const key = command.slice(0, 2).join(" ");
  const browserArgs = ["memory"];
  if (["metrics", "status", "collect-garbage", "cancel"].includes(command[0] ?? "") && command.length === 1) {
    browserArgs.push(command[0] as string);
  } else if (key === "sampling start" && command.length === 2) {
    browserArgs.push("sampling", "start");
    appendOption(browserArgs, args, "sampling-interval");
  } else if (key === "sampling stop" && command.length <= 3) {
    browserArgs.push("sampling", "stop", ...command.slice(2));
    appendOption(browserArgs, args, "top");
    appendOption(browserArgs, args, "max-size");
  } else if (command[0] === "snapshot" && command.length <= 2) {
    browserArgs.push("snapshot", ...command.slice(1));
    if (args.options.has("no-gc")) browserArgs.push("--no-gc");
    appendOption(browserArgs, args, "timeout");
    appendOption(browserArgs, args, "max-size");
  } else {
    throw commandError({
      code: "MEMORY_COMMAND_INVALID",
      kind: "validation",
      message: "Invalid memory command.",
      hint: "Run `openruntime --help` to see the supported forms."
    });
  }
  browserArgs.push("--json");
  return browserArgs;
}

function appendOption(browserArgs: string[], args: ParsedCliArgs, name: string): void {
  const value = getOptionValue(args, name);
  if (value !== undefined) browserArgs.push(`--${name}`, value);
}

function browserCommandError(result: { stdout: string; stderr: string }): Error {
  return commandError({
    code: "MEMORY_BROWSER_COMMAND_FAILED",
    kind: "browser",
    message: result.stderr.trim() || result.stdout.trim() || "Memory browser command failed."
  });
}

function parseBrowserResult(stdout: string): unknown {
  const value = stdout.trim();
  if (value.length === 0) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw commandError({
      code: "MEMORY_BROWSER_OUTPUT_INVALID",
      kind: "browser",
      message: error instanceof Error ? error.message : String(error)
    });
  }
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
