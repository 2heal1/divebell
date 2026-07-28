import {
  createDivebellChunkMap,
  type DivebellChunkMap,
  type DivebellChunkMapStats
} from "@divebell/chunk-map";

const PLUGIN_NAME = "DivebellChunkMapPlugin";

export interface DivebellChunkMapPluginOptions {
  filename?: string;
  buildId?: string;
  generator?: string;
}

interface CompilerLike {
  context?: string;
  options: {
    target?: unknown;
    optimization?: {
      runtimeChunk?: unknown;
      splitChunks?: unknown;
    };
  };
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
    toJson(options: Record<string, unknown>): DivebellChunkMapStats;
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

export class DivebellChunkMapRspackPlugin {
  readonly #filename: string;
  readonly #buildId: string | undefined;
  readonly #generator: string;

  constructor(options: DivebellChunkMapPluginOptions = {}) {
    this.#filename = options.filename ?? "divebell-chunks.json";
    this.#buildId = options.buildId;
    this.#generator = options.generator ?? "@divebell/rspack-plugin";
  }

  apply(compiler: CompilerLike): void {
    if (!isBrowserTarget(compiler.options.target)) return;
    const runtime = compiler.webpack ?? compiler.rspack;
    if (runtime === undefined) {
      throw new Error("Divebell Chunk Map requires a Rspack-compatible compiler.");
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
          const chunkMap = createDivebellChunkMap(
            stats,
            {
              ...(buildId === undefined ? {} : { buildId }),
              ...(compiler.context === undefined ? {} : { context: compiler.context }),
              generator: this.#generator
            }
          );
          addSplitRuleDetails(chunkMap, compiler.options.optimization);
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

function addSplitRuleDetails(
  chunkMap: DivebellChunkMap,
  optimization: CompilerLike["options"]["optimization"]
): void {
  const runtimeName = readRuleName(optimization?.runtimeChunk);
  const splitChunks = isRecord(optimization?.splitChunks) ? optimization.splitChunks : null;
  const cacheGroups = splitChunks !== null && isRecord(splitChunks.cacheGroups)
    ? Object.entries(splitChunks.cacheGroups)
      .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
    : [];

  for (const chunk of chunkMap.chunks) {
    if (chunk.entry) continue;
    if (runtimeName !== null && chunk.names.includes(runtimeName)) {
      chunk.splitRule = {
        kind: "runtime",
        name: runtimeName,
        configPath: "optimization.runtimeChunk",
        inferred: false
      };
      continue;
    }

    const exactRule = cacheGroups.find(([, group]) => {
      const name = typeof group.name === "string" ? group.name : null;
      return name !== null && chunk.names.includes(name);
    });
    if (exactRule !== undefined) {
      chunk.splitRule = {
        kind: "cache-group",
        name: exactRule[0],
        configPath: cacheGroupPath(exactRule[0]),
        inferred: false
      };
      continue;
    }

    const inferredRule = cacheGroups.find(([key, group]) =>
      group.name === undefined && chunk.names.includes(key));
    if (inferredRule !== undefined) {
      chunk.splitRule = {
        kind: "cache-group",
        name: inferredRule[0],
        configPath: cacheGroupPath(inferredRule[0]),
        inferred: true
      };
      continue;
    }

    if (chunk.initial && splitChunks !== null) {
      chunk.splitRule = {
        kind: "split-chunks",
        name: "splitChunks",
        configPath: "optimization.splitChunks",
        inferred: true
      };
    }
  }
}

function readRuleName(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (!isRecord(value)) return null;
  return typeof value.name === "string" && value.name.length > 0 ? value.name : null;
}

function cacheGroupPath(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? `optimization.splitChunks.cacheGroups.${key}`
    : `optimization.splitChunks.cacheGroups[${JSON.stringify(key)}]`;
}

function addCompilationDetails(
  stats: DivebellChunkMapStats,
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
