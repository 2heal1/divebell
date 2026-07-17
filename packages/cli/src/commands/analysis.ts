import { getOptionValue, getOptionValues, type ParsedCliArgs } from "../utils/args.js";
import type { BrowserRunner } from "../features/browser/runner.js";
import { analyzeCodeUsageFiles } from "../features/analysis/code-usage.js";
import { runMemoryCheck } from "../features/analysis/memory-check.js";
import { writeCodeUsageReportHtml, type HtmlReportOpener } from "../features/analysis/report.js";
import { createCommandOutput, createError } from "../utils/output.js";
import { createOptionalStringProperty, hasOption, requireCommandArgument, requireOption } from "../utils/command.js";
export async function runCodeUsageAnalyzeCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void }
): Promise<number> {
  if (args.command.length !== 2) {
    throw createError({
      code: "CODE_USAGE_ANALYZE_USAGE_INVALID",
      kind: "validation",
      message: "Code usage analysis accepts options instead of positional paths.",
      hint: "Run `openruntime code-usage analyze --chunk-map <path> --coverage <path>`.",
      details: { command: args.command }
    });
  }
  const chunkMap = requireOption(args, "chunk-map");
  const coverage = getOptionValues(args, "coverage");
  if (coverage.length === 0) {
    throw createError({
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
      ...createOptionalStringProperty("assets", getOptionValue(args, "assets")),
      ...createOptionalStringProperty("output", getOptionValue(args, "output"))
    });
    createCommandOutput(stdout, args.command.join(" ")).ok({
      chunkMap: result.chunkMap,
      coverage: result.coverage,
      assets: result.assets,
      output: result.output,
      phaseCount: result.phaseCount
    }, "Code usage analysis created.");
    return 0;
  } catch (error) {
    throw createError({
      code: "CODE_USAGE_ANALYSIS_FAILED",
      kind: "validation",
      message: error instanceof Error ? error.message : String(error),
      details: { chunkMap, coverage }
    });
  }
}

export async function runMemoryCheckCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  browserRunner: BrowserRunner
): Promise<number> {
  if (args.command.length !== 2) {
    throw createError({
      code: "MEMORY_CHECK_USAGE_INVALID",
      kind: "validation",
      message: "Memory check accepts options instead of positional paths.",
      hint: "Run `openruntime memory check --url <url> --scenario <path>`.",
      details: { command: args.command }
    });
  }
  const url = requireOption(args, "url");
  const scenarioPath = requireOption(args, "scenario");
  const warmup = getPositiveIntegerOption(args, "warmup", 3);
  const iterations = getPositiveIntegerOption(args, "iterations", 12);

  try {
    const result = await runMemoryCheck({
      url,
      scenarioPath,
      artifactDirectory: getOptionValue(args, "artifact-dir") ?? ".memory-artifacts",
      warmup,
      iterations,
      browserRunner,
      ui: hasOption(args, "ui")
    });
    createCommandOutput(stdout, args.command.join(" ")).ok({
      reportPath: result.reportPath,
      baselineSnapshotPath: result.baselineSnapshotPath,
      finalSnapshotPath: result.finalSnapshotPath,
      allocationProfilePath: result.allocationProfilePath,
      verdict: result.report.verdict,
      reasons: result.report.reasons,
      deltas: result.report.deltas,
      slopesPerIteration: result.report.slopesPerIteration,
      topFunctions: result.report.topFunctions
    }, "Memory check completed.");
    return 0;
  } catch (error) {
    throw createError({
      code: "MEMORY_CHECK_FAILED",
      kind: "browser",
      message: error instanceof Error ? error.message : String(error),
      details: { url, scenarioPath, warmup, iterations }
    });
  }
}

function getPositiveIntegerOption(
  args: ParsedCliArgs,
  name: string,
  fallback: number
): number {
  const value = getOptionValue(args, name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError({
      code: "POSITIVE_INTEGER_OPTION_INVALID",
      kind: "validation",
      message: `--${name} must be a positive integer.`,
      details: { option: name, value }
    });
  }
  return parsed;
}

export async function runCodeUsageReportCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  opener: HtmlReportOpener
): Promise<number> {
  if (args.command.length !== 3) {
    throw createError({
      code: "ANALYSIS_REPORT_INPUT_REQUIRED",
      kind: "validation",
      message: "A code usage report JSON path is required.",
      hint: "Run `openruntime code-usage report <report.json>`.",
      details: { command: args.command }
    });
  }
  const inputPath = requireCommandArgument(args, 2, "analysis report JSON path");
  let report;
  try {
    report = await writeCodeUsageReportHtml({
      inputPath,
      ...createOptionalStringProperty("outputPath", getOptionValue(args, "output"))
    });
  } catch (error) {
    throw createError({
      code: "ANALYSIS_REPORT_INVALID",
      kind: "validation",
      message: error instanceof Error ? error.message : String(error),
      details: { inputPath }
    });
  }
  const opened = !hasOption(args, "no-open");
  if (opened) {
    try {
      await opener(report.htmlPath);
    } catch (error) {
      throw createError({
        code: "ANALYSIS_REPORT_OPEN_FAILED",
        kind: "internal",
        message: `The report was created but could not be opened: ${error instanceof Error ? error.message : String(error)}`,
        hint: `Open ${report.htmlPath} manually.`,
        details: { ...report }
      });
    }
  }
  createCommandOutput(stdout, args.command.join(" ")).ok({
    ...report,
    opened
  }, opened ? "Analysis report created and opened." : "Analysis report created.");
  return 0;
}
