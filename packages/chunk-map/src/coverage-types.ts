// Shared contract between browser coverage, build plugins, and the CLI.
import type {
  OpenRuntimeChunkMap,
  OpenRuntimeChunkMapModuleOwner,
  OpenRuntimeChunkMapSplitRule
} from "./types.js";

export interface OpenRuntimeCoverageRange {
  startOffset: number;
  endOffset: number;
  count: number;
}

export interface OpenRuntimeCoverageFunction {
  functionName: string;
  ranges: OpenRuntimeCoverageRange[];
}

export interface OpenRuntimeCoverageScript {
  scriptId: string;
  url: string;
  functions: OpenRuntimeCoverageFunction[];
}

export interface OpenRuntimeCoverageCheckpoint {
  schemaVersion: number;
  label?: string | null;
  scripts: OpenRuntimeCoverageScript[];
}

export interface OpenRuntimeSourceMap {
  version: number;
  sourceRoot?: string;
  sources: string[];
  mappings: string;
}

export interface OpenRuntimeCodeUsageAsset {
  file: string;
  code: string;
  sourceMapPath: string;
  sourceMap: OpenRuntimeSourceMap;
}

export interface OpenRuntimeCodeUsageExecutedRange {
  startOffset: number;
  endOffset: number;
}

export interface OpenRuntimeCodeUsageCodeFile {
  file: string;
  code: string;
  totalBytes: number;
}

export interface OpenRuntimeCodeUsageCodeFileResult {
  file: string;
  chunkIds: string[];
  totalBytes: number;
  usedBytes: number;
  usedRatio: number | null;
  executedRanges: OpenRuntimeCodeUsageExecutedRange[];
}

export interface OpenRuntimeCodeUsageInput {
  chunkMap: OpenRuntimeChunkMap;
  checkpoints: OpenRuntimeCoverageCheckpoint[];
  assets: OpenRuntimeCodeUsageAsset[];
}

export interface OpenRuntimeCodeUsageSourceResult {
  sourcePath: string;
  owner: OpenRuntimeChunkMapModuleOwner;
  chunkIds: string[];
  fileRanges: Array<{
    file: string;
    mappedRanges: OpenRuntimeCodeUsageExecutedRange[];
    executedRanges: OpenRuntimeCodeUsageExecutedRange[];
  }>;
  totalBytes: number;
  usedBytes: number;
  usedRatio: number | null;
}

export interface OpenRuntimeCodeUsagePackageResult {
  kind: OpenRuntimeChunkMapModuleOwner["kind"];
  packageName: string;
  packageVersion: string | null;
  chunkIds: string[];
  sourceCount: number;
  totalBytes: number;
  usedBytes: number;
  usedRatio: number | null;
}

export interface OpenRuntimeCodeUsageChunkResult {
  chunkId: string;
  files: string[];
  initial: boolean;
  entry?: boolean;
  names?: string[];
  entrypoints?: string[];
  groups?: string[];
  parents?: string[];
  children?: string[];
  splitRule?: OpenRuntimeChunkMapSplitRule;
  totalBytes: number;
  usedBytes: number;
  usedRatio: number | null;
}

export interface OpenRuntimeCodeUsagePhaseResult {
  label: string;
  scriptsObserved: number;
  unmatchedScriptUrls: string[];
  chunks: OpenRuntimeCodeUsageChunkResult[];
  sources: OpenRuntimeCodeUsageSourceResult[];
  packages: OpenRuntimeCodeUsagePackageResult[];
  codeFiles?: OpenRuntimeCodeUsageCodeFileResult[];
}

export interface OpenRuntimeCodeUsageReport {
  schemaVersion: 1;
  buildId: string;
  phases: OpenRuntimeCodeUsagePhaseResult[];
  codeFiles?: OpenRuntimeCodeUsageCodeFile[];
}
