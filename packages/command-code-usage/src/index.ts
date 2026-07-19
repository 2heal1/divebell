import type {
  CommandErrorKind,
  OpenRuntimeCommandDefinition,
  ParsedCliArgs
} from "@openruntime/cli";

import { analyzeCodeUsageFiles } from "./code-usage.js";
import { openHtmlReport, writeCodeUsageReportHtml } from "./report.js";

const command: OpenRuntimeCommandDefinition = {
  schemaVersion: 1,
  name: "code-usage",
  commandReferences: [
    {
      category: "Commands",
      usage: "openruntime code-usage analyze --chunk-map <path> --coverage <path> [--coverage <path>...] [--assets <dir>] [--output <report.json>]",
      description: "使用指定的 Chunk Map、构建文件和页面代码记录，分析分块、源码文件与依赖包的实际使用情况。"
    },
    {
      category: "Commands",
      usage: "openruntime code-usage report <report.json> [--output <report.html>] [--no-open]",
      description: "把代码使用分析结果生成可交互报告并打开；--no-open 只生成文件。"
    }
  ],
  run: async (options) => {
    const action = options.args.command[1];
    if (action === "analyze") {
      return await runAnalyze(options.args, options.output);
    }
    if (action === "report") {
      return await runCodeUsageReportCommand(options.args, options.output);
    }
    throw commandError({
      code: "CODE_USAGE_ACTION_INVALID",
      kind: "validation",
      message: "code-usage requires analyze or report.",
      hint: "Run `openruntime code-usage analyze ...` or `openruntime code-usage report ...`."
    });
  }
};

export default command;
export { analyzeCodeUsageFiles } from "./code-usage.js";
export {
  createCodeUsageReportHtml,
  openHtmlReport,
  writeCodeUsageReportHtml
} from "./report.js";
export type * from "./types.js";

async function runAnalyze(
  args: ParsedCliArgs,
  output: Parameters<OpenRuntimeCommandDefinition["run"]>[0]["output"]
): Promise<number> {
  if (args.command.length !== 2) {
    throw commandError({
      code: "CODE_USAGE_ANALYZE_USAGE_INVALID",
      kind: "validation",
      message: "Code usage analysis accepts options instead of positional paths.",
      hint: "Run `openruntime code-usage analyze --chunk-map <path> --coverage <path>`."
    });
  }
  const chunkMap = requireOption(args, "chunk-map");
  const coverage = getOptionValues(args, "coverage");
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
      ...optionalString("assets", getOptionValue(args, "assets")),
      ...optionalString("output", getOptionValue(args, "output"))
    });
    output.ok({
      chunkMap: result.chunkMap,
      coverage: result.coverage,
      assets: result.assets,
      output: result.output,
      phaseCount: result.phaseCount
    }, "Code usage analysis created.");
    return 0;
  } catch (error) {
    throw commandError({
      code: "CODE_USAGE_ANALYSIS_FAILED",
      kind: "validation",
      message: errorMessage(error)
    });
  }
}

export async function runCodeUsageReportCommand(
  args: ParsedCliArgs,
  output: Parameters<OpenRuntimeCommandDefinition["run"]>[0]["output"],
  opener: (path: string) => Promise<void> = openHtmlReport
): Promise<number> {
  if (args.command.length !== 3) {
    throw commandError({
      code: "ANALYSIS_REPORT_INPUT_REQUIRED",
      kind: "validation",
      message: "A code usage report JSON path is required.",
      hint: "Run `openruntime code-usage report <report.json>`."
    });
  }
  const inputPath = args.command[2];
  if (inputPath === undefined) throw new Error("Missing report input path.");
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
  output.ok({
    ...report,
    opened
  }, opened ? "Analysis report created and opened." : "Analysis report created.");
  return 0;
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
