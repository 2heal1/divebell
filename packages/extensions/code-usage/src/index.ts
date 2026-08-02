import type {
  CliExtensionRunOptions,
  CommandErrorKind,
  ParsedCliArgs
} from "@divebell/cli";

import { analyzeCodeUsageFiles } from "./code-usage.js";
import { captureCodeUsageExperience } from "./experience.js";
import { openHtmlReport, writeCodeUsageReportHtml } from "./report.js";
import {
  startCodeUsageReportServer,
  waitForCodeUsageReportServer
} from "./server.js";

export async function runCodeUsageCommand(options: CliExtensionRunOptions): Promise<unknown> {
  const action = options.args.command[1];
  if (action === "analyze") {
    return await runAnalyze(options.args);
  }
  if (action === "experience") {
    return await runExperience(options);
  }
  if (action === "report") {
    return await runCodeUsageReportCommand(options.args);
  }
  if (action === "serve") {
    return await runCodeUsageServeCommand(options.args);
  }
  throw commandError({
    code: "CODE_USAGE_ACTION_INVALID",
    kind: "validation",
    message: "code-usage requires experience, analyze, report, or serve.",
    hint: "Run `divebell code-usage experience ...`, `divebell code-usage analyze ...`, `divebell code-usage report ...`, or `divebell code-usage serve ...`."
  });
}
export { analyzeCodeUsageFiles } from "./code-usage.js";
export {
  captureCodeUsageExperience,
  isCodeUsageExperienceEnabled,
  openCodeUsageExperience,
  PAGE_EXPERIENCE_INIT_SCRIPT
} from "./experience.js";
export {
  createCodeUsageReportHtml,
  openHtmlReport,
  writeCodeUsageReportHtml
} from "./report.js";
export {
  startCodeUsageReportServer,
  waitForCodeUsageReportServer
} from "./server.js";
export type * from "./types.js";

async function runAnalyze(
  args: ParsedCliArgs
): Promise<unknown> {
  if (args.command.length !== 2) {
    throw commandError({
      code: "CODE_USAGE_ANALYZE_USAGE_INVALID",
      kind: "validation",
      message: "Code usage analysis accepts options instead of positional paths.",
      hint: "Run `divebell code-usage analyze --chunk-map <path> --coverage <path>`."
    });
  }
  const chunkMap = requireOption(args, "chunk-map");
  const coverage = getOptionValues(args, "coverage");
  const experience = getOptionValues(args, "experience");
  if (coverage.length === 0) {
    throw commandError({
      code: "CODE_USAGE_COVERAGE_REQUIRED",
      kind: "validation",
      message: "At least one --coverage path is required.",
      hint: "Repeat --coverage for each recorded phase."
    });
  }

  try {
    const result = await analyzeCodeUsageFiles({
      chunkMap,
      coverage,
      ...(experience.length === 0 ? {} : { experience }),
      ...optionalString("assets", getOptionValue(args, "assets")),
      ...optionalString("output", getOptionValue(args, "output"))
    });
    return {
      chunkMap: result.chunkMap,
      coverage: result.coverage,
      experience: result.experience,
      assets: result.assets,
      output: result.output,
      phaseCount: result.phaseCount
    };
  } catch (error) {
    throw commandError({
      code: "CODE_USAGE_ANALYSIS_FAILED",
      kind: "validation",
      message: errorMessage(error)
    });
  }
}

async function runExperience(
  options: CliExtensionRunOptions
): Promise<unknown> {
  if (options.args.command.length !== 2) {
    throw commandError({
      code: "CODE_USAGE_EXPERIENCE_USAGE_INVALID",
      kind: "validation",
      message: "Page-experience capture accepts options instead of positional paths.",
      hint: "Run `divebell code-usage experience --output <path> --label <name>`."
    });
  }
  const outputPath = getOptionValue(options.args, "output")
    ?? "divebell-page-experience.json";
  const label = getOptionValue(options.args, "label") ?? "first-screen";
  const readyTarget = getOptionValue(options.args, "ready-target")
    ?? "explicit page-ready condition";
  const settleMs = parseSettleMs(getOptionValue(options.args, "settle-ms"));
  try {
    const result = await captureCodeUsageExperience(options.divebell.browser, {
      outputPath,
      label,
      readyTarget,
      settleMs
    });
    return {
      output: result.outputPath,
      label: result.phase.label,
      url: result.phase.url,
      readyDurationMs: result.phase.readyDurationMs,
      memoryAtReadyBytes: result.phase.memory.atReadyBytes,
      peakMemoryBytes: result.phase.memory.peakBytes,
      stableMemoryBytes: result.phase.memory.stableBytes
    };
  } catch (error) {
    const message = errorMessage(error);
    throw commandError({
      code: "CODE_USAGE_EXPERIENCE_CAPTURE_FAILED",
      kind: "validation",
      message,
      ...(message.includes("recorder is missing")
        ? {
            hint: "Reopen the page with `divebell open <url> --code-usage-experience`, wait for the explicit ready condition, then retry."
          }
        : {})
    });
  }
}

export async function runCodeUsageReportCommand(
  args: ParsedCliArgs,
  opener: (path: string) => Promise<void> = openHtmlReport
): Promise<unknown> {
  if (args.command.length !== 3) {
    throw commandError({
      code: "ANALYSIS_REPORT_INPUT_REQUIRED",
      kind: "validation",
      message: "A code usage report JSON path is required.",
      hint: "Run `divebell code-usage report <report.json>`."
    });
  }
  const inputPath = args.command[2];
  if (inputPath === undefined) {
    throw new Error("Missing report input path.");
  }
  let report;
  try {
    report = await writeCodeUsageReportHtml({
      inputPath,
      ...optionalString("outputPath", getOptionValue(args, "output"))
    });
  } catch (error) {
    throw commandError({
      code: "ANALYSIS_REPORT_INVALID",
      kind: "validation",
      message: errorMessage(error)
    });
  }
  const opened = !args.options.has("no-open");
  if (opened) {
    try {
      await opener(report.htmlPath);
    } catch (error) {
      throw commandError({
        code: "ANALYSIS_REPORT_OPEN_FAILED",
        kind: "internal",
        message: `The report was created but could not be opened: ${errorMessage(error)}`,
        hint: `Open ${report.htmlPath} manually.`
      });
    }
  }
  return {
    ...report,
    opened
  };
}

export async function runCodeUsageServeCommand(
  args: ParsedCliArgs
): Promise<unknown> {
  if (args.command.length !== 3) {
    throw commandError({
      code: "CODE_USAGE_SERVE_INPUT_REQUIRED",
      kind: "validation",
      message: "A code usage report JSON path is required.",
      hint: "Run `divebell code-usage serve <report.json>`."
    });
  }
  const inputPath = args.command[2];
  if (inputPath === undefined) {
    throw new Error("Missing report input path.");
  }
  const port = parsePort(getOptionValue(args, "port"));
  try {
    const server = await startCodeUsageReportServer({
      inputPath,
      ...(port === undefined ? {} : { port })
    });
    void waitForCodeUsageReportServer(server);
    return { url: server.url };
  } catch (error) {
    throw commandError({
      code: "CODE_USAGE_SERVE_FAILED",
      kind: "validation",
      message: errorMessage(error)
    });
  }
}

function getOptionValue(args: ParsedCliArgs, name: string): string | undefined {
  return args.options.get(name)?.at(-1);
}

function getOptionValues(args: ParsedCliArgs, name: string): string[] {
  return args.options.get(name) ?? [];
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

function optionalString<Name extends string>(
  name: Name,
  value: string | undefined
): Record<Name, string> | Record<string, never> {
  return value === undefined ? {} : { [name]: value } as Record<Name, string>;
}

function parsePort(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw commandError({
      code: "CODE_USAGE_SERVE_PORT_INVALID",
      kind: "validation",
      message: `Invalid report server port "${value}".`
    });
  }
  return port;
}

function parseSettleMs(value: string | undefined): number {
  if (value === undefined) return 500;
  const milliseconds = Number(value);
  if (!Number.isInteger(milliseconds) || milliseconds < 0 || milliseconds > 60_000) {
    throw commandError({
      code: "CODE_USAGE_EXPERIENCE_SETTLE_INVALID",
      kind: "validation",
      message: `Invalid settle time ${JSON.stringify(value)}. Use a whole number from 0 to 60000 milliseconds.`
    });
  }
  return milliseconds;
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
