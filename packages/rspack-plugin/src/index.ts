import {
  createOpenRuntimeChunkMap,
  type OpenRuntimeChunkMapStats
} from "@openruntime/chunk-map";

const PLUGIN_NAME = "OpenRuntimeChunkMapPlugin";

export interface OpenRuntimeChunkMapPluginOptions {
  filename?: string;
  buildId?: string;
  generator?: string;
}

interface CompilerLike {
  context?: string;
  options: { target?: unknown };
  hooks: {
    thisCompilation: {
      tap(name: string, handler: (compilation: CompilationLike) => void): void;
    };
  };
  webpack?: CompilerRuntimeLike;
  rspack?: CompilerRuntimeLike;
}

interface CompilerRuntimeLike {
  Compilation: {
    PROCESS_ASSETS_STAGE_REPORT: number;
  };
  sources: {
    RawSource: new (value: string) => unknown;
  };
}

interface CompilationLike {
  hash?: string;
  fullHash?: string;
  chunks?: Iterable<CompilationChunkLike>;
  chunkGraph?: {
    getChunkModulesIterable(chunk: CompilationChunkLike): Iterable<CompilationModuleLike>;
    getModuleId(module: CompilationModuleLike): string | number | null;
  };
  hooks: {
    processAssets: {
      tap(
        options: { name: string; stage: number },
        handler: () => void
      ): void;
    };
  };
  getStats(): {
    toJson(options: Record<string, unknown>): OpenRuntimeChunkMapStats;
  };
  getAssets?: () => ArrayLike<{
    name: string;
    source: { size(): number };
  }>;
  getAsset(name: string): unknown;
  emitAsset(name: string, source: unknown): void;
  updateAsset(name: string, source: unknown): void;
}

interface CompilationChunkLike {
  id?: string | number;
}

interface CompilationModuleLike {
  type?: string;
  identifier(): string;
  readableIdentifier?(): string;
  nameForCondition?(): string | undefined;
  size?(type?: string): number;
  modules?: CompilationModuleLike[];
  resource?: string;
  resourceResolveData?: {
    path?: string;
    descriptionFileData?: unknown;
    descriptionFilePath?: string;
  };
}

export class OpenRuntimeChunkMapRspackPlugin {
  readonly #filename: string;
  readonly #buildId: string | undefined;
  readonly #generator: string;

  constructor(options: OpenRuntimeChunkMapPluginOptions = {}) {
    this.#filename = options.filename ?? "openruntime-chunks.json";
    this.#buildId = options.buildId;
    this.#generator = options.generator ?? "@openruntime/rspack-plugin";
  }

  apply(compiler: CompilerLike): void {
    if (!isBrowserTarget(compiler.options.target)) return;
    const runtime = compiler.webpack ?? compiler.rspack;
    if (runtime === undefined) {
      throw new Error("OpenRuntime Chunk Map requires a Rspack-compatible compiler.");
    }

    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: PLUGIN_NAME,
          stage: runtime.Compilation.PROCESS_ASSETS_STAGE_REPORT
        },
        () => {
          const stats = compilation.getStats().toJson({
            all: false,
            hash: true,
            publicPath: true,
            assets: true,
            chunks: true,
            chunkModules: true,
            chunkModulesSpace: Number.POSITIVE_INFINITY,
            modules: true,
            modulesSpace: Number.POSITIVE_INFINITY,
            nestedModules: true,
            nestedModulesSpace: Number.POSITIVE_INFINITY,
            ids: true,
            entrypoints: true,
            chunkGroups: true
          });
          addCompilationDetails(stats, compilation);
          const buildId = this.#buildId ?? compilation.fullHash ?? compilation.hash;
          const chunkMap = createOpenRuntimeChunkMap(
            stats,
            {
              ...(buildId === undefined ? {} : { buildId }),
              ...(compiler.context === undefined ? {} : { context: compiler.context }),
              generator: this.#generator
            }
          );
          const source = new runtime.sources.RawSource(`${JSON.stringify(chunkMap, null, 2)}\n`);
          if (compilation.getAsset(this.#filename) === undefined) {
            compilation.emitAsset(this.#filename, source);
          } else {
            compilation.updateAsset(this.#filename, source);
          }
        }
      );
    });
  }
}

function addCompilationDetails(
  stats: OpenRuntimeChunkMapStats,
  compilation: CompilationLike
): void {
  if (compilation.getAssets !== undefined) {
    stats.assets = Array.from(compilation.getAssets(), (asset) => ({
      name: asset.name,
      size: asset.source.size()
    }));
  }

  if (compilation.chunks === undefined || compilation.chunkGraph === undefined) return;
  const statsChunks = Array.isArray(stats.chunks) ? stats.chunks : [];
  const statsChunksById = new Map<string, Record<string, unknown>>();
  for (const chunk of statsChunks) {
    if (!isRecord(chunk)) continue;
    const id = valueId(chunk.id);
    if (id !== null) statsChunksById.set(id, chunk);
  }

  for (const chunk of compilation.chunks) {
    const id = valueId(chunk.id);
    if (id === null) continue;
    const statsChunk = statsChunksById.get(id);
    if (statsChunk === undefined) continue;
    statsChunk.modules = Array.from(
      compilation.chunkGraph.getChunkModulesIterable(chunk),
      (module) => compilationModuleToStats(module, compilation.chunkGraph!)
    );
  }
}

function compilationModuleToStats(
  module: CompilationModuleLike,
  chunkGraph: NonNullable<CompilationLike["chunkGraph"]>
): Record<string, unknown> {
  const nested = Array.isArray(module.modules)
    ? module.modules.map((child) => compilationModuleToStats(child, chunkGraph))
    : [];
  return {
    id: chunkGraph.getModuleId(module),
    identifier: module.identifier(),
    name: module.readableIdentifier?.() ?? module.identifier(),
    nameForCondition: module.nameForCondition?.(),
    moduleType: module.type,
    size: module.size?.() ?? 0,
    resource: module.resource ?? module.resourceResolveData?.path,
    descriptionFileData: module.resourceResolveData?.descriptionFileData,
    descriptionFilePath: module.resourceResolveData?.descriptionFilePath,
    modules: nested
  };
}

function valueId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBrowserTarget(target: unknown): boolean {
  if (target === undefined) return true;
  const targets = Array.isArray(target) ? target : [target];
  return !targets.includes("node") && !targets.includes("webworker");
}
