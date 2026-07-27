import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  analyzeOpenRuntimeCodeUsage,
  matchOpenRuntimeChunk,
  type OpenRuntimeChunkMap,
  type OpenRuntimeCodeUsageAsset,
  type OpenRuntimeCoverageCheckpoint,
  type OpenRuntimeSourceMap
} from "@openruntime/chunk-map";

import type { AnalyzeCodeUsageFilesOptions, AnalyzeCodeUsageFilesResult } from "./types.js";
export type { AnalyzeCodeUsageFilesOptions, AnalyzeCodeUsageFilesResult } from "./types.js";

export async function analyzeCodeUsageFiles(
  options: AnalyzeCodeUsageFilesOptions
): Promise<AnalyzeCodeUsageFilesResult> {
  if (options.coverage.length === 0) {
    throw new Error("At least one coverage checkpoint is required.");
  }

  const chunkMapLocation = resolveInputLocation(options.chunkMap);
  const assetBase = options.assets === undefined
    ? defaultAssetBase(chunkMapLocation)
    : resolveAssetBase(options.assets);
  const chunkMap = validateChunkMap(await readJson(chunkMapLocation));
  const coverageLocations = options.coverage.map((location) => resolve(location));
  const checkpoints = await Promise.all(coverageLocations.map(async (location) =>
    validateCoverageCheckpoint(await readJson(location), location)));
  const analyzableAssetCount = chunkMap.chunks.flatMap((chunk) => chunk.assets)
    .filter((asset) => asset.file.endsWith(".js") && asset.sourceMap !== null)
    .length;
  if (analyzableAssetCount === 0) {
    throw new Error(
      "The Chunk Map has no JavaScript assets with source maps. Enable source maps in the analyzed build."
    );
  }
  const assets = await readAnalysisAssets(chunkMap, checkpoints, assetBase);

  const report = analyzeOpenRuntimeCodeUsage({ chunkMap, checkpoints, assets });
  const output = resolve(options.output ?? "openruntime-code-usage.json");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return {
    chunkMap: chunkMapLocation,
    coverage: coverageLocations,
    assets: assetBase,
    output,
    phaseCount: report.phases.length,
    report
  };
}

async function readAnalysisAssets(
  chunkMap: OpenRuntimeChunkMap,
  checkpoints: OpenRuntimeCoverageCheckpoint[],
  assetBase: string
): Promise<OpenRuntimeCodeUsageAsset[]> {
  const observedFiles = new Set(checkpoints.flatMap((checkpoint) =>
    checkpoint.scripts.flatMap((script) => {
      const match = matchOpenRuntimeChunk(chunkMap, script.url);
      return match.status === "matched" ? [match.asset.file] : [];
    })));
  const entries = new Map<string, { file: string; sourceMap: string }>();
  for (const asset of chunkMap.chunks.flatMap((chunk) => chunk.assets)) {
    if (
      !observedFiles.has(asset.file)
      || !asset.file.endsWith(".js")
      || asset.sourceMap === null
    ) continue;
    entries.set(asset.file, { file: asset.file, sourceMap: asset.sourceMap });
  }

  return await Promise.all([...entries.values()].map(async (asset) => {
    const codeLocation = resolveFromBase(assetBase, asset.file);
    const sourceMapLocation = resolveFromBase(assetBase, asset.sourceMap);
    const [code, sourceMap] = await Promise.all([
      readText(codeLocation),
      readJson(sourceMapLocation)
    ]);
    return {
      file: asset.file,
      code,
      sourceMapPath: isHttpLocation(sourceMapLocation)
        ? `/${asset.sourceMap.replace(/^\/+/, "")}`
        : sourceMapLocation,
      sourceMap: validateSourceMap(sourceMap, sourceMapLocation)
    };
  }));
}

function resolveFromBase(base: string, path: string): string {
  return isHttpLocation(base)
    ? new URL(path.replace(/^\/+/, ""), ensureTrailingSlash(base)).href
    : resolve(base, path);
}

function resolveInputLocation(location: string): string {
  return isHttpLocation(location) ? new URL(location).href : resolve(location);
}

function resolveAssetBase(location: string): string {
  return isHttpLocation(location)
    ? ensureTrailingSlash(new URL(location).href)
    : resolve(location);
}

function defaultAssetBase(chunkMapLocation: string): string {
  return isHttpLocation(chunkMapLocation)
    ? new URL(".", chunkMapLocation).href
    : resolve(dirname(chunkMapLocation));
}

function ensureTrailingSlash(location: string): string {
  return location.endsWith("/") ? location : `${location}/`;
}

function isHttpLocation(location: string): boolean {
  return location.startsWith("http://") || location.startsWith("https://");
}

async function readJson(location: string): Promise<unknown> {
  const source = await readText(location);
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`Invalid JSON at ${location}: ${errorMessage(error)}`);
  }
}

async function readText(location: string): Promise<string> {
  try {
    if (isHttpLocation(location)) {
      const response = await fetch(location, {
        signal: AbortSignal.timeout(15_000)
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return await response.text();
    }
    return await readFile(location, "utf8");
  } catch (error) {
    throw new Error(`Cannot read ${location}: ${errorMessage(error)}`);
  }
}

function validateChunkMap(value: unknown): OpenRuntimeChunkMap {
  if (!isRecord(value) || typeof value.buildId !== "string" || !Array.isArray(value.chunks)) {
    throw new Error("The Chunk Map must contain a buildId and chunks array.");
  }
  return value as unknown as OpenRuntimeChunkMap;
}

function validateCoverageCheckpoint(
  value: unknown,
  location: string
): OpenRuntimeCoverageCheckpoint {
  if (!isRecord(value) || !Array.isArray(value.scripts)) {
    throw new Error(`Coverage checkpoint ${location} must contain a scripts array.`);
  }
  return value as unknown as OpenRuntimeCoverageCheckpoint;
}

function validateSourceMap(value: unknown, location: string): OpenRuntimeSourceMap {
  if (
    !isRecord(value)
    || typeof value.version !== "number"
    || !Array.isArray(value.sources)
    || typeof value.mappings !== "string"
  ) {
    throw new Error(`Source map ${location} is missing version, sources, or mappings.`);
  }
  return value as unknown as OpenRuntimeSourceMap;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
