import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { OPEN_RUNTIME_SESSION_QUERY_PARAM } from "@openruntime/core";

import type { CliOperationLogEntry, CliOperationLogStore } from "../types/shared.js";
export type { CliOperationLogEntry, CliOperationLogStore } from "../types/shared.js";

export function createFileOperationLogStore(
  cwd = process.cwd(),
  stateDirectory = createDefaultOperationLogDirectory()
): CliOperationLogStore {
  const normalizedCwd = resolve(cwd);
  const key = createOperationLogKey(normalizedCwd);
  const stateFile = join(stateDirectory, `${key}.json`);

  return {
    read: async () => {
      try {
        const parsed: unknown = JSON.parse(await readFile(stateFile, "utf8"));
        return normalizeCliOperationLogEntry(parsed);
      } catch {
        return undefined;
      }
    },
    write: async (entry) => {
      await mkdir(stateDirectory, { recursive: true });
      await writeFile(stateFile, `${JSON.stringify({
        schemaVersion: 3,
        key,
        cwd: normalizedCwd,
        ...entry
      }, null, 2)}\n`, "utf8");
    },
    remove: async () => {
      await rm(stateFile, { force: true });
    }
  };
}

export function createDefaultOperationLogDirectory(): string {
  return join(homedir(), ".openruntime", "operations");
}

export function createOperationLogKey(cwd: string): string {
  return `open-${createHash("sha256").update(resolve(cwd)).digest("hex").slice(0, 16)}`;
}

export function createOperationSessionId(cwd = process.cwd()): string {
  return createOperationLogKey(cwd);
}

export function normalizeOpenRuntimeUrlForMatch(input: string): string {
  try {
    const url = new URL(input);
    url.searchParams.delete(OPEN_RUNTIME_SESSION_QUERY_PARAM);
    if (isLoopbackHostname(url.hostname)) {
      url.hostname = "localhost";
    }
    return url.toString();
  } catch {
    return input.endsWith("/") ? input.slice(0, -1) : input;
  }
}

function normalizeCliOperationLogEntry(value: unknown): CliOperationLogEntry | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const entry = value as Record<string, unknown>;
  const schemaVersion = entry.schemaVersion;
  const bridgeUrl = entry.bridgeUrl;
  const bridgePort = schemaVersion === 2
    ? getOperationBridgePort(bridgeUrl)
    : entry.bridgePort;
  if (!(
    (schemaVersion === 2 || schemaVersion === 3) &&
    entry.command === "open" &&
    typeof entry.key === "string" &&
    typeof entry.cwd === "string" &&
    typeof entry.url === "string" &&
    typeof entry.normalizedUrl === "string" &&
    (typeof bridgeUrl === "string" || bridgeUrl === null) &&
    (typeof bridgePort === "number" || bridgePort === null) &&
    (typeof entry.sessionId === "string" || entry.sessionId === null) &&
    typeof entry.openedAt === "number" &&
    typeof entry.exitCode === "number" &&
    Array.isArray(entry.activeExtensions) &&
    entry.activeExtensions.every((value) => typeof value === "string") &&
    isExtensionContextMap(entry.extensionContexts) &&
    isStackDetectionCache(entry.stackDetection)
  )) {
    return undefined;
  }
  return {
    ...entry,
    schemaVersion: 3,
    bridgeUrl,
    bridgePort
  } as CliOperationLogEntry;
}

function isExtensionContextMap(value: unknown): boolean {
  if (value === undefined) return true;
  return isRecord(value) && Object.values(value).every((context) =>
    isRecord(context) && isJsonValue(context)
  );
}

function isJsonValue(value: unknown): boolean {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getOperationBridgePort(bridgeUrl: unknown): number | null {
  if (typeof bridgeUrl !== "string") return null;
  try {
    const url = new URL(bridgeUrl);
    if (url.port.length > 0) return Number(url.port);
    if (url.protocol === "http:") return 80;
    if (url.protocol === "https:") return 443;
    return null;
  } catch {
    return null;
  }
}

function isStackDetectionCache(value: unknown): boolean {
  if (value === undefined) return true;
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const cache = value as Record<string, unknown>;
  return typeof cache.url === "string" &&
    typeof cache.detectedAt === "number" &&
    Array.isArray(cache.detections) &&
    Array.isArray(cache.failures) &&
    typeof cache.detectorCount === "number" &&
    typeof cache.detectorSignature === "string";
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}
