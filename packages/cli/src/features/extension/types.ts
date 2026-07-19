import type { RuntimeDataCondition, RuntimeSnapshot, RuntimeTargetDescriptor } from "@openruntime/core";
import type { BrowserRunner } from "../browser/runner.js";
import {
  type BridgeStarter,
  type BridgeStateStore
} from "../bridge/process.js";
import {
  type Fetcher,
  type RuntimeResourceResult,
  type RuntimeSelector
} from "../runtime/client.js";
import type { ParsedCliArgs } from "../../utils/args.js";
import type { CliOperationLogEntry } from "../../utils/operation-log.js";

export type OpenRuntimeQueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly (string | number | boolean | null | undefined)[];

export type OpenRuntimeResourceQuery = Record<string, OpenRuntimeQueryValue>;

export interface OpenRuntimeWaitOptions {
  timeout?: number;
  where?: RuntimeDataCondition[];
}

export interface OpenRuntimeInputOptionsRequest {
  payload?: Record<string, unknown>;
  timeout?: number;
}

export interface OpenRuntimeBrowserScreenshotOptions {
  fullPage?: boolean;
}

export interface OpenRuntimeBrowserNetworkOptions {
  url?: string;
}

export type OpenRuntimeBrowserConsoleLevel = "log" | "info" | "warn" | "error";

export interface OpenRuntimeBrowserConsoleOptions {
  levels?: OpenRuntimeBrowserConsoleLevel[] | Set<OpenRuntimeBrowserConsoleLevel>;
  query?: string;
  limit?: number;
}

export interface OpenRuntimeBrowserConsoleEntry {
  level: OpenRuntimeBrowserConsoleLevel;
  args: string;
  timestamp?: number;
}

export interface OpenRuntimeBrowserConsoleResult {
  entries: OpenRuntimeBrowserConsoleEntry[];
  summary: {
    total: number;
    log: number;
    info: number;
    warn: number;
    error: number;
  };
}

export interface OpenRuntimeBrowserWaitEvalResult {
  success: boolean;
  condition: { script: string };
  value?: unknown;
  reason?: string;
}

export interface OpenRuntimeBrowserMemoryBaseResult {
  memoryApiVersion: number;
}

export interface OpenRuntimeBrowserMemoryMetricsResult extends OpenRuntimeBrowserMemoryBaseResult {
  browserSession: string;
  targetId: string;
  url: string;
  timestamp: string;
  jsHeapUsedSize: number | null;
  jsHeapTotalSize: number | null;
  documents: number | null;
  nodes: number | null;
  jsEventListeners: number | null;
}

export type OpenRuntimeBrowserMemoryStatusResult = OpenRuntimeBrowserMemoryBaseResult & (
  | { active: false }
  | {
      active: true;
      captureId: string;
      captureType: "sampling" | "snapshot";
      browserSession: string;
      targetId: string;
      url: string;
      startedAt: string;
      outputPath: string | null;
      samplingInterval: number | null;
      cancelRequested: boolean;
    }
);

export interface OpenRuntimeBrowserMemoryCaptureResult extends OpenRuntimeBrowserMemoryBaseResult {
  captureId: string;
  captureType: "sampling" | "snapshot";
  browserSession: string;
  targetId: string;
  url: string;
  startedAt: string;
}

export interface OpenRuntimeBrowserMemorySamplingStopResult extends OpenRuntimeBrowserMemoryCaptureResult {
  finishedAt: string;
  samplingInterval: number;
  path: string;
  fileSize: number;
  allocationBytes: number;
  topFunctions: Array<{
    functionName: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
    selfSize: number;
  }>;
}

export interface OpenRuntimeBrowserMemorySnapshotResult extends OpenRuntimeBrowserMemoryCaptureResult {
  finishedAt: string;
  path: string;
  fileSize: number;
  chunkCount: number;
  durationMs: number;
  garbageCollectedFirst: boolean;
  valid: boolean;
}

export interface OpenRuntimeBrowserMemorySamplingStartOptions {
  samplingInterval?: number;
}

export interface OpenRuntimeBrowserMemoryMetricsOptions {
  collectGarbage?: boolean;
}

export interface OpenRuntimeBrowserMemorySamplingStopOptions {
  path?: string;
  top?: number;
  maxSize?: number;
}

export interface OpenRuntimeBrowserMemorySnapshotOptions {
  path?: string;
  collectGarbage?: boolean;
  timeout?: number;
  maxSize?: number;
}

export interface OpenRuntimeBrowserMemoryApi {
  metrics<T = OpenRuntimeBrowserMemoryMetricsResult>(
    options?: OpenRuntimeBrowserMemoryMetricsOptions
  ): Promise<T>;
  status<T = OpenRuntimeBrowserMemoryStatusResult>(): Promise<T>;
  sampling: {
    start<T = OpenRuntimeBrowserMemoryCaptureResult>(
      options?: OpenRuntimeBrowserMemorySamplingStartOptions
    ): Promise<T>;
    stop<T = OpenRuntimeBrowserMemorySamplingStopResult>(
      options?: OpenRuntimeBrowserMemorySamplingStopOptions
    ): Promise<T>;
  };
  snapshot<T = OpenRuntimeBrowserMemorySnapshotResult>(
    options?: OpenRuntimeBrowserMemorySnapshotOptions
  ): Promise<T>;
  collectGarbage<T = unknown>(): Promise<T>;
  cancel<T = unknown>(): Promise<T>;
}

export interface OpenRuntimeBrowserCoverageBaseResult {
  coverageApiVersion: number;
}

export type OpenRuntimeBrowserCoverageStatusResult = OpenRuntimeBrowserCoverageBaseResult & (
  | { active: false }
  | {
      active: true;
      captureId: string;
      browserSession: string;
      targetId: string;
      url: string;
      startedAt: string;
      callCount: boolean;
      checkpointCount: number;
    }
);

export interface OpenRuntimeBrowserCoverageStartOptions {
  callCount?: boolean;
}

export interface OpenRuntimeBrowserCoverageCheckpointOptions {
  path?: string;
  label?: string;
  maxSize?: number;
}

export interface OpenRuntimeBrowserCoverageCheckpointResult extends OpenRuntimeBrowserCoverageBaseResult {
  captureId: string;
  checkpoint: number;
  label: string | null;
  browserSession: string;
  targetId: string;
  url: string;
  capturedAt: string;
  path: string;
  fileSize: number;
  scriptCount: number;
  functionCount: number;
  rangeCount: number;
}

export interface OpenRuntimeBrowserCoverageApi {
  status<T = OpenRuntimeBrowserCoverageStatusResult>(): Promise<T>;
  start<T = OpenRuntimeBrowserCoverageStatusResult>(
    options?: OpenRuntimeBrowserCoverageStartOptions
  ): Promise<T>;
  take<T = OpenRuntimeBrowserCoverageCheckpointResult>(
    options?: OpenRuntimeBrowserCoverageCheckpointOptions
  ): Promise<T>;
  stop<T = OpenRuntimeBrowserCoverageCheckpointResult>(
    options?: OpenRuntimeBrowserCoverageCheckpointOptions
  ): Promise<T>;
  cancel<T = unknown>(): Promise<T>;
}

export interface OpenRuntimeBrowserApi {
  raw(args: string[], options?: { ui?: boolean }): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
  profileDirectory(): string;
  pageSnapshot<T = unknown>(): Promise<T>;
  click(target: string): Promise<string>;
  fill(target: string, value: string): Promise<string>;
  eval<T = unknown>(script: string): Promise<T>;
  evalFile<T = unknown>(path: string): Promise<T>;
  waitEval(script: string, options?: { timeout?: number }): Promise<OpenRuntimeBrowserWaitEvalResult>;
  getWindow<T = unknown>(path: string): Promise<T>;
  screenshot(name?: string, options?: OpenRuntimeBrowserScreenshotOptions): Promise<string>;
  network(options?: OpenRuntimeBrowserNetworkOptions): Promise<string>;
  console(options?: OpenRuntimeBrowserConsoleOptions): Promise<OpenRuntimeBrowserConsoleResult>;
  memory: OpenRuntimeBrowserMemoryApi;
  coverage: OpenRuntimeBrowserCoverageApi;
}

export interface OpenRuntimeExtensionApi {
  scope(options: {
    bridge?: string;
    runtime?: string;
    session?: string;
    url?: string;
  }): OpenRuntimeExtensionApi;
  ensureBridge(options?: { port?: number; timeout?: number }): Promise<unknown>;
  targets<T = RuntimeTargetDescriptor[]>(query?: OpenRuntimeResourceQuery, selector?: RuntimeSelector): Promise<RuntimeResourceResult<T>>;
  snapshot<T = RuntimeSnapshot>(query?: OpenRuntimeResourceQuery, selector?: RuntimeSelector): Promise<RuntimeResourceResult<T>>;
  events<T = unknown>(query?: OpenRuntimeResourceQuery, selector?: RuntimeSelector): Promise<RuntimeResourceResult<T>>;
  actions<T = unknown>(query?: OpenRuntimeResourceQuery, selector?: RuntimeSelector): Promise<RuntimeResourceResult<T>>;
  inputOptions<T = unknown>(
    actionName: string,
    inputName: string,
    options?: OpenRuntimeInputOptionsRequest
  ): Promise<RuntimeResourceResult<T>>;
  runAction<T = unknown>(
    actionName: string,
    payload?: Record<string, unknown>
  ): Promise<RuntimeResourceResult<T>>;
  waitFor<T = unknown>(
    targetId: string,
    status: string,
    options?: OpenRuntimeWaitOptions
  ): Promise<RuntimeResourceResult<T>>;
  browser: OpenRuntimeBrowserApi;
}

export interface CreateOpenRuntimeExtensionApiOptions {
  args: ParsedCliArgs;
  fetcher: Fetcher;
  browserRunner: BrowserRunner;
  bridgeStarter: BridgeStarter;
  bridgeStateStore?: BridgeStateStore;
  openContext?: CliOperationLogEntry;
}
