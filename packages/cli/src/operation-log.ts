import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { OPEN_RUNTIME_SESSION_QUERY_PARAM } from "@openruntime/core";

export interface CliOperationLogEntry {
  schemaVersion: 1;
  command: "open";
  key: string;
  cwd: string;
  url: string;
  normalizedUrl: string;
  bridgeUrl: string | null;
  sessionId: string | null;
  openedAt: number;
  exitCode: number;
}

export interface CliOperationLogStore {
  read(): Promise<CliOperationLogEntry | undefined>;
  write(entry: Omit<CliOperationLogEntry, "schemaVersion" | "key" | "cwd">): Promise<void>;
  remove(): Promise<void>;
}

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
        schemaVersion: 1,
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
  return entry.schemaVersion === 1 &&
    entry.command === "open" &&
    typeof entry.key === "string" &&
    typeof entry.cwd === "string" &&
    typeof entry.url === "string" &&
    typeof entry.normalizedUrl === "string" &&
    (typeof entry.bridgeUrl === "string" || entry.bridgeUrl === null) &&
    (typeof entry.sessionId === "string" || entry.sessionId === null) &&
    typeof entry.openedAt === "number" &&
    typeof entry.exitCode === "number";
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}
