// URL matching is shared by local and deployed-page analysis.
import type {
  DivebellChunkMap,
  DivebellChunkMatchResult
} from "./types.js";

export function matchDivebellChunk(
  chunkMap: DivebellChunkMap,
  requestUrl: string,
  options: { expectedBuildId?: string } = {}
): DivebellChunkMatchResult {
  if (
    options.expectedBuildId !== undefined
    && options.expectedBuildId !== chunkMap.buildId
  ) {
    return {
      status: "build-mismatch",
      requestUrl,
      expectedBuildId: options.expectedBuildId,
      actualBuildId: chunkMap.buildId
    };
  }

  const requestPath = normalizeRequestPath(requestUrl);
  const candidates = chunkMap.chunks.flatMap((chunk) =>
    chunk.assets
      .filter((asset) => assetMatchesRequest(asset.file, requestPath))
      .map((asset) => ({ chunk, asset }))
  );

  if (candidates.length === 0) {
    return {
      status: "not-found",
      requestUrl,
      requestPath
    };
  }
  if (candidates.length > 1) {
    return {
      status: "ambiguous",
      requestUrl,
      requestPath,
      candidates: candidates.map(({ chunk, asset }) => ({
        chunkId: chunk.id,
        file: asset.file
      }))
    };
  }

  const candidate = candidates[0];
  if (candidate === undefined) {
    throw new Error("Divebell Chunk Map candidate disappeared unexpectedly.");
  }
  return {
    status: "matched",
    requestUrl,
    requestPath,
    chunk: candidate.chunk,
    asset: candidate.asset
  };
}

function normalizeRequestPath(requestUrl: string): string {
  try {
    return decodePathname(new URL(requestUrl, "http://divebell.invalid").pathname);
  } catch {
    const withoutHash = requestUrl.split("#", 1)[0] ?? requestUrl;
    return decodePathname((withoutHash.split("?", 1)[0] ?? withoutHash));
  }
}

function decodePathname(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function assetMatchesRequest(file: string, requestPath: string): boolean {
  const normalizedFile = normalizeSlashes(file).replace(/^\.\//, "");
  const normalizedRequest = normalizeSlashes(requestPath);
  if (isAbsoluteUrl(normalizedFile)) {
    return normalizeRequestPath(normalizedFile) === normalizedRequest;
  }
  const requestWithoutLeadingSlash = normalizedRequest.replace(/^\/+/, "");
  return requestWithoutLeadingSlash === normalizedFile
    || requestWithoutLeadingSlash.endsWith(`/${normalizedFile}`);
}

function normalizeSlashes(value: string): string {
  return value.replaceAll("\\", "/");
}

function isAbsoluteUrl(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value);
}
