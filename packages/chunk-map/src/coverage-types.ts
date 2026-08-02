// Shared contract between browser coverage, build plugins, and the CLI.
import type {
  DivebellChunkMap,
  DivebellChunkMapModuleOwner,
  DivebellChunkMapSplitRule
} from "./types.js";

export interface DivebellCoverageRange {
  startOffset: number;
  endOffset: number;
  count: number;
}

export interface DivebellCoverageFunction {
  functionName: string;
  ranges: DivebellCoverageRange[];
}

export interface DivebellCoverageScript {
  scriptId: string;
  url: string;
  functions: DivebellCoverageFunction[];
}

export interface DivebellCoverageCheckpoint {
  schemaVersion: number;
  label?: string | null;
  scripts: DivebellCoverageScript[];
}

export interface DivebellSourceMap {
  version: number;
  sourceRoot?: string;
  sources: string[];
  mappings: string;
}

export interface DivebellCodeUsageAsset {
  file: string;
  code: string;
  sourceMapPath: string;
  sourceMap: DivebellSourceMap;
}

export interface DivebellCodeUsageExecutedRange {
  startOffset: number;
  endOffset: number;
}

export interface DivebellCodeUsageCodeFile {
  file: string;
  code: string;
  totalBytes: number;
}

export interface DivebellCodeUsageCodeFileResult {
  file: string;
  chunkIds: string[];
  totalBytes: number;
  usedBytes: number;
  usedRatio: number | null;
  executedRanges: DivebellCodeUsageExecutedRange[];
}

export interface DivebellCodeUsageInput {
  chunkMap: DivebellChunkMap;
  checkpoints: DivebellCoverageCheckpoint[];
  assets: DivebellCodeUsageAsset[];
}

export interface DivebellCodeUsageSourceResult {
  sourcePath: string;
  owner: DivebellChunkMapModuleOwner;
  chunkIds: string[];
  fileRanges: Array<{
    file: string;
    mappedRanges: DivebellCodeUsageExecutedRange[];
    executedRanges: DivebellCodeUsageExecutedRange[];
  }>;
  totalBytes: number;
  usedBytes: number;
  usedRatio: number | null;
}

export interface DivebellCodeUsagePackageResult {
  kind: DivebellChunkMapModuleOwner["kind"];
  packageName: string;
  packageVersion: string | null;
  chunkIds: string[];
  sourceCount: number;
  totalBytes: number;
  usedBytes: number;
  usedRatio: number | null;
}

export type DivebellCodeUsageUnmatchedScriptCategory =
  | "network"
  | "generated"
  | "inline"
  | "other";

export type DivebellCodeUsageUnmatchedScriptReason =
  | "not-found"
  | "ambiguous"
  | "build-mismatch"
  | "asset-unavailable";

export interface DivebellCodeUsageUnmatchedScript {
  scriptId: string;
  url: string;
  category: DivebellCodeUsageUnmatchedScriptCategory;
  reason: DivebellCodeUsageUnmatchedScriptReason;
}

export interface DivebellCodeUsageChunkResult {
  chunkId: string;
  files: string[];
  initial: boolean;
  entry?: boolean;
  names?: string[];
  entrypoints?: string[];
  groups?: string[];
  parents?: string[];
  children?: string[];
  splitRule?: DivebellChunkMapSplitRule;
  totalBytes: number;
  usedBytes: number;
  usedRatio: number | null;
  mappedBytes?: number;
  mappedUsedBytes?: number;
  unmappedBytes?: number;
  unmappedUsedBytes?: number;
}

export interface DivebellCodeUsagePhaseResult {
  label: string;
  scriptsCaptured?: number;
  scriptsObserved: number;
  scriptsMatched?: number;
  scriptsWithoutUrl?: number;
  unmatchedScriptUrls: string[];
  unmatchedScripts?: DivebellCodeUsageUnmatchedScript[];
  chunks: DivebellCodeUsageChunkResult[];
  sources: DivebellCodeUsageSourceResult[];
  packages: DivebellCodeUsagePackageResult[];
  codeFiles?: DivebellCodeUsageCodeFileResult[];
}

export interface DivebellCodeUsageReport {
  schemaVersion: 1;
  buildId: string;
  phases: DivebellCodeUsagePhaseResult[];
  codeFiles?: DivebellCodeUsageCodeFile[];
}
