import { dirname, resolve } from "node:path";

// Framework-independent analysis; build plugins only produce its inputs.

import { matchOpenRuntimeChunk } from "./match.js";
import type {
  OpenRuntimeCodeUsageAsset,
  OpenRuntimeCodeUsageChunkResult,
  OpenRuntimeCodeUsageInput,
  OpenRuntimeCodeUsagePackageResult,
  OpenRuntimeCodeUsagePhaseResult,
  OpenRuntimeCodeUsageReport,
  OpenRuntimeCodeUsageSourceResult,
  OpenRuntimeCoverageRange,
  OpenRuntimeCoverageScript
} from "./coverage-types.js";
import type {
  OpenRuntimeChunkMapChunk,
  OpenRuntimeChunkMapModule,
  OpenRuntimeChunkMapModuleOwner
} from "./types.js";

interface OffsetRange {
  start: number;
  end: number;
}

interface MappedRange extends OffsetRange {
  sourcePath: string;
}

const BASE64_DIGITS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_VALUES = new Map([...BASE64_DIGITS].map((character, index) => [character, index]));

export function analyzeOpenRuntimeCodeUsage(
  input: OpenRuntimeCodeUsageInput
): OpenRuntimeCodeUsageReport {
  const assets = new Map(input.assets.map((asset) => [asset.file, asset]));
  return {
    schemaVersion: 1,
    buildId: input.chunkMap.buildId,
    phases: input.checkpoints.map((checkpoint, index) => analyzePhase(
      input,
      assets,
      checkpoint.scripts,
      checkpoint.label?.trim() || `checkpoint-${index + 1}`
    ))
  };
}

function analyzePhase(
  input: OpenRuntimeCodeUsageInput,
  assets: Map<string, OpenRuntimeCodeUsageAsset>,
  scripts: OpenRuntimeCoverageScript[],
  label: string
): OpenRuntimeCodeUsagePhaseResult {
  const chunkTotals = new Map<string, OpenRuntimeCodeUsageChunkResult>();
  const sourceTotals = new Map<string, OpenRuntimeCodeUsageSourceResult>();
  const unmatchedScriptUrls: string[] = [];
  const matchedScripts = new Map<string, {
    chunk: OpenRuntimeChunkMapChunk;
    asset: OpenRuntimeCodeUsageAsset;
    file: string;
    scripts: OpenRuntimeCoverageScript[];
  }>();

  for (const script of scripts) {
    if (script.url.length === 0) continue;
    const match = matchOpenRuntimeChunk(input.chunkMap, script.url, {
      expectedBuildId: input.chunkMap.buildId
    });
    if (match.status !== "matched") {
      if (isExternalJavaScriptUrl(script.url)) unmatchedScriptUrls.push(script.url);
      continue;
    }
    const asset = assets.get(match.asset.file);
    if (asset === undefined) {
      unmatchedScriptUrls.push(script.url);
      continue;
    }
    const key = `${match.chunk.id}\u0000${match.asset.file}`;
    const existing = matchedScripts.get(key);
    if (existing === undefined) {
      matchedScripts.set(key, {
        chunk: match.chunk,
        asset,
        file: match.asset.file,
        scripts: [script]
      });
    } else {
      existing.scripts.push(script);
    }
  }

  for (const entry of matchedScripts.values()) {
    const executedRanges = mergeRanges(entry.scripts.flatMap(createExecutedRanges));
    const mappedRanges = createMappedRanges(entry.asset);
    const byteOffsets = createByteOffsets(entry.asset.code);
    addChunkUsage(chunkTotals, entry.chunk, entry.file, mappedRanges, executedRanges, byteOffsets);
    addSourceUsage(sourceTotals, entry.chunk, mappedRanges, executedRanges, byteOffsets);
  }

  const sources = [...sourceTotals.values()]
    .map(withSourceRatio)
    .sort((left, right) => right.totalBytes - left.totalBytes || left.sourcePath.localeCompare(right.sourcePath));
  return {
    label,
    scriptsObserved: scripts.filter((script) => script.url.length > 0).length,
    unmatchedScriptUrls: [...new Set(unmatchedScriptUrls)].sort(),
    chunks: [...chunkTotals.values()]
      .map(withChunkRatio)
      .sort((left, right) => right.totalBytes - left.totalBytes || left.chunkId.localeCompare(right.chunkId)),
    sources,
    packages: createPackageUsage(sources)
  };
}

function createMappedRanges(asset: OpenRuntimeCodeUsageAsset): MappedRange[] {
  const lineStarts = createLineStarts(asset.code);
  const mappings = decodeMappings(asset.sourceMap.mappings);
  const result: MappedRange[] = [];
  for (let line = 0; line < mappings.length; line += 1) {
    const segments = mappings[line] ?? [];
    const lineStart = lineStarts[line];
    if (lineStart === undefined) continue;
    const lineEnd = lineStarts[line + 1] ?? asset.code.length;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      if (segment === undefined || segment.sourceIndex === null) continue;
      const source = asset.sourceMap.sources[segment.sourceIndex];
      if (source === undefined) continue;
      const nextColumn = segments[index + 1]?.generatedColumn ?? (lineEnd - lineStart);
      const start = Math.min(lineEnd, lineStart + segment.generatedColumn);
      const end = Math.min(lineEnd, lineStart + nextColumn);
      if (end <= start) continue;
      result.push({
        sourcePath: resolveSourcePath(asset, source),
        start,
        end
      });
    }
  }
  return result;
}

function addChunkUsage(
  totals: Map<string, OpenRuntimeCodeUsageChunkResult>,
  chunk: OpenRuntimeChunkMapChunk,
  file: string,
  mappedRanges: MappedRange[],
  executedRanges: OffsetRange[],
  byteOffsets: number[]
): void {
  const totalBytes = mappedRanges.reduce((sum, range) => sum + rangeByteSize(range, byteOffsets), 0);
  const usedBytes = mappedRanges.reduce(
    (sum, range) => sum + intersectionByteSize(range, executedRanges, byteOffsets),
    0
  );
  const existing = totals.get(chunk.id);
  if (existing === undefined) {
    totals.set(chunk.id, {
      chunkId: chunk.id,
      files: [file],
      initial: chunk.initial,
      totalBytes,
      usedBytes,
      usedRatio: null
    });
    return;
  }
  if (!existing.files.includes(file)) existing.files.push(file);
  existing.totalBytes += totalBytes;
  existing.usedBytes += usedBytes;
}

function addSourceUsage(
  totals: Map<string, OpenRuntimeCodeUsageSourceResult>,
  chunk: OpenRuntimeChunkMapChunk,
  mappedRanges: MappedRange[],
  executedRanges: OffsetRange[],
  byteOffsets: number[]
): void {
  for (const range of mappedRanges) {
    const module = findModule(chunk.modules, range.sourcePath);
    const key = `${range.sourcePath}\u0000${module?.owner.packageName ?? ""}`;
    let existing = totals.get(key);
    if (existing === undefined) {
      existing = {
        sourcePath: range.sourcePath,
        owner: module?.owner ?? unknownOwner(),
        chunkIds: [],
        totalBytes: 0,
        usedBytes: 0,
        usedRatio: null
      };
      totals.set(key, existing);
    }
    if (!existing.chunkIds.includes(chunk.id)) existing.chunkIds.push(chunk.id);
    existing.totalBytes += rangeByteSize(range, byteOffsets);
    existing.usedBytes += intersectionByteSize(range, executedRanges, byteOffsets);
  }
}

function createPackageUsage(
  sources: OpenRuntimeCodeUsageSourceResult[]
): OpenRuntimeCodeUsagePackageResult[] {
  const totals = new Map<string, OpenRuntimeCodeUsagePackageResult>();
  for (const source of sources) {
    const packageName = source.owner.packageName ?? fallbackPackageName(source);
    const key = `${source.owner.kind}\u0000${packageName}\u0000${source.owner.packageVersion ?? ""}`;
    let existing = totals.get(key);
    if (existing === undefined) {
      existing = {
        kind: source.owner.kind,
        packageName,
        packageVersion: source.owner.packageVersion,
        chunkIds: [],
        sourceCount: 0,
        totalBytes: 0,
        usedBytes: 0,
        usedRatio: null
      };
      totals.set(key, existing);
    }
    existing.sourceCount += 1;
    existing.totalBytes += source.totalBytes;
    existing.usedBytes += source.usedBytes;
    for (const chunkId of source.chunkIds) {
      if (!existing.chunkIds.includes(chunkId)) existing.chunkIds.push(chunkId);
    }
  }
  return [...totals.values()]
    .map((item) => ({
      ...item,
      chunkIds: item.chunkIds.sort(),
      usedRatio: ratio(item.usedBytes, item.totalBytes)
    }))
    .sort((left, right) => right.totalBytes - left.totalBytes || left.packageName.localeCompare(right.packageName));
}

function findModule(
  modules: OpenRuntimeChunkMapModule[],
  sourcePath: string
): OpenRuntimeChunkMapModule | undefined {
  const normalizedSource = normalizePath(sourcePath);
  return modules.find((module) => module.sourcePath !== null && normalizePath(module.sourcePath) === normalizedSource)
    ?? modules.find((module) => {
      if (module.sourcePath === null) return false;
      const modulePath = normalizePath(module.sourcePath);
      return normalizedSource.endsWith(modulePath) || modulePath.endsWith(normalizedSource);
    });
}

function resolveSourcePath(asset: OpenRuntimeCodeUsageAsset, source: string): string {
  const sourceRoot = asset.sourceMap.sourceRoot ?? "";
  const value = `${sourceRoot}${source}`.replace(/^webpack:\/\/+/, "");
  return normalizePath(resolve(dirname(asset.sourceMapPath), value));
}

function createLineStarts(code: string): number[] {
  const result = [0];
  for (let index = 0; index < code.length; index += 1) {
    if (code.charCodeAt(index) === 10) result.push(index + 1);
  }
  return result;
}

function normalizeCoverageRange(range: OpenRuntimeCoverageRange): OffsetRange | null {
  if (!Number.isFinite(range.startOffset) || !Number.isFinite(range.endOffset)) return null;
  const start = Math.max(0, Math.trunc(range.startOffset));
  const end = Math.max(start, Math.trunc(range.endOffset));
  return end > start ? { start, end } : null;
}

function createExecutedRanges(script: OpenRuntimeCoverageScript): OffsetRange[] {
  const coverageRanges = script.functions.flatMap((fn) => fn.ranges)
    .map((range) => ({ range: normalizeCoverageRange(range), count: range.count }))
    .filter((item): item is { range: OffsetRange; count: number } => item.range !== null);
  const boundaries = [...new Set(coverageRanges.flatMap(({ range }) => [range.start, range.end]))]
    .sort((left, right) => left - right);
  const result: OffsetRange[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (start === undefined || end === undefined || end <= start) continue;
    const controlling = coverageRanges
      .filter(({ range }) => range.start <= start && range.end >= end)
      .sort((left, right) =>
        (left.range.end - left.range.start) - (right.range.end - right.range.start)
      )[0];
    if (controlling !== undefined && controlling.count > 0) result.push({ start, end });
  }
  return mergeRanges(result);
}

function mergeRanges(ranges: OffsetRange[]): OffsetRange[] {
  const sorted = ranges.slice().sort((left, right) => left.start - right.start || left.end - right.end);
  const result: OffsetRange[] = [];
  for (const range of sorted) {
    const previous = result.at(-1);
    if (previous === undefined || range.start > previous.end) {
      result.push({ ...range });
    } else {
      previous.end = Math.max(previous.end, range.end);
    }
  }
  return result;
}

function intersectionByteSize(
  range: OffsetRange,
  executedRanges: OffsetRange[],
  byteOffsets: number[]
): number {
  let total = 0;
  for (const executed of executedRanges) {
    if (executed.end <= range.start) continue;
    if (executed.start >= range.end) break;
    const start = Math.max(range.start, executed.start);
    const end = Math.min(range.end, executed.end);
    if (end > start) total += (byteOffsets[end] ?? 0) - (byteOffsets[start] ?? 0);
  }
  return total;
}

function rangeByteSize(range: OffsetRange, byteOffsets: number[]): number {
  return (byteOffsets[range.end] ?? 0) - (byteOffsets[range.start] ?? 0);
}

function createByteOffsets(code: string): number[] {
  const result = new Array<number>(code.length + 1).fill(0);
  let codeUnitOffset = 0;
  let byteOffset = 0;
  for (const character of code) {
    const width = character.length;
    const nextByteOffset = byteOffset + Buffer.byteLength(character, "utf8");
    for (let index = 1; index <= width; index += 1) {
      result[codeUnitOffset + index] = index === width ? nextByteOffset : byteOffset;
    }
    codeUnitOffset += width;
    byteOffset = nextByteOffset;
  }
  return result;
}

interface DecodedSegment {
  generatedColumn: number;
  sourceIndex: number | null;
}

function decodeMappings(mappings: string): DecodedSegment[][] {
  const lines: DecodedSegment[][] = [];
  let sourceIndex = 0;
  for (const encodedLine of mappings.split(";")) {
    const line: DecodedSegment[] = [];
    let generatedColumn = 0;
    for (const encodedSegment of encodedLine.split(",")) {
      if (encodedSegment.length === 0) continue;
      const values = decodeVlq(encodedSegment);
      generatedColumn += values[0] ?? 0;
      if (values.length >= 4) sourceIndex += values[1] ?? 0;
      line.push({
        generatedColumn,
        sourceIndex: values.length >= 4 ? sourceIndex : null
      });
    }
    lines.push(line);
  }
  return lines;
}

function decodeVlq(value: string): number[] {
  const result: number[] = [];
  let current = 0;
  let shift = 0;
  for (const character of value) {
    const digit = BASE64_VALUES.get(character);
    if (digit === undefined) throw new Error(`Invalid source map VLQ digit: ${character}`);
    current += (digit & 31) << shift;
    if ((digit & 32) !== 0) {
      shift += 5;
      continue;
    }
    const negative = (current & 1) === 1;
    const decoded = current >> 1;
    result.push(negative ? -decoded : decoded);
    current = 0;
    shift = 0;
  }
  if (shift !== 0) throw new Error("Incomplete source map VLQ value.");
  return result;
}

function withSourceRatio(source: OpenRuntimeCodeUsageSourceResult): OpenRuntimeCodeUsageSourceResult {
  return {
    ...source,
    chunkIds: source.chunkIds.sort(),
    usedRatio: ratio(source.usedBytes, source.totalBytes)
  };
}

function withChunkRatio(chunk: OpenRuntimeCodeUsageChunkResult): OpenRuntimeCodeUsageChunkResult {
  return {
    ...chunk,
    files: chunk.files.sort(),
    usedRatio: ratio(chunk.usedBytes, chunk.totalBytes)
  };
}

function ratio(usedBytes: number, totalBytes: number): number | null {
  return totalBytes === 0 ? null : usedBytes / totalBytes;
}

function fallbackPackageName(source: OpenRuntimeCodeUsageSourceResult): string {
  return source.owner.kind === "application" ? "(application)" : "(unmatched)";
}

function unknownOwner(): OpenRuntimeChunkMapModuleOwner {
  return {
    kind: "unknown",
    packageName: null,
    packageVersion: null,
    packageSubpath: null
  };
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}

function isExternalJavaScriptUrl(value: string): boolean {
  try {
    return /\.(?:m?js)$/i.test(new URL(value).pathname);
  } catch {
    return /\.(?:m?js)(?:[?#]|$)/i.test(value);
  }
}
