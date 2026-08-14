import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DIVEBELL_BRIDGE_DEFAULT_PORT } from "@divebell/core";
import type { BridgeRuntimeInfo } from "@divebell/bridge";
import type { Fetcher } from "../runtime/client.js";
import { fetchRuntimes, selectRuntime } from "../runtime/client.js";
import { resolveDivebellHomeDirectory } from "../../utils/home.js";
import type { CliOperationLogEntry } from "../../utils/operation-log.js";

import type { BridgeStarter, ManagedBridgeState, BridgeStateStore, BridgeProcessController, EnsureBridgeOptions, EnsureBridgeResult, StartDedicatedBridgeOptions, StartDedicatedBridgeResult, StopBridgeOptions, StopBridgeResult, WaitForRuntimeSelectionOptions } from "./types.js";
export type { BridgeStartOptions, BridgeStartResult, BridgeStarter, ManagedBridgeState, BridgeStateStore, BridgeProcessController, EnsureBridgeOptions, EnsureBridgeResult, StartDedicatedBridgeOptions, StartDedicatedBridgeResult, StopBridgeOptions, StopBridgeResult, WaitForRuntimeSelectionOptions } from "./types.js";

export interface ListedManagedBridge extends ManagedBridgeState {
  index: number;
  alive: boolean;
  stale: boolean;
  uptimeMs: number | null;
  uptime: string | null;
  directories: string[];
  pages: string[];
}

export interface ListManagedBridgesOptions {
  stateDirectory?: string;
  operationLogDirectory?: string;
  processController?: BridgeProcessController;
  now?: number;
}

export interface KillManagedBridgeResult {
  bridgeUrl: string;
  pid?: number;
  stopped: boolean;
  killed: boolean;
  signal?: "SIGTERM" | "SIGKILL";
  reason?: string;
  cleanedState: boolean;
}

export interface KillManagedBridgeOptions {
  state: ManagedBridgeState;
  stateStore: BridgeStateStore;
  force?: boolean;
  processController?: BridgeProcessController;
}

export function createDetachedBridgeStarter(entryModuleUrl: string): BridgeStarter {
  return {
    start: async ({ port }) => await startDetachedBridge(entryModuleUrl, port)
  };
}

async function startDetachedBridge(entryModuleUrl: string, port: number): Promise<{
  pid?: number;
  port: number;
  bridgeUrl: string;
}> {
  const child = spawn(process.execPath, [
    fileURLToPath(entryModuleUrl),
    "__bridge-server",
    "--port",
    String(port)
  ], {
    detached: true,
    stdio: ["ignore", "ignore", "pipe", "ipc"]
  });

  return await new Promise((resolve, reject) => {
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    const timer = setTimeout(() => {
      cleanup();
      stopStartingBridge(child.pid);
      releaseChild();
      reject(new Error("Divebell Bridge did not report its listening address."));
    }, 5000);

    const cleanup = () => {
      clearTimeout(timer);
      child.off("error", onError);
      child.off("exit", onExit);
      child.off("message", onMessage);
    };
    const releaseChild = () => {
      if (child.connected) child.disconnect();
      child.stderr?.destroy();
      child.unref();
    };
    const onError = (error: Error) => {
      cleanup();
      releaseChild();
      reject(error);
    };
    const onExit = (code: number | null) => {
      cleanup();
      releaseChild();
      const detail = stderr.trim();
      reject(new Error(
        `Divebell Bridge exited before startup completed${code === null ? "." : ` with code ${code}.`}` +
        (detail.length === 0 ? "" : ` ${detail}`)
      ));
    };
    const onMessage = (message: unknown) => {
      if (!isBridgeReadyMessage(message)) return;
      cleanup();
      releaseChild();
      resolve({
        ...(child.pid === undefined ? {} : { pid: child.pid }),
        port: message.port,
        bridgeUrl: message.url
      });
    };

    child.once("error", onError);
    child.once("exit", onExit);
    child.on("message", onMessage);
  });
}

function isBridgeReadyMessage(value: unknown): value is {
  type: "divebell.bridge.ready";
  port: number;
  url: string;
} {
  if (value === null || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return message.type === "divebell.bridge.ready" &&
    typeof message.port === "number" &&
    typeof message.url === "string";
}

function stopStartingBridge(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {}
}

export function createFileBridgeStateStore(
  bridgeUrl: string,
  stateDirectory = resolveDivebellHomeDirectory()
): BridgeStateStore {
  const stateFile = join(stateDirectory, `${createStateFileName(bridgeUrl)}.json`);
  return {
    read: async () => {
      try {
        const parsed: unknown = JSON.parse(await readFile(stateFile, "utf8"));
        if (!isManagedBridgeState(parsed)) return undefined;
        return parsed;
      } catch {
        return undefined;
      }
    },
    write: async (state) => {
      await mkdir(stateDirectory, { recursive: true });
      await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    },
    remove: async () => {
      await rm(stateFile, { force: true });
    }
  };
}

export async function ensureBridge(options: EnsureBridgeOptions): Promise<EnsureBridgeResult> {
  const firstProbe = await probeBridge(options.fetcher, options.bridgeUrl);
  if (firstProbe === "available") {
    return {
      bridgeUrl: options.bridgeUrl,
      status: "running"
    };
  }
  if (firstProbe === "wrong-service") {
    throw new Error(`A non-Divebell service is responding at ${options.bridgeUrl}. Use --bridge or --port to choose another Bridge.`);
  }

  const port = options.port ?? getBridgePort(options.bridgeUrl);
  if (port === undefined || !canAutoStartBridge(options.bridgeUrl)) {
    throw new Error(`Divebell Bridge is not reachable at ${options.bridgeUrl}. Use a local --bridge URL for automatic startup, or start the remote Bridge yourself.`);
  }

  const startResult = await options.starter.start({ port });
  const deadline = Date.now() + (options.timeout ?? 5000);
  while (Date.now() <= deadline) {
    const probe = await probeBridge(options.fetcher, options.bridgeUrl);
    if (probe === "available") {
      if (startResult?.pid !== undefined && options.stateStore !== undefined) {
        await options.stateStore.write({
          bridgeUrl: options.bridgeUrl,
          pid: startResult.pid,
          port,
          startedAt: Date.now()
        });
      }
      return {
        bridgeUrl: options.bridgeUrl,
        status: "started",
        ...createOptionalNumberProperty("pid", startResult?.pid)
      };
    }
    if (probe === "wrong-service") {
      throw new Error(`A non-Divebell service is responding at ${options.bridgeUrl}. Use --bridge or --port to choose another Bridge.`);
    }
    await sleep(100);
  }

  throw new Error(`Divebell Bridge did not become available at ${options.bridgeUrl}.`);
}

export async function startDedicatedBridge(
  options: StartDedicatedBridgeOptions
): Promise<StartDedicatedBridgeResult> {
  const requestedPort = options.port ?? 0;
  if (requestedPort !== 0) {
    const requestedBridgeUrl = `http://localhost:${requestedPort}`;
    const probe = await probeBridge(options.fetcher, requestedBridgeUrl);
    if (probe !== "unreachable") {
      throw new Error(`Port ${requestedPort} is already in use. Choose another port or omit --port.`);
    }
  }

  const startResult = await options.starter.start({ port: requestedPort });
  const port = startResult?.port ?? (requestedPort === 0 ? undefined : requestedPort);
  const bridgeUrl = startResult?.bridgeUrl ?? (port === undefined ? undefined : `http://localhost:${port}`);
  if (port === undefined || bridgeUrl === undefined) {
    stopStartingBridge(startResult?.pid);
    throw new Error("Divebell Bridge did not return its assigned port.");
  }

  const deadline = Date.now() + (options.timeout ?? 5000);
  while (Date.now() <= deadline) {
    const probe = await probeBridge(options.fetcher, bridgeUrl);
    if (probe === "available") {
      if (startResult?.pid !== undefined) {
        await createFileBridgeStateStore(bridgeUrl, options.stateDirectory).write({
          bridgeUrl,
          pid: startResult.pid,
          port,
          startedAt: Date.now()
        });
      }
      return {
        bridgeUrl,
        port,
        status: "started",
        ...createOptionalNumberProperty("pid", startResult?.pid)
      };
    }
    if (probe === "wrong-service") {
      stopStartingBridge(startResult?.pid);
      throw new Error(`A non-Divebell service is responding at ${bridgeUrl}.`);
    }
    await sleep(100);
  }

  stopStartingBridge(startResult?.pid);
  throw new Error(`Divebell Bridge did not become available at ${bridgeUrl}.`);
}

export async function stopManagedBridge(options: StopBridgeOptions): Promise<StopBridgeResult> {
  const processController = options.processController ?? defaultBridgeProcessController;
  const state = await options.stateStore.read();
  if (state === undefined) {
    return {
      bridgeUrl: options.bridgeUrl,
      stopped: false,
      reason: "No Divebell Bridge process started by this CLI was found."
    };
  }

  if (normalizeUrl(state.bridgeUrl) !== normalizeUrl(options.bridgeUrl)) {
    return {
      bridgeUrl: options.bridgeUrl,
      stopped: false,
      reason: `Tracked Bridge is ${state.bridgeUrl}, not ${options.bridgeUrl}.`
    };
  }

  if (!processController.isRunning(state.pid)) {
    await options.stateStore.remove();
    return {
      bridgeUrl: options.bridgeUrl,
      pid: state.pid,
      stopped: false,
      reason: "Tracked Divebell Bridge process is no longer running."
    };
  }

  processController.stop(state.pid);
  await options.stateStore.remove();
  return {
    bridgeUrl: options.bridgeUrl,
    pid: state.pid,
    stopped: true
  };
}

export async function waitForSelectedRuntime(
  options: WaitForRuntimeSelectionOptions
): Promise<BridgeRuntimeInfo> {
  const deadline = Date.now() + (options.timeout ?? 10000);
  let lastError: unknown;

  while (Date.now() <= deadline) {
    try {
      const runtimes = await fetchRuntimes(options.fetcher, options.bridgeUrl);
      return selectRuntime(runtimes, options.selector);
    } catch (error) {
      lastError = error;
      await sleep(100);
    }
  }

  if (lastError instanceof Error) {
    throw new Error(`${lastError.message} Make sure the page service is running and the page connects to Divebell Bridge.`);
  }
  throw new Error("No connected runtime was found. Make sure the page service is running and the page connects to Divebell Bridge.");
}

export function getBridgePort(bridgeUrl: string): number | undefined {
  try {
    const url = new URL(bridgeUrl);
    if (url.port.length > 0) {
      return Number(url.port);
    }
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]") {
      return DIVEBELL_BRIDGE_DEFAULT_PORT;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function probeBridge(fetcher: Fetcher, bridgeUrl: string): Promise<"available" | "unreachable" | "wrong-service"> {
  try {
    const response = await fetcher(`${bridgeUrl}/runtimes`);
    if (!response.ok) {
      return "wrong-service";
    }

    const body = await response.text();
    const parsed: unknown = body.length === 0 ? undefined : JSON.parse(body);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { runtimes?: unknown }).runtimes)
    ) {
      return "available";
    }
    return "wrong-service";
  } catch {
    return "unreachable";
  }
}

export function canAutoStartBridge(bridgeUrl: string): boolean {
  try {
    const url = new URL(bridgeUrl);
    return url.protocol === "http:" && (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

function createStateFileName(bridgeUrl: string): string {
  return `bridge-${bridgeUrl.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}

function isManagedBridgeState(value: unknown): value is ManagedBridgeState {
  if (value === null || typeof value !== "object") return false;
  const state = value as Partial<ManagedBridgeState>;
  return typeof state.bridgeUrl === "string" &&
    typeof state.pid === "number" &&
    typeof state.port === "number" &&
    typeof state.startedAt === "number";
}

const defaultBridgeProcessController: BridgeProcessController = {
  isRunning: (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  },
  stop: (pid) => {
    process.kill(pid, "SIGTERM");
  }
};

function normalizeUrl(value: string): string {
  try {
    return new URL(value).toString();
  } catch {
    return value;
  }
}

function createOptionalNumberProperty<Name extends string>(
  name: Name,
  value: number | undefined
): Record<Name, number> | Record<string, never> {
  return value === undefined ? {} : { [name]: value } as Record<Name, number>;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

const BRIDGE_STATE_FILE_PREFIX = "bridge-";
const BRIDGE_STATE_FILE_SUFFIX = ".json";
const OPERATION_LOG_FILE_PREFIX = "open-";
const OPERATION_LOG_FILE_SUFFIX = ".json";

export async function listManagedBridges(
  options: ListManagedBridgesOptions = {}
): Promise<{ count: number; items: ListedManagedBridge[] }> {
  const stateDirectory = options.stateDirectory ?? resolveDivebellHomeDirectory();
  const operationLogDirectory = options.operationLogDirectory ?? join(stateDirectory, "operations");
  const processController = options.processController ?? defaultBridgeProcessController;
  const now = options.now ?? Date.now();

  const [states, operations] = await Promise.all([
    readBridgeStateFiles(stateDirectory),
    readOperationLogEntries(operationLogDirectory)
  ]);

  const byBridgeUrl = new Map<string, { directories: Set<string>; pages: Set<string> }>();
  for (const operation of operations) {
    if (operation.bridgeUrl === null) continue;
    const key = normalizeUrl(operation.bridgeUrl);
    let bucket = byBridgeUrl.get(key);
    if (bucket === undefined) {
      bucket = { directories: new Set(), pages: new Set() };
      byBridgeUrl.set(key, bucket);
    }
    bucket.directories.add(operation.cwd);
    if (typeof operation.url === "string") bucket.pages.add(operation.url);
    if (typeof operation.openedUrl === "string") bucket.pages.add(operation.openedUrl);
  }

  const items: ListedManagedBridge[] = states
    .slice()
    .sort((left, right) => left.startedAt - right.startedAt)
    .map((state, i) => {
      const alive = processController.isRunning(state.pid);
      const stale = !alive;
      const uptimeMs = stale ? null : Math.max(0, now - state.startedAt);
      const bucket = byBridgeUrl.get(normalizeUrl(state.bridgeUrl));
      return {
        ...state,
        index: i + 1,
        alive,
        stale,
        uptimeMs,
        uptime: uptimeMs === null ? null : formatUptime(uptimeMs),
        directories: bucket === undefined ? [] : [...bucket.directories].sort(),
        pages: bucket === undefined ? [] : [...bucket.pages].sort()
      };
    });

  return { count: items.length, items };
}

export async function killManagedBridge(
  options: KillManagedBridgeOptions
): Promise<KillManagedBridgeResult> {
  const processController = options.processController ?? defaultBridgeProcessController;
  const { state, stateStore } = options;
  const result: KillManagedBridgeResult = {
    bridgeUrl: state.bridgeUrl,
    pid: state.pid,
    stopped: false,
    killed: false,
    cleanedState: false
  };

  if (!processController.isRunning(state.pid)) {
    try {
      await stateStore.remove();
      result.cleanedState = true;
    } catch {}
    result.reason = "Tracked divebell daemon process is no longer running.";
    return result;
  }

  const signal: "SIGTERM" | "SIGKILL" = options.force === true ? "SIGKILL" : "SIGTERM";
  try {
    if (signal === "SIGKILL") {
      process.kill(state.pid, "SIGKILL");
    } else {
      processController.stop(state.pid);
    }
    result.killed = true;
    result.stopped = true;
    result.signal = signal;
  } catch (error) {
    result.reason = error instanceof Error ? error.message : String(error);
    if (!processController.isRunning(state.pid)) result.stopped = true;
  }

  try {
    await stateStore.remove();
    result.cleanedState = true;
  } catch {}

  return result;
}

async function readBridgeStateFiles(stateDirectory: string): Promise<ManagedBridgeState[]> {
  let entries: string[];
  try {
    entries = await readdir(stateDirectory);
  } catch {
    return [];
  }
  const files = entries.filter(
    (name) =>
      name.startsWith(BRIDGE_STATE_FILE_PREFIX) && name.endsWith(BRIDGE_STATE_FILE_SUFFIX)
  );
  const results: ManagedBridgeState[] = [];
  for (const file of files) {
    try {
      const parsed: unknown = JSON.parse(await readFile(join(stateDirectory, file), "utf8"));
      if (isManagedBridgeState(parsed)) results.push(parsed);
    } catch {}
  }
  return results;
}

async function readOperationLogEntries(
  operationLogDirectory: string
): Promise<CliOperationLogEntry[]> {
  let entries: string[];
  try {
    entries = await readdir(operationLogDirectory);
  } catch {
    return [];
  }
  const files = entries.filter(
    (name) =>
      name.startsWith(OPERATION_LOG_FILE_PREFIX) && name.endsWith(OPERATION_LOG_FILE_SUFFIX)
  );
  const results: CliOperationLogEntry[] = [];
  for (const file of files) {
    try {
      const parsed: unknown = JSON.parse(
        await readFile(join(operationLogDirectory, file), "utf8")
      );
      if (isCliOperationLogEntry(parsed)) results.push(parsed);
    } catch {}
  }
  return results;
}

function isCliOperationLogEntry(value: unknown): value is CliOperationLogEntry {
  if (value === null || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    (entry.schemaVersion === 2 || entry.schemaVersion === 3 || entry.schemaVersion === 4 || entry.schemaVersion === 5) &&
    entry.command === "open" &&
    typeof entry.cwd === "string" &&
    typeof entry.url === "string"
  );
}

function formatUptime(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (parts.length === 0 || seconds > 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}
