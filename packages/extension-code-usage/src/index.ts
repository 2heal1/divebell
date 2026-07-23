import type {
  CliExtensionRunOptions,
  CommandErrorKind,
  ParsedCliArgs
} from "@openruntime/cli";

import { analyzeCodeUsageFiles } from "./code-usage.js";
import { cliText } from "./locale.js";
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
  if (action === "report") {
    return await runCodeUsageReportCommand(options.args);
  }
  if (action === "serve") {
    return await runCodeUsageServeCommand(options.args);
  }
  throw commandError({
    code: "CODE_USAGE_ACTION_INVALID",
    kind: "validation",
    message: t("code-usage requires analyze, report, or serve.", "code-usage 需要 analyze、report 或 serve。"),
    hint: t(
      "Run `openruntime code-usage analyze ...`, `openruntime code-usage report ...`, or `openruntime code-usage serve ...`.",
      "请运行 `openruntime code-usage analyze ...`、`openruntime code-usage report ...` 或 `openruntime code-usage serve ...`。"
    )
  });
}
export { analyzeCodeUsageFiles } from "./code-usage.js";
export { cliText, detectCliLocale } from "./locale.js";
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
      message: t(
        "Code usage analysis accepts options instead of positional paths.",
        "代码使用分析需要使用选项传入路径。"
      ),
      hint: t(
        "Run `openruntime code-usage analyze --chunk-map <path> --coverage <path>`.",
        "请运行 `openruntime code-usage analyze --chunk-map <路径> --coverage <路径>`。"
      )
    });
  }
  const chunkMap = requireOption(args, "chunk-map");
  const coverage = getOptionValues(args, "coverage");
  if (coverage.length === 0) {
    throw commandError({
      code: "CODE_USAGE_COVERAGE_REQUIRED",
      kind: "validation",
      message: t("At least one --coverage path is required.", "至少需要一个 --coverage 路径。"),
      hint: t(
        "Repeat --coverage for each recorded phase.",
        "每个记录阶段都需要重复传入 --coverage。"
      )
    });
  }

  try {
    const result = await analyzeCodeUsageFiles({
      chunkMap,
      coverage,
      ...optionalString("assets", getOptionValue(args, "assets")),
      ...optionalString("output", getOptionValue(args, "output"))
    });
    return {
      chunkMap: result.chunkMap,
      coverage: result.coverage,
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

export async function runCodeUsageReportCommand(
  args: ParsedCliArgs,
  opener: (path: string) => Promise<void> = openHtmlReport
): Promise<unknown> {
  if (args.command.length !== 3) {
    throw commandError({
      code: "ANALYSIS_REPORT_INPUT_REQUIRED",
      kind: "validation",
      message: t("A code usage report JSON path is required.", "需要提供代码使用报告 JSON 路径。"),
      hint: t(
        "Run `openruntime code-usage report <report.json>`.",
        "请运行 `openruntime code-usage report <report.json>`。"
      )
    });
  }
  const inputPath = args.command[2];
  if (inputPath === undefined) {
    throw new Error(t("Missing report input path.", "缺少报告输入路径。"));
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
        message: t(
          `The report was created but could not be opened: ${errorMessage(error)}`,
          `报告已生成，但无法自动打开：${errorMessage(error)}`
        ),
        hint: t(`Open ${report.htmlPath} manually.`, `请手动打开 ${report.htmlPath}。`)
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
      message: t("A code usage report JSON path is required.", "需要提供代码使用报告 JSON 路径。"),
      hint: t(
        "Run `openruntime code-usage serve <report.json>`.",
        "请运行 `openruntime code-usage serve <report.json>`。"
      )
    });
  }
  const inputPath = args.command[2];
  if (inputPath === undefined) {
    throw new Error(t("Missing report input path.", "缺少报告输入路径。"));
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
      message: t(
        `Missing required option "--${name}".`,
        `缺少必需选项“--${name}”。`
      )
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
      message: t(
        `Invalid report server port "${value}".`,
        `报告服务端口“${value}”无效。`
      )
    });
  }
  return port;
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

function t(english: string, chinese: string): string {
  return cliText(english, chinese);
}
