import { dirname, resolve } from "node:path";

// Framework-independent analysis; build plugins only produce its inputs.

import { matchDivebellChunk } from "./match.js";
import type {
  DivebellCodeUsageAsset,
  DivebellCodeUsageChunkResult,
  DivebellCodeUsageCodeFileResult,
  DivebellCodeUsageInput,
  DivebellCodeUsagePackageResult,
  DivebellCodeUsagePhaseResult,
  DivebellCodeUsageReport,
  DivebellCodeUsageSourceResult,
  DivebellCodeUsageUnmatchedScript,
  DivebellCoverageRange,
  DivebellCoverageScript
} from "./coverage-types.js";
import type {
  DivebellChunkMapChunk,
  DivebellChunkMapModule,
  DivebellChunkMapModuleOwner
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

export function analyzeDivebellCodeUsage(
  input: DivebellCodeUsageInput
): DivebellCodeUsageReport {
  const assets = new Map(input.assets.map((asset) => [asset.file, asset]));
  const phases = input.checkpoints.map((checkpoint, index) => analyzePhase(
    input,
    assets,
    checkpoint.scripts,
    checkpoint.label?.trim() || `checkpoint-${index + 1}`
  ));
  const observedCodeFiles = new Set(phases.flatMap((phase) =>
    (phase.codeFiles ?? []).map((file) => file.file)));
  return {
    schemaVersion: 1,
    buildId: input.chunkMap.buildId,
    phases,
    codeFiles: input.assets
      .filter((asset) => observedCodeFiles.has(asset.file))
      .map((asset) => ({
        file: asset.file,
        code: asset.code,
        totalBytes: Buffer.byteLength(asset.code, "utf8")
      }))
      .sort((left, right) => left.file.localeCompare(right.file))
  };
}

function analyzePhase(
  input: DivebellCodeUsageInput,
  assets: Map<string, DivebellCodeUsageAsset>,
  scripts: DivebellCoverageScript[],
  label: string
): DivebellCodeUsagePhaseResult {
  const chunkTotals = new Map<string, DivebellCodeUsageChunkResult>();
  const sourceTotals = new Map<string, DivebellCodeUsageSourceResult>();
  const codeFileTotals = new Map<string, DivebellCodeUsageCodeFileResult>();
  const unmatchedScriptUrls: string[] = [];
  const unmatchedScripts: DivebellCodeUsageUnmatchedScript[] = [];
  const matchedScriptGroups = new Map<string, {
    chunk: DivebellChunkMapChunk;
    asset: DivebellCodeUsageAsset;
    file: string;
    scripts: DivebellCoverageScript[];
  }>();
  let scriptsMatched = 0;

  for (const script of scripts) {
    if (script.url.length === 0) continue;
    const match = matchDivebellChunk(input.chunkMap, script.url, {
      expectedBuildId: input.chunkMap.buildId
    });
    if (match.status !== "matched") {
      unmatchedScriptUrls.push(script.url);
      unmatchedScripts.push({
        scriptId: script.scriptId,
        url: script.url,
        category: classifyUnmatchedScript(script.url),
        reason: match.status
      });
      continue;
    }
    const asset = assets.get(match.asset.file);
    if (asset === undefined) {
      unmatchedScriptUrls.push(script.url);
      unmatchedScripts.push({
        scriptId: script.scriptId,
        url: script.url,
        category: classifyUnmatchedScript(script.url),
        reason: "asset-unavailable"
      });
      continue;
    }
    scriptsMatched += 1;
    const key = `${match.chunk.id}\u0000${match.asset.file}`;
    const existing = matchedScriptGroups.get(key);
    if (existing === undefined) {
      matchedScriptGroups.set(key, {
        chunk: match.chunk,
        asset,
        file: match.asset.file,
        scripts: [script]
      });
    } else {
      existing.scripts.push(script);
    }
  }

  for (const entry of matchedScriptGroups.values()) {
    const executedRanges = mergeRanges(entry.scripts.flatMap(createExecutedRanges));
    const mappedRanges = createMappedRanges(entry.asset);
    const byteOffsets = createByteOffsets(entry.asset.code);
    addChunkUsage(
      chunkTotals,
      entry.chunk,
      entry.file,
      entry.asset.code.length,
      mappedRanges,
      executedRanges,
      byteOffsets
    );
    addSourceUsage(sourceTotals, entry.chunk, entry.file, mappedRanges, executedRanges, byteOffsets);
    addCodeFileUsage(
      codeFileTotals,
      entry.chunk,
      entry.file,
      entry.asset.code.length,
      executedRanges,
      byteOffsets
    );
  }

  const sources = [...sourceTotals.values()]
    .map(withSourceRatio)
    .sort((left, right) => right.totalBytes - left.totalBytes || left.sourcePath.localeCompare(right.sourcePath));
  return {
    label,
    scriptsCaptured: scripts.length,
    scriptsObserved: scripts.filter((script) => script.url.length > 0).length,
    scriptsMatched,
    scriptsWithoutUrl: scripts.filter((script) => script.url.length === 0).length,
    unmatchedScriptUrls: [...new Set(unmatchedScriptUrls)].sort(),
    unmatchedScripts: unmatchedScripts.sort((left, right) =>
      left.url.localeCompare(right.url) || left.scriptId.localeCompare(right.scriptId)),
    chunks: [...chunkTotals.values()]
      .map(withChunkRatio)
      .sort((left, right) => right.totalBytes - left.totalBytes || left.chunkId.localeCompare(right.chunkId)),
    sources,
    packages: createPackageUsage(sources),
    codeFiles: [...codeFileTotals.values()]
      .sort((left, right) => right.totalBytes - left.totalBytes || left.file.localeCompare(right.file))
  };
}

function addCodeFileUsage(
  totals: Map<string, DivebellCodeUsageCodeFileResult>,
  chunk: DivebellChunkMapChunk,
  file: string,
  codeLength: number,
  executedRanges: OffsetRange[],
  byteOffsets: number[]
): void {
  const existing = totals.get(file);
  const mergedRanges = mergeRanges([
    ...(existing?.executedRanges.map((range) => ({
      start: range.startOffset,
      end: range.endOffset
    })) ?? []),
    ...executedRanges
  ]);
  const totalBytes = byteOffsets[codeLength] ?? 0;
  const usedBytes = intersectionByteSize(
    { start: 0, end: codeLength },
    mergedRanges,
    byteOffsets
  );
  totals.set(file, {
    file,
    chunkIds: [...new Set([...(existing?.chunkIds ?? []), chunk.id])].sort(),
    totalBytes,
    usedBytes,
    usedRatio: ratio(usedBytes, totalBytes),
    executedRanges: mergedRanges.map((range) => ({
      startOffset: range.start,
      endOffset: range.end
    }))
  });
}

function createMappedRanges(asset: DivebellCodeUsageAsset): MappedRange[] {
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
  totals: Map<string, DivebellCodeUsageChunkResult>,
  chunk: DivebellChunkMapChunk,
  file: string,
  codeLength: number,
  mappedRanges: MappedRange[],
  executedRanges: OffsetRange[],
  byteOffsets: number[]
): void {
  const totalBytes = byteOffsets[codeLength] ?? 0;
  const usedBytes = intersectionByteSize(
    { start: 0, end: codeLength },
    executedRanges,
    byteOffsets
  );
  const mappedBytes = mappedRanges.reduce(
    (sum, range) => sum + rangeByteSize(range, byteOffsets),
    0
  );
  const mappedUsedBytes = mappedRanges.reduce(
    (sum, range) => sum + intersectionByteSize(range, executedRanges, byteOffsets),
    0
  );
  const unmappedBytes = Math.max(0, totalBytes - mappedBytes);
  const unmappedUsedBytes = Math.max(0, usedBytes - mappedUsedBytes);
  const existing = totals.get(chunk.id);
  if (existing === undefined) {
    totals.set(chunk.id, {
      chunkId: chunk.id,
      files: [file],
      initial: chunk.initial,
      entry: chunk.entry,
      names: chunk.names,
      entrypoints: chunk.entrypoints,
      groups: chunk.groups,
      parents: chunk.parents,
      children: chunk.children,
      splitRule: chunk.splitRule,
      totalBytes,
      usedBytes,
      usedRatio: null,
      mappedBytes,
      mappedUsedBytes,
      unmappedBytes,
      unmappedUsedBytes
    });
    return;
  }
  if (!existing.files.includes(file)) existing.files.push(file);
  existing.totalBytes += totalBytes;
  existing.usedBytes += usedBytes;
  existing.mappedBytes = (existing.mappedBytes ?? 0) + mappedBytes;
  existing.mappedUsedBytes = (existing.mappedUsedBytes ?? 0) + mappedUsedBytes;
  existing.unmappedBytes = (existing.unmappedBytes ?? 0) + unmappedBytes;
  existing.unmappedUsedBytes = (existing.unmappedUsedBytes ?? 0) + unmappedUsedBytes;
}

function addSourceUsage(
  totals: Map<string, DivebellCodeUsageSourceResult>,
  chunk: DivebellChunkMapChunk,
  file: string,
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
        fileRanges: [],
        totalBytes: 0,
        usedBytes: 0,
        usedRatio: null
      };
      totals.set(key, existing);
    }
    if (!existing.chunkIds.includes(chunk.id)) existing.chunkIds.push(chunk.id);
    let fileRange = existing.fileRanges.find((item) => item.file === file);
    if (fileRange === undefined) {
      fileRange = { file, mappedRanges: [], executedRanges: [] };
      existing.fileRanges.push(fileRange);
    }
    fileRange.mappedRanges = mergeRanges([
      ...fileRange.mappedRanges.map((item) => ({
        start: item.startOffset,
        end: item.endOffset
      })),
      range
    ]).map((item) => ({
      startOffset: item.start,
      endOffset: item.end
    }));
    fileRange.executedRanges = mergeRanges([
      ...fileRange.executedRanges.map((item) => ({
        start: item.startOffset,
        end: item.endOffset
      })),
      ...intersectRanges(range, executedRanges)
    ]).map((item) => ({
      startOffset: item.start,
      endOffset: item.end
    }));
    existing.totalBytes += rangeByteSize(range, byteOffsets);
    existing.usedBytes += intersectionByteSize(range, executedRanges, byteOffsets);
  }
}

function createPackageUsage(
  sources: DivebellCodeUsageSourceResult[]
): DivebellCodeUsagePackageResult[] {
  const totals = new Map<string, DivebellCodeUsagePackageResult>();
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
  modules: DivebellChunkMapModule[],
  sourcePath: string
): DivebellChunkMapModule | undefined {
  const normalizedSource = normalizePath(sourcePath);
  return modules.find((module) => module.sourcePath !== null && normalizePath(module.sourcePath) === normalizedSource)
    ?? modules.find((module) => {
      if (module.sourcePath === null) return false;
      const modulePath = normalizePath(module.sourcePath);
      return normalizedSource.endsWith(modulePath) || modulePath.endsWith(normalizedSource);
    });
}

function resolveSourcePath(asset: DivebellCodeUsageAsset, source: string): string {
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

function normalizeCoverageRange(range: DivebellCoverageRange): OffsetRange | null {
  if (!Number.isFinite(range.startOffset) || !Number.isFinite(range.endOffset)) return null;
  const start = Math.max(0, Math.trunc(range.startOffset));
  const end = Math.max(start, Math.trunc(range.endOffset));
  return end > start ? { start, end } : null;
}

function createExecutedRanges(script: DivebellCoverageScript): OffsetRange[] {
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

function intersectRanges(range: OffsetRange, executedRanges: OffsetRange[]): OffsetRange[] {
  const result: OffsetRange[] = [];
  for (const executed of executedRanges) {
    if (executed.end <= range.start) continue;
    if (executed.start >= range.end) break;
    const start = Math.max(range.start, executed.start);
    const end = Math.min(range.end, executed.end);
    if (end > start) result.push({ start, end });
  }
  return result;
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

function withSourceRatio(source: DivebellCodeUsageSourceResult): DivebellCodeUsageSourceResult {
  return {
    ...source,
    chunkIds: source.chunkIds.sort(),
    fileRanges: source.fileRanges
      .map((item) => ({
        ...item,
        mappedRanges: item.mappedRanges.slice().sort((left, right) =>
          left.startOffset - right.startOffset || left.endOffset - right.endOffset),
        executedRanges: item.executedRanges.slice().sort((left, right) =>
          left.startOffset - right.startOffset || left.endOffset - right.endOffset)
      }))
      .sort((left, right) => left.file.localeCompare(right.file)),
    usedRatio: ratio(source.usedBytes, source.totalBytes)
  };
}

function withChunkRatio(chunk: DivebellCodeUsageChunkResult): DivebellCodeUsageChunkResult {
  return {
    ...chunk,
    files: chunk.files.sort(),
    usedRatio: ratio(chunk.usedBytes, chunk.totalBytes)
  };
}

function ratio(usedBytes: number, totalBytes: number): number | null {
  return totalBytes === 0 ? null : usedBytes / totalBytes;
}

function fallbackPackageName(source: DivebellCodeUsageSourceResult): string {
  return source.owner.kind === "application" ? "(application)" : "(unmatched)";
}

function unknownOwner(): DivebellChunkMapModuleOwner {
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

function classifyUnmatchedScript(
  value: string
): DivebellCodeUsageUnmatchedScript["category"] {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return "network";
    if (url.protocol === "blob:" || url.protocol === "data:") return "generated";
    if (url.protocol === "about:") return "inline";
    return "other";
  } catch {
    return value.startsWith("blob:") || value.startsWith("data:")
      ? "generated"
      : value.startsWith("about:")
        ? "inline"
        : "other";
  }
}
