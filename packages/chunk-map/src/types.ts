// Framework-independent format emitted by supported build plugins.
export const DIVEBELL_CHUNK_MAP_SCHEMA_VERSION = 3 as const;

export type DivebellChunkMapModuleKind =
  | "application"
  | "workspace"
  | "third-party"
  | "runtime"
  | "unknown";

export interface DivebellChunkMapModuleOwner {
  kind: DivebellChunkMapModuleKind;
  packageName: string | null;
  packageVersion: string | null;
  packageSubpath: string | null;
}

export interface DivebellChunkMapAsset {
  file: string;
  size: number | null;
  sourceMap: string | null;
}

export interface DivebellChunkMapModule {
  id: string | null;
  identifier: string;
  name: string;
  sourcePath: string | null;
  moduleType: string | null;
  size: number;
  owner: DivebellChunkMapModuleOwner;
}

export interface DivebellChunkMapPackageSummary {
  kind: Exclude<DivebellChunkMapModuleKind, "runtime" | "unknown">;
  packageName: string;
  packageVersion: string | null;
  chunks: string[];
  initialChunks: string[];
  asyncChunks: string[];
  moduleCount: number;
  moduleOccurrences: number;
  moduleSize: number;
}

export type DivebellChunkMapSplitRuleKind =
  | "entry"
  | "runtime"
  | "cache-group"
  | "dynamic-import"
  | "split-chunks"
  | "unknown";

export interface DivebellChunkMapSplitRule {
  kind: DivebellChunkMapSplitRuleKind;
  name: string;
  configPath: string | null;
  inferred: boolean;
}

export interface DivebellChunkMapChunk {
  id: string;
  names: string[];
  assets: DivebellChunkMapAsset[];
  initial: boolean;
  entry: boolean;
  entrypoints: string[];
  groups: string[];
  parents: string[];
  children: string[];
  splitRule: DivebellChunkMapSplitRule;
  modules: DivebellChunkMapModule[];
  moduleSize: number;
}

export interface DivebellChunkMap {
  schemaVersion: typeof DIVEBELL_CHUNK_MAP_SCHEMA_VERSION;
  generator: string;
  buildId: string;
  publicPath: string | null;
  chunks: DivebellChunkMapChunk[];
  packages: DivebellChunkMapPackageSummary[];
}

export interface DivebellChunkMapCreateOptions {
  buildId?: string;
  context?: string;
  generator?: string;
}

export type DivebellChunkMatchResult =
  | {
      status: "matched";
      requestUrl: string;
      requestPath: string;
      chunk: DivebellChunkMapChunk;
      asset: DivebellChunkMapAsset;
    }
  | {
      status: "not-found";
      requestUrl: string;
      requestPath: string;
    }
  | {
      status: "ambiguous";
      requestUrl: string;
      requestPath: string;
      candidates: Array<{
        chunkId: string;
        file: string;
      }>;
    }
  | {
      status: "build-mismatch";
      requestUrl: string;
      expectedBuildId: string;
      actualBuildId: string;
    };
