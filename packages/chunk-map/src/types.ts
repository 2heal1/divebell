// Framework-independent format emitted by supported build plugins.
export const OPENRUNTIME_CHUNK_MAP_SCHEMA_VERSION = 2 as const;

export type OpenRuntimeChunkMapModuleKind =
  | "application"
  | "workspace"
  | "third-party"
  | "runtime"
  | "unknown";

export interface OpenRuntimeChunkMapModuleOwner {
  kind: OpenRuntimeChunkMapModuleKind;
  packageName: string | null;
  packageVersion: string | null;
  packageSubpath: string | null;
}

export interface OpenRuntimeChunkMapAsset {
  file: string;
  size: number | null;
  sourceMap: string | null;
}

export interface OpenRuntimeChunkMapModule {
  id: string | null;
  identifier: string;
  name: string;
  sourcePath: string | null;
  moduleType: string | null;
  size: number;
  owner: OpenRuntimeChunkMapModuleOwner;
}

export interface OpenRuntimeChunkMapPackageSummary {
  kind: Exclude<OpenRuntimeChunkMapModuleKind, "runtime" | "unknown">;
  packageName: string;
  packageVersion: string | null;
  chunks: string[];
  initialChunks: string[];
  asyncChunks: string[];
  moduleCount: number;
  moduleOccurrences: number;
  moduleSize: number;
}

export interface OpenRuntimeChunkMapChunk {
  id: string;
  names: string[];
  assets: OpenRuntimeChunkMapAsset[];
  initial: boolean;
  entry: boolean;
  entrypoints: string[];
  groups: string[];
  parents: string[];
  children: string[];
  modules: OpenRuntimeChunkMapModule[];
  moduleSize: number;
}

export interface OpenRuntimeChunkMap {
  schemaVersion: typeof OPENRUNTIME_CHUNK_MAP_SCHEMA_VERSION;
  generator: string;
  buildId: string;
  publicPath: string | null;
  chunks: OpenRuntimeChunkMapChunk[];
  packages: OpenRuntimeChunkMapPackageSummary[];
}

export interface OpenRuntimeChunkMapCreateOptions {
  buildId?: string;
  context?: string;
  generator?: string;
}

export type OpenRuntimeChunkMatchResult =
  | {
      status: "matched";
      requestUrl: string;
      requestPath: string;
      chunk: OpenRuntimeChunkMapChunk;
      asset: OpenRuntimeChunkMapAsset;
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
