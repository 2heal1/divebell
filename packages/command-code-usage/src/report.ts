import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { CodeUsageReportWriteOptions, CodeUsageReportWriteResult } from "./types.js";

const execFileAsync = promisify(execFile);
const REPORT_DATA_PLACEHOLDER = "__OPENRUNTIME_REPORT_DATA__";
const REPORT_DATA_HREF_PLACEHOLDER = "__OPENRUNTIME_REPORT_DATA_HREF__";
const REPORT_DATA_MODE_PLACEHOLDER = "__OPENRUNTIME_REPORT_DATA_MODE__";
const CODE_FILE_DATA_PLACEHOLDER = "__OPENRUNTIME_CODE_FILE_DATA__";
const CODE_FILE_DATA_HREF_PLACEHOLDER = "__OPENRUNTIME_CODE_FILE_DATA_HREF__";
const CODE_FILE_DATA_MODE_PLACEHOLDER = "__OPENRUNTIME_CODE_FILE_DATA_MODE__";
const CODE_VIEWER_PART_LENGTH = 2 * 1024 * 1024;

interface CodeFileSource {
  file: string;
  code: string;
  totalBytes: number;
}

interface ExecutedRange {
  startOffset: number;
  endOffset: number;
}

interface CodeFilePhase {
  label: string;
  totalBytes: number;
  usedBytes: number;
  usedRatio: number | null;
  executedRanges: ExecutedRange[];
  sources: CodeFileSourceRange[];
}

interface CodeFileSourceRange {
  sourcePath: string;
  totalBytes: number;
  usedBytes: number;
  usedRatio: number | null;
  mappedRanges: ExecutedRange[];
  executedRanges: ExecutedRange[];
}

interface CodeViewerLink {
  file: string;
  href: string;
  chunkIds: string[];
  totalBytes: number;
  partCount: number;
}

interface CodeViewerData {
  file: string;
  code: string;
  totalBytes: number;
  partIndex: number;
  partCount: number;
  partStartOffset: number;
  partEndOffset: number;
  reportHref: string;
  previousHref: string | null;
  nextHref: string | null;
  phases: CodeFilePhase[];
}

export type { CodeUsageReportWriteOptions, CodeUsageReportWriteResult, HtmlReportOpener } from "./types.js";

export async function writeCodeUsageReportHtml(
  options: CodeUsageReportWriteOptions
): Promise<CodeUsageReportWriteResult> {
  const inputPath = resolve(options.inputPath);
  const report = await readCodeUsageReport(inputPath);
  const htmlPath = resolve(options.outputPath ?? defaultHtmlPath(inputPath));
  const viewer = await createCodeViewerPages(report, htmlPath);
  const extension = extname(htmlPath);
  const reportStem = basename(htmlPath, extension);
  const dataFilename = `${reportStem}-data.js`;
  const html = await createCodeUsageReportHtml(report, viewer.links, {
    dataHref: `./${encodeURIComponent(dataFilename)}`,
    dataMode: "script"
  });
  const reportData = withoutEmbeddedCode(report, viewer.links);
  await mkdir(dirname(htmlPath), { recursive: true });
  await writeFile(
    resolve(dirname(htmlPath), dataFilename),
    createDeferredDataScript("__OPENRUNTIME_RENDER_REPORT__", reportData),
    "utf8"
  );
  await writeFile(htmlPath, html, "utf8");
  return {
    inputPath,
    htmlPath,
    phaseCount: getUsagePhases(report).length,
    codeFileCount: viewer.links.length,
    codeViewerPageCount: viewer.pageCount,
    ...(viewer.codeDirectory === undefined ? {} : { codeDirectory: viewer.codeDirectory })
  };
}

export async function createCodeUsageReportHtml(
  report: unknown,
  codeViewers: CodeViewerLink[] = [],
  dataSource?: { dataHref: string; dataMode: "script" | "stream" }
): Promise<string> {
  getUsagePhases(report);
  const template = await readAssetTemplate("code-usage-report.html");
  if (
    !template.includes(REPORT_DATA_PLACEHOLDER)
    || !template.includes(REPORT_DATA_HREF_PLACEHOLDER)
    || !template.includes(REPORT_DATA_MODE_PLACEHOLDER)
  ) {
    throw new Error("The code usage report template is missing a data placeholder.");
  }
  return template
    .replace(
      REPORT_DATA_PLACEHOLDER,
      dataSource === undefined
        ? serializeInlineJson(withoutEmbeddedCode(report, codeViewers))
        : "{}"
    )
    .replace(REPORT_DATA_HREF_PLACEHOLDER, serializeInlineJson(dataSource?.dataHref ?? null))
    .replace(REPORT_DATA_MODE_PLACEHOLDER, serializeInlineJson(dataSource?.dataMode ?? "inline"));
}

export async function createCodeUsageStreamReportHtml(
  report: unknown,
  codeViewers: CodeViewerLink[],
  dataHref: string
): Promise<string> {
  return await createCodeUsageReportHtml(report, codeViewers, {
    dataHref,
    dataMode: "stream"
  });
}

export async function createCodeUsageStreamFileHtml(dataHref: string): Promise<string> {
  const template = await readAssetTemplate("code-usage-file.html");
  if (
    !template.includes(CODE_FILE_DATA_PLACEHOLDER)
    || !template.includes(CODE_FILE_DATA_HREF_PLACEHOLDER)
    || !template.includes(CODE_FILE_DATA_MODE_PLACEHOLDER)
  ) {
    throw new Error("The code usage file template is missing a data placeholder.");
  }
  return template
    .replace(CODE_FILE_DATA_PLACEHOLDER, "{}")
    .replace(CODE_FILE_DATA_HREF_PLACEHOLDER, serializeInlineJson(dataHref))
    .replace(CODE_FILE_DATA_MODE_PLACEHOLDER, serializeInlineJson("stream"));
}

async function readAssetTemplate(filename: string): Promise<string> {
  const candidates = [
    fileURLToPath(new URL(`../assets/${filename}`, import.meta.url)),
    resolve(process.cwd(), `assets/${filename}`),
    resolve(process.cwd(), `packages/command-code-usage/assets/${filename}`)
  ];
  for (const path of new Set(candidates)) {
    try {
      return await readFile(path, "utf8");
    } catch {
      // Try the next package layout. Rstest relocates compiled modules.
    }
  }
  throw new Error(`Cannot locate the code usage report asset ${filename}.`);
}

async function createCodeViewerPages(
  report: unknown,
  htmlPath: string
): Promise<{
  links: CodeViewerLink[];
  pageCount: number;
  codeDirectory?: string;
}> {
  const codeFiles = getCodeFiles(report);
  if (codeFiles.length === 0) return { links: [], pageCount: 0 };
  const template = await readAssetTemplate("code-usage-file.html");
  if (
    !template.includes(CODE_FILE_DATA_PLACEHOLDER)
    || !template.includes(CODE_FILE_DATA_HREF_PLACEHOLDER)
    || !template.includes(CODE_FILE_DATA_MODE_PLACEHOLDER)
  ) {
    throw new Error("The code usage file template is missing a data placeholder.");
  }
  const extension = extname(htmlPath);
  const reportStem = basename(htmlPath, extension);
  const codeDirectory = resolve(dirname(htmlPath), `${reportStem}-code`);
  const relativeDirectory = encodeURIComponent(basename(codeDirectory));
  const reportHref = `../${encodeURIComponent(basename(htmlPath))}`;
  const phaseRecords = getUsagePhases(report).filter(isRecord);
  const links: CodeViewerLink[] = [];
  let pageCount = 0;
  await mkdir(codeDirectory, { recursive: true });

  for (const source of codeFiles) {
    const phases = getCodeFilePhases(phaseRecords, source.file, source.totalBytes);
    if (phases.length === 0) continue;
    const chunkIds = getCodeFileChunkIds(phaseRecords, source.file);
    const partOffsets = createCodePartOffsets(source.code);
    const partCount = partOffsets.length - 1;
    const digest = createHash("sha256").update(source.file).digest("hex").slice(0, 12);
    const filenames = Array.from({ length: partCount }, (_, index) =>
      `${digest}-part-${index + 1}.html`);
    const dataFilenames = Array.from({ length: partCount }, (_, index) =>
      `${digest}-part-${index + 1}-data.js`);
    links.push({
      file: source.file,
      href: `./${relativeDirectory}/${filenames[0]}`,
      chunkIds,
      totalBytes: source.totalBytes,
      partCount
    });

    for (let index = 0; index < partCount; index += 1) {
      const partStartOffset = partOffsets[index] ?? 0;
      const partEndOffset = partOffsets[index + 1] ?? source.code.length;
      const data: CodeViewerData = {
        file: source.file,
        code: source.code.slice(partStartOffset, partEndOffset),
        totalBytes: source.totalBytes,
        partIndex: index,
        partCount,
        partStartOffset,
        partEndOffset,
        reportHref,
        previousHref: index === 0 ? null : filenames[index - 1] ?? null,
        nextHref: index + 1 === partCount ? null : filenames[index + 1] ?? null,
        phases: phases.map((phase) => ({
          ...phase,
          executedRanges: clipExecutedRanges(
            phase.executedRanges,
            partStartOffset,
            partEndOffset
          ),
          sources: phase.sources.map((sourceRange) => ({
            ...sourceRange,
            mappedRanges: clipExecutedRanges(
              sourceRange.mappedRanges,
              partStartOffset,
              partEndOffset
            ),
            executedRanges: clipExecutedRanges(
              sourceRange.executedRanges,
              partStartOffset,
              partEndOffset
            )
          }))
        }))
      };
      const dataFilename = dataFilenames[index] ?? `${digest}-data.js`;
      const html = template
        .replace(CODE_FILE_DATA_PLACEHOLDER, "{}")
        .replace(CODE_FILE_DATA_HREF_PLACEHOLDER, serializeInlineJson(`./${dataFilename}`))
        .replace(CODE_FILE_DATA_MODE_PLACEHOLDER, serializeInlineJson("script"));
      await writeFile(resolve(codeDirectory, filenames[index] ?? `${digest}.html`), html, "utf8");
      await writeFile(
        resolve(codeDirectory, dataFilename),
        createDeferredDataScript("__OPENRUNTIME_RENDER_CODE_FILE__", data),
        "utf8"
      );
      pageCount += 1;
    }
  }

  return {
    links,
    pageCount,
    ...(links.length === 0 ? {} : { codeDirectory })
  };
}

function createDeferredDataScript(callbackName: string, data: unknown): string {
  return `globalThis.${callbackName}(${serializeInlineJson(data)});\n`;
}

function createCodePartOffsets(code: string): number[] {
  const offsets = [0];
  while ((offsets.at(-1) ?? 0) < code.length) {
    const start = offsets.at(-1) ?? 0;
    let end = Math.min(code.length, start + CODE_VIEWER_PART_LENGTH);
    if (
      end < code.length
      && end > start
      && isHighSurrogate(code.charCodeAt(end - 1))
      && isLowSurrogate(code.charCodeAt(end))
    ) {
      end -= 1;
    }
    offsets.push(end);
  }
  if (offsets.length === 1) offsets.push(0);
  return offsets;
}

function isHighSurrogate(value: number): boolean {
  return value >= 0xD800 && value <= 0xDBFF;
}

function isLowSurrogate(value: number): boolean {
  return value >= 0xDC00 && value <= 0xDFFF;
}

function withoutEmbeddedCode(report: unknown, codeViewers: CodeViewerLink[]): unknown {
  if (!isRecord(report)) return report;
  if (isRecord(report.usage)) {
    return {
      ...report,
      usage: withoutEmbeddedCodeFromUsage(report.usage, codeViewers)
    };
  }
  return withoutEmbeddedCodeFromUsage(report, codeViewers);
}

function withoutEmbeddedCodeFromUsage(
  usage: Record<string, unknown>,
  codeViewers: CodeViewerLink[]
): Record<string, unknown> {
  const { codeFiles: _codeFiles, ...rest } = usage;
  return {
    ...rest,
    phases: Array.isArray(usage.phases)
      ? usage.phases.map((phase) => {
        if (!isRecord(phase)) return phase;
        const { codeFiles: _phaseCodeFiles, ...phaseRest } = phase;
        return phaseRest;
      })
      : usage.phases,
    codeViewers
  };
}

function getCodeFiles(report: unknown): CodeFileSource[] {
  if (!isRecord(report)) return [];
  const usage = isRecord(report.usage) ? report.usage : report;
  if (!Array.isArray(usage.codeFiles)) return [];
  return usage.codeFiles.flatMap((item) => {
    if (!isRecord(item) || typeof item.file !== "string" || typeof item.code !== "string") return [];
    return [{
      file: item.file,
      code: item.code,
      totalBytes: finiteNumber(item.totalBytes) ?? Buffer.byteLength(item.code, "utf8")
    }];
  });
}

function getCodeFilePhases(
  phases: Record<string, unknown>[],
  file: string,
  fallbackTotalBytes: number
): CodeFilePhase[] {
  return phases.flatMap((phase) => {
    if (!Array.isArray(phase.codeFiles)) return [];
    const result = phase.codeFiles.find((item) => isRecord(item) && item.file === file);
    if (!isRecord(result)) return [];
    return [{
      label: typeof phase.label === "string" ? phase.label : "",
      totalBytes: finiteNumber(result.totalBytes) ?? fallbackTotalBytes,
      usedBytes: finiteNumber(result.usedBytes) ?? 0,
      usedRatio: finiteNumber(result.usedRatio),
      executedRanges: Array.isArray(result.executedRanges)
        ? result.executedRanges.flatMap(normalizeExecutedRange)
        : [],
      sources: getSourceRangesForFile(phase, file)
    }];
  });
}

function getSourceRangesForFile(
  phase: Record<string, unknown>,
  file: string
): CodeFileSourceRange[] {
  if (!Array.isArray(phase.sources)) return [];
  return phase.sources.flatMap((source) => {
    if (!isRecord(source) || typeof source.sourcePath !== "string" || !Array.isArray(source.fileRanges)) {
      return [];
    }
    const fileRange = source.fileRanges.find((item) => isRecord(item) && item.file === file);
    if (!isRecord(fileRange)) return [];
    return [{
      sourcePath: source.sourcePath,
      totalBytes: finiteNumber(source.totalBytes) ?? 0,
      usedBytes: finiteNumber(source.usedBytes) ?? 0,
      usedRatio: finiteNumber(source.usedRatio),
      mappedRanges: Array.isArray(fileRange.mappedRanges)
        ? fileRange.mappedRanges.flatMap(normalizeExecutedRange)
        : [],
      executedRanges: Array.isArray(fileRange.executedRanges)
        ? fileRange.executedRanges.flatMap(normalizeExecutedRange)
        : []
    }];
  });
}

function getCodeFileChunkIds(phases: Record<string, unknown>[], file: string): string[] {
  const result = new Set<string>();
  for (const phase of phases) {
    if (!Array.isArray(phase.codeFiles)) continue;
    const codeFile = phase.codeFiles.find((item) => isRecord(item) && item.file === file);
    if (!isRecord(codeFile) || !Array.isArray(codeFile.chunkIds)) continue;
    for (const chunkId of codeFile.chunkIds) {
      if (typeof chunkId === "string") result.add(chunkId);
    }
  }
  return [...result].sort();
}

function normalizeExecutedRange(value: unknown): ExecutedRange[] {
  if (!isRecord(value)) return [];
  const startOffset = finiteNumber(value.startOffset);
  const endOffset = finiteNumber(value.endOffset);
  if (startOffset === null || endOffset === null || endOffset <= startOffset) return [];
  return [{ startOffset: Math.max(0, Math.trunc(startOffset)), endOffset: Math.max(0, Math.trunc(endOffset)) }];
}

function clipExecutedRanges(
  ranges: ExecutedRange[],
  partStartOffset: number,
  partEndOffset: number
): ExecutedRange[] {
  return ranges.flatMap((range) => {
    const startOffset = Math.max(partStartOffset, range.startOffset);
    const endOffset = Math.min(partEndOffset, range.endOffset);
    return endOffset <= startOffset
      ? []
      : [{
        startOffset: startOffset - partStartOffset,
        endOffset: endOffset - partStartOffset
      }];
  });
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

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
