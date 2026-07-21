// Chunk Map creation is shared by every supported build integration.
import {
  OPENRUNTIME_CHUNK_MAP_SCHEMA_VERSION,
  type OpenRuntimeChunkMap,
  type OpenRuntimeChunkMapAsset,
  type OpenRuntimeChunkMapChunk,
  type OpenRuntimeChunkMapCreateOptions,
  type OpenRuntimeChunkMapModule,
  type OpenRuntimeChunkMapModuleOwner,
  type OpenRuntimeChunkMapPackageSummary,
  type OpenRuntimeChunkMapSplitRule
} from "./types.js";

interface StatsAssetLike {
  name?: unknown;
  size?: unknown;
}

interface StatsModuleLike {
  id?: unknown;
  identifier?: unknown;
  name?: unknown;
  nameForCondition?: unknown;
  moduleType?: unknown;
  size?: unknown;
  sizes?: unknown;
  chunks?: unknown;
  modules?: unknown;
  resource?: unknown;
  descriptionFileData?: unknown;
  descriptionFilePath?: unknown;
}

interface StatsChunkLike {
  id?: unknown;
  names?: unknown;
  files?: unknown;
  initial?: unknown;
  entry?: unknown;
  parents?: unknown;
  children?: unknown;
  modules?: unknown;
}

interface StatsChunkGroupLike {
  chunks?: unknown;
}

export interface OpenRuntimeChunkMapStats {
  hash?: unknown;
  publicPath?: unknown;
  assets?: unknown;
  chunks?: unknown;
  modules?: unknown;
  entrypoints?: unknown;
  namedChunkGroups?: unknown;
}

export function createOpenRuntimeChunkMap(
  stats: OpenRuntimeChunkMapStats,
  options: OpenRuntimeChunkMapCreateOptions = {}
): OpenRuntimeChunkMap {
  const buildId = nonEmptyString(options.buildId) ?? nonEmptyString(stats.hash);
  if (buildId === null) {
    throw new Error("Cannot create an OpenRuntime Chunk Map without a build id.");
  }

  const assetsByName = createAssetIndex(asArray<StatsAssetLike>(stats.assets));
  const topLevelModules = flattenModules(asArray<StatsModuleLike>(stats.modules));
  const entrypointChunks = createGroupIndex(stats.entrypoints);
  const namedGroupChunks = createGroupIndex(stats.namedChunkGroups);
  const chunks = asArray<StatsChunkLike>(stats.chunks)
    .map((chunk) => createChunk({
      chunk,
      assetsByName,
      topLevelModules,
      entrypointChunks,
      namedGroupChunks,
      context: options.context
    }))
    .sort(compareChunks);

  return {
    schemaVersion: OPENRUNTIME_CHUNK_MAP_SCHEMA_VERSION,
    generator: options.generator ?? "@openruntime/chunk-map",
    buildId,
    publicPath: normalizePublicPath(stats.publicPath),
    chunks,
    packages: createPackageSummaries(chunks)
  };
}

function createChunk(input: {
  chunk: StatsChunkLike;
  assetsByName: Map<string, OpenRuntimeChunkMapAsset>;
  topLevelModules: StatsModuleLike[];
  entrypointChunks: Map<string, Set<string>>;
  namedGroupChunks: Map<string, Set<string>>;
  context: string | undefined;
}): OpenRuntimeChunkMapChunk {
  const id = valueId(input.chunk.id);
  if (id === null) {
    throw new Error("Cannot create an OpenRuntime Chunk Map for a chunk without an id.");
  }

  const entrypoints = groupsContaining(input.entrypointChunks, id);
  const groups = groupsContaining(input.namedGroupChunks, id);
  const chunkModules = flattenModules(asArray<StatsModuleLike>(input.chunk.modules));
  const modules = normalizeModules(
    chunkModules.length > 0
      ? chunkModules
      : input.topLevelModules.filter((module) => idList(module.chunks).includes(id)),
    input.context
  );
  const files = uniqueStrings(input.chunk.files).sort();
  const initial = typeof input.chunk.initial === "boolean"
    ? input.chunk.initial
    : entrypoints.length > 0;
  const entry = input.chunk.entry === true;

  return {
    id,
    names: uniqueStrings(input.chunk.names).sort(),
    assets: files.map((file) => input.assetsByName.get(file) ?? {
      file,
      size: null,
      sourceMap: null
    }),
    initial,
    entry,
    entrypoints,
    groups,
    parents: idList(input.chunk.parents).sort(),
    children: idList(input.chunk.children).sort(),
    splitRule: createBaseSplitRule({ entry, initial, groups }),
    modules,
    moduleSize: modules.reduce((total, module) => total + module.size, 0)
  };
}

function createBaseSplitRule(input: {
  entry: boolean;
  initial: boolean;
  groups: string[];
}): OpenRuntimeChunkMapSplitRule {
  if (input.entry) {
    return {
      kind: "entry",
      name: "Entry",
      configPath: "entry",
      inferred: false
    };
  }
  if (!input.initial && input.groups.length > 0) {
    return {
      kind: "dynamic-import",
      name: input.groups.join(", "),
      configPath: null,
      inferred: true
    };
  }
  return {
    kind: "unknown",
    name: "Unknown",
    configPath: null,
    inferred: true
  };
}

function createAssetIndex(assets: StatsAssetLike[]): Map<string, OpenRuntimeChunkMapAsset> {
  const result = new Map<string, OpenRuntimeChunkMapAsset>();
  const assetNames = new Set(
    assets.map((asset) => nonEmptyString(asset.name)).filter((file): file is string => file !== null)
  );
  for (const asset of assets) {
    const file = nonEmptyString(asset.name);
    if (file === null) continue;
    result.set(file, {
      file,
      size: finiteNumber(asset.size),
      sourceMap: assetNames.has(`${file}.map`) ? `${file}.map` : null
    });
  }
  return result;
}

function createGroupIndex(value: unknown): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  if (!isRecord(value)) return result;
  for (const [name, rawGroup] of Object.entries(value)) {
    if (!isRecord(rawGroup)) continue;
    const group = rawGroup as StatsChunkGroupLike;
    result.set(name, new Set(idList(group.chunks)));
  }
  return result;
}

function groupsContaining(groups: Map<string, Set<string>>, chunkId: string): string[] {
  return [...groups.entries()]
    .filter(([, chunks]) => chunks.has(chunkId))
    .map(([name]) => name)
    .sort();
}

function flattenModules(modules: StatsModuleLike[]): StatsModuleLike[] {
  const result: StatsModuleLike[] = [];
  for (const module of modules) {
    const nested = asArray<StatsModuleLike>(module.modules);
    if (nested.length > 0) {
      result.push(...flattenModules(nested));
    } else {
      result.push(module);
    }
  }
  return result;
}

function normalizeModules(
  modules: StatsModuleLike[],
  context: string | undefined
): OpenRuntimeChunkMapModule[] {
  const result = new Map<string, OpenRuntimeChunkMapModule>();
  for (const module of modules) {
    const identifier = nonEmptyString(module.identifier) ?? nonEmptyString(module.name);
    if (identifier === null) continue;
    const sourcePath = normalizeSourcePath(
      nonEmptyString(module.resource) ?? module.nameForCondition,
      identifier
    );
    const normalized: OpenRuntimeChunkMapModule = {
      id: valueId(module.id),
      identifier,
      name: nonEmptyString(module.name) ?? identifier,
      sourcePath,
      moduleType: nonEmptyString(module.moduleType),
      size: moduleSize(module),
      owner: createModuleOwner(module, sourcePath, identifier, context)
    };
    const existing = result.get(identifier);
    if (existing === undefined || normalized.size > existing.size) {
      result.set(identifier, normalized);
    }
  }
  return [...result.values()].sort((left, right) =>
    left.sourcePath?.localeCompare(right.sourcePath ?? "")
      ?? left.identifier.localeCompare(right.identifier)
  );
}

function createModuleOwner(
  module: StatsModuleLike,
  sourcePath: string | null,
  identifier: string,
  context: string | undefined
): OpenRuntimeChunkMapModuleOwner {
  if (isRuntimeModule(identifier, sourcePath)) {
    return emptyOwner("runtime");
  }

  const packageData = readPackageData(module.descriptionFileData);
  const packageName = nonEmptyString(packageData?.name) ?? inferPackageName(sourcePath);
  const packageVersion = nonEmptyString(packageData?.version)
    ?? inferPnpmVersion(sourcePath, packageName);
  const descriptionFilePath = nonEmptyString(module.descriptionFilePath);
  const packageRoot = descriptionFilePath === null
    ? null
    : parentPath(descriptionFilePath);
  const packageSubpath = sourcePath === null || packageRoot === null
    ? null
    : relativeChildPath(packageRoot, sourcePath);
  const normalizedContext = context === undefined ? null : normalizePath(context);
  const normalizedSource = sourcePath === null ? null : normalizePath(sourcePath);
  const inApplication = normalizedContext !== null
    && normalizedSource !== null
    && isPathInside(normalizedContext, normalizedSource);
  const inNodeModules = containsNodeModules(sourcePath)
    || containsNodeModules(descriptionFilePath);
  const isModernGeneratedApplicationModule = normalizedContext !== null
    && normalizedSource !== null
    && normalizedSource.startsWith(`${normalizedContext}/node_modules/.modern-js/`);

  if ((inApplication && !inNodeModules) || isModernGeneratedApplicationModule) {
    return {
      kind: "application",
      packageName,
      packageVersion,
      packageSubpath: relativeChildPath(normalizedContext!, normalizedSource!)
    };
  }
  if (inNodeModules) {
    return {
      kind: "third-party",
      packageName,
      packageVersion,
      packageSubpath: inferPackageSubpath(sourcePath) ?? packageSubpath
    };
  }
  if (packageName !== null) {
    return {
      kind: "workspace",
      packageName,
      packageVersion,
      packageSubpath
    };
  }
  return emptyOwner("unknown");
}

function createPackageSummaries(
  chunks: OpenRuntimeChunkMapChunk[]
): OpenRuntimeChunkMapPackageSummary[] {
  const summaries = new Map<string, {
    summary: OpenRuntimeChunkMapPackageSummary;
    modules: Set<string>;
  }>();
  for (const chunk of chunks) {
    for (const module of chunk.modules) {
      const { owner } = module;
      if (
        owner.packageName === null
        || owner.kind === "runtime"
        || owner.kind === "unknown"
      ) continue;
      const key = `${owner.kind}\u0000${owner.packageName}\u0000${owner.packageVersion ?? ""}`;
      let entry = summaries.get(key);
      if (entry === undefined) {
        entry = {
          summary: {
            kind: owner.kind,
            packageName: owner.packageName,
            packageVersion: owner.packageVersion,
            chunks: [],
            initialChunks: [],
            asyncChunks: [],
            moduleCount: 0,
            moduleOccurrences: 0,
            moduleSize: 0
          },
          modules: new Set<string>()
        };
        summaries.set(key, entry);
      }
      entry.modules.add(module.identifier);
      addUnique(entry.summary.chunks, chunk.id);
      addUnique(chunk.initial ? entry.summary.initialChunks : entry.summary.asyncChunks, chunk.id);
      entry.summary.moduleOccurrences += 1;
      entry.summary.moduleSize += module.size;
    }
  }
  return [...summaries.values()]
    .map(({ summary, modules }) => ({
      ...summary,
      chunks: summary.chunks.sort(compareIds),
      initialChunks: summary.initialChunks.sort(compareIds),
      asyncChunks: summary.asyncChunks.sort(compareIds),
      moduleCount: modules.size
    }))
    .sort((left, right) =>
      left.kind.localeCompare(right.kind)
        || left.packageName.localeCompare(right.packageName)
        || (left.packageVersion ?? "").localeCompare(right.packageVersion ?? "")
    );
}

function readPackageData(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRuntimeModule(identifier: string, sourcePath: string | null): boolean {
  return identifier.startsWith("webpack/runtime/")
    || identifier.startsWith("external ")
    || identifier.startsWith("data:")
    || sourcePath?.startsWith("data:") === true
    || (sourcePath === null && identifier.startsWith("runtime "));
}

function emptyOwner(kind: "runtime" | "unknown"): OpenRuntimeChunkMapModuleOwner {
  return {
    kind,
    packageName: null,
    packageVersion: null,
    packageSubpath: null
  };
}

function containsNodeModules(value: string | null): boolean {
  return value !== null && normalizePath(value).includes("/node_modules/");
}

function inferPackageName(sourcePath: string | null): string | null {
  const parts = nodeModulesPackageParts(sourcePath);
  if (parts.length === 0) return null;
  return parts[0]?.startsWith("@")
    ? parts.slice(0, 2).join("/") || null
    : parts[0] ?? null;
}

function inferPackageSubpath(sourcePath: string | null): string | null {
  const parts = nodeModulesPackageParts(sourcePath);
  if (parts.length === 0) return null;
  const offset = parts[0]?.startsWith("@") ? 2 : 1;
  const subpath = parts.slice(offset).join("/");
  return subpath.length === 0 ? null : subpath;
}

function inferPnpmVersion(sourcePath: string | null, packageName: string | null): string | null {
  if (sourcePath === null || packageName === null) return null;
  const normalized = normalizePath(sourcePath);
  const pnpmMarker = "/.pnpm/";
  const markerIndex = normalized.lastIndexOf(pnpmMarker);
  if (markerIndex === -1) return null;
  const storeSegment = normalized.slice(markerIndex + pnpmMarker.length).split("/", 1)[0];
  if (storeSegment === undefined) return null;
  const encodedName = packageName.replace("/", "+");
  const prefix = `${encodedName}@`;
  if (!storeSegment.startsWith(prefix)) return null;
  const version = storeSegment.slice(prefix.length).split("_", 1)[0] ?? "";
  return version.length === 0 ? null : version;
}

function nodeModulesPackageParts(sourcePath: string | null): string[] {
  if (sourcePath === null) return [];
  const normalized = normalizePath(sourcePath);
  const marker = "/node_modules/";
  const index = normalized.lastIndexOf(marker);
  return index === -1 ? [] : normalized.slice(index + marker.length).split("/");
}

function parentPath(value: string): string {
  const normalized = normalizePath(value).replace(/\/+$/, "");
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? normalized : normalized.slice(0, index);
}

function relativeChildPath(parent: string, child: string): string | null {
  const normalizedParent = normalizePath(parent).replace(/\/+$/, "");
  const normalizedChild = normalizePath(child);
  if (normalizedChild === normalizedParent) return "";
  const prefix = `${normalizedParent}/`;
  return normalizedChild.startsWith(prefix) ? normalizedChild.slice(prefix.length) : null;
}

function isPathInside(parent: string, child: string): boolean {
  return child === parent || child.startsWith(`${parent.replace(/\/+$/, "")}/`);
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/\/+$/, "");
}

function addUnique(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

function compareIds(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true });
}

function moduleSize(module: StatsModuleLike): number {
  const direct = finiteNumber(module.size);
  if (direct !== null) return direct;
  if (!isRecord(module.sizes)) return 0;
  return Object.values(module.sizes).reduce<number>((total, value) =>
    total + (finiteNumber(value) ?? 0), 0);
}

function normalizeSourcePath(nameForCondition: unknown, identifier: string): string | null {
  const direct = nonEmptyString(nameForCondition);
  if (direct !== null) return stripResourceQuery(direct);
  if (identifier.startsWith("external ") || identifier.startsWith("webpack/runtime/")) {
    return null;
  }
  const resource = identifier.slice(identifier.lastIndexOf("!") + 1);
  return stripResourceQuery(resource);
}

function stripResourceQuery(value: string): string {
  const queryIndex = value.indexOf("?");
  return queryIndex === -1 ? value : value.slice(0, queryIndex);
}

function normalizePublicPath(value: unknown): string | null {
  const publicPath = nonEmptyString(value);
  if (publicPath === null || publicPath === "auto") return null;
  return publicPath;
}

function compareChunks(left: OpenRuntimeChunkMapChunk, right: OpenRuntimeChunkMapChunk): number {
  return left.id.localeCompare(right.id, undefined, { numeric: true });
}

function idList(value: unknown): string[] {
  return asArray<unknown>(value)
    .map(valueId)
    .filter((item): item is string => item !== null);
}

function valueId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function uniqueStrings(value: unknown): string[] {
  return [...new Set(asArray<unknown>(value).filter((item): item is string =>
    typeof item === "string" && item.length > 0))];
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
