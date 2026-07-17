import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPORT_DATA_PLACEHOLDER = "__OPENRUNTIME_REPORT_DATA__";

import type { CodeUsageReportWriteOptions, CodeUsageReportWriteResult } from "./types.js";
export type { CodeUsageReportWriteOptions, CodeUsageReportWriteResult, HtmlReportOpener } from "./types.js";

export async function writeCodeUsageReportHtml(
  options: CodeUsageReportWriteOptions
): Promise<CodeUsageReportWriteResult> {
  const inputPath = resolve(options.inputPath);
  const report = await readCodeUsageReport(inputPath);
  const htmlPath = resolve(options.outputPath ?? defaultHtmlPath(inputPath));
  const html = await createCodeUsageReportHtml(report);
  await mkdir(dirname(htmlPath), { recursive: true });
  await writeFile(htmlPath, html, "utf8");
  return {
    inputPath,
    htmlPath,
    phaseCount: getUsagePhases(report).length
  };
}

export async function createCodeUsageReportHtml(report: unknown): Promise<string> {
  getUsagePhases(report);
  const template = await readReportTemplate();
  if (!template.includes(REPORT_DATA_PLACEHOLDER)) {
    throw new Error("The code usage report template is missing its data placeholder.");
  }
  return template.replace(REPORT_DATA_PLACEHOLDER, serializeInlineJson(report));
}

async function readReportTemplate(): Promise<string> {
  const candidates = [
    fileURLToPath(new URL("../../../assets/code-usage-report.html", import.meta.url)),
    resolve(process.cwd(), "assets/code-usage-report.html"),
    resolve(process.cwd(), "packages/cli/assets/code-usage-report.html")
  ];
  for (const path of new Set(candidates)) {
    try {
      return await readFile(path, "utf8");
    } catch {
      // Try the next package layout. Rstest relocates compiled modules.
    }
  }
  throw new Error("Cannot locate the code usage report template.");
}

export async function openHtmlReport(htmlPath: string): Promise<void> {
  const absolutePath = resolve(htmlPath);
  if (process.platform === "darwin") {
    await execFileAsync("open", [absolutePath]);
    return;
  }
  if (process.platform === "win32") {
    await execFileAsync("cmd", ["/c", "start", "", absolutePath]);
    return;
  }
  await execFileAsync("xdg-open", [absolutePath]);
}

async function readCodeUsageReport(path: string): Promise<unknown> {
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`Cannot read analysis report ${path}: ${errorMessage(error)}`);
  }
  try {
    const report: unknown = JSON.parse(source);
    getUsagePhases(report);
    return report;
  } catch (error) {
    throw new Error(`Invalid code usage report ${path}: ${errorMessage(error)}`);
  }
}

function getUsagePhases(report: unknown): unknown[] {
  if (!isRecord(report)) {
    throw new Error("The report root must be an object.");
  }
  const usage = isRecord(report.usage) ? report.usage : report;
  if (!Array.isArray(usage.phases) || usage.phases.length === 0) {
    throw new Error("The report must contain at least one usage phase.");
  }
  for (const [index, phase] of usage.phases.entries()) {
    if (!isRecord(phase)) {
      throw new Error(`Usage phase ${index + 1} must be an object.`);
    }
    if (!Array.isArray(phase.packages) || !Array.isArray(phase.sources) || !Array.isArray(phase.chunks)) {
      throw new Error(`Usage phase ${index + 1} is missing packages, sources, or chunks.`);
    }
  }
  return usage.phases;
}

function defaultHtmlPath(inputPath: string): string {
  const extension = extname(inputPath);
  return extension.length === 0
    ? `${inputPath}.html`
    : `${inputPath.slice(0, -extension.length)}.html`;
}

function serializeInlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
