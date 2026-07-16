// Shared contract between browser coverage, build plugins, and the CLI.
import type {
  OpenRuntimeChunkMap,
  OpenRuntimeChunkMapModuleOwner
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

export interface OpenRuntimeCodeUsageInput {
  chunkMap: OpenRuntimeChunkMap;
  checkpoints: OpenRuntimeCoverageCheckpoint[];
  assets: OpenRuntimeCodeUsageAsset[];
}

export interface OpenRuntimeCodeUsageSourceResult {
  sourcePath: string;
  owner: OpenRuntimeChunkMapModuleOwner;
  chunkIds: string[];
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
}

export interface OpenRuntimeCodeUsageReport {
  schemaVersion: 1;
  buildId: string;
  phases: OpenRuntimeCodeUsagePhaseResult[];
}
