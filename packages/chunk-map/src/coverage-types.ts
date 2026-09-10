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
  /** Actual Debugger.getScriptSource text, associated with this captured script/target by the collector. */
  runtimeSource?: string;
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
  /** Aggregated across captured phases; absent only in older saved reports. */
  contentIdentity?: DivebellCodeUsageCodeFileIdentity;
}

export interface DivebellCodeUsageContentIdentity {
  status: "exact" | "embedded" | "unverified" | "mismatch";
  /** Start of the complete build asset in runtimeSource, in UTF-16 code units (not bytes). */
  runtimeOffset?: number;
  /** All lengths use V8's UTF-16 coordinates; usage totals remain UTF-8 bytes. */
  runtimeLength?: number;
  assetLength: number;
  reason?: string;
}

export interface DivebellCodeUsageContentIdentityInstance extends DivebellCodeUsageContentIdentity {
  scriptId: string;
  url: string;
}

export interface DivebellCodeUsageCodeFileIdentity extends DivebellCodeUsageContentIdentity {
  /** Keep every observed instance: the same asset may have different runtime wrappers. */
  instances: DivebellCodeUsageContentIdentityInstance[];
}

export interface DivebellCodeUsageContentIdentitySummary {
  /** Script counts among URL-matched, available build assets, not counts of external/unmatched scripts. */
  exact: number;
  embedded: number;
  unverified: number;
  mismatch: number;
  /** At least one asset was checked and every checked instance is exact/embedded, with no missing assets. */
  verified: boolean;
}

export interface DivebellCodeUsageCodeFileResult {
  file: string;
  chunkIds: string[];
  totalBytes: number;
  usedBytes: number;
  usedRatio: number | null;
  executedRanges: DivebellCodeUsageExecutedRange[];
  /** Absent only in older saved reports. Rejected mismatches are in unmatchedScripts, never zero-use files. */
  contentIdentity?: DivebellCodeUsageCodeFileIdentity;
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
  | "asset-unavailable"
  | "runtime-source-mismatch"
  | "runtime-source-ambiguous";

export interface DivebellCodeUsageUnmatchedScript {
  scriptId: string;
  url: string;
  category: DivebellCodeUsageUnmatchedScriptCategory;
  reason: DivebellCodeUsageUnmatchedScriptReason;
  contentIdentity?: DivebellCodeUsageContentIdentity;
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

/** Legacy kind names retained for compatibility; selection uses absolute unused bytes, not a ratio cutoff. */
export type DivebellCodeUsageOpportunityKind =
  | "large-low-use-chunk"
  | "large-low-use-source"
  | "large-low-use-package";

export interface DivebellCodeUsageOpportunity {
  id: string;
  kind: DivebellCodeUsageOpportunityKind;
  subject: string;
  totalBytes: number;
  usedBytes: number;
  unusedBytes: number;
  /**
   * Legacy name: equals unusedBytes (totalBytes - usedBytes), the observed
   * unexecuted generated-source bytes used to rank investigation. Not a bound
   * or prediction of net savings: deferral can also remove executed setup,
   * while new dependencies and build changes can add bytes.
   */
  potentialSavingsBytes: number;
  /**
   * Legacy name: equals usedBytes, the observed executed generated-source
   * bytes. Not a required-code or remaining-size floor; initialization of a
   * deferred feature can leave the phase too.
   */
  coverageFloorBytes: number;
  /**
   * Chunk candidates form the non-overlapping unexecuted-byte ledger.
   * Source/package rows explain the same bytes and must not be added to it.
   * Optional only for compatibility with previously saved reports.
   */
  savingsAccounting?: "exclusive-chunk" | "overlapping-attribution";
  usedRatio: number;
  /**
   * Kept for machine consumers that already sort by score. Equals unusedBytes;
   * confidence and implementation cost never reduce this investigation score.
   */
  score: number;
  confidence: "high" | "medium" | "low";
  chunkIds: string[];
  evidence: string[];
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
  opportunities?: DivebellCodeUsageOpportunity[];
  codeFiles?: DivebellCodeUsageCodeFileResult[];
  contentIdentity?: DivebellCodeUsageContentIdentitySummary;
}

export interface DivebellCodeUsageReport {
  schemaVersion: 1;
  buildId: string;
  phases: DivebellCodeUsagePhaseResult[];
  codeFiles?: DivebellCodeUsageCodeFile[];
}
