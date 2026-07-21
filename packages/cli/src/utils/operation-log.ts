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
        if (!isCliOperationLogEntry(parsed)) return undefined;
        return parsed;
      } catch {
        return undefined;
      }
    },
    write: async (entry) => {
      await mkdir(stateDirectory, { recursive: true });
      await writeFile(stateFile, `${JSON.stringify({
        schemaVersion: 2,
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

function isCliOperationLogEntry(value: unknown): value is CliOperationLogEntry {
  if (value === null || typeof value !== "object") return false;
  const entry = value as Partial<CliOperationLogEntry>;
  return entry.schemaVersion === 2 &&
    entry.command === "open" &&
    typeof entry.key === "string" &&
    typeof entry.cwd === "string" &&
    typeof entry.url === "string" &&
    typeof entry.normalizedUrl === "string" &&
    (typeof entry.bridgeUrl === "string" || entry.bridgeUrl === null) &&
    (typeof entry.sessionId === "string" || entry.sessionId === null) &&
    typeof entry.openedAt === "number" &&
    typeof entry.exitCode === "number" &&
    Array.isArray(entry.activeExtensions) &&
    entry.activeExtensions.every((value) => typeof value === "string") &&
    isStackDetectionCache(entry.stackDetection);
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
