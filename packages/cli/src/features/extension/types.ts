import type { RuntimeDataCondition, RuntimeSnapshot, RuntimeTargetDescriptor } from "@divebell/core";
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

export type DivebellQueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly (string | number | boolean | null | undefined)[];

export type DivebellResourceQuery = Record<string, DivebellQueryValue>;

export interface DivebellWaitOptions {
  timeout?: number;
  where?: RuntimeDataCondition[];
}

export interface DivebellBrowserScreenshotOptions {
  fullPage?: boolean;
}

export interface DivebellBrowserNetworkOptions {
  url?: string;
  resourceTypes?: readonly string[];
  method?: string;
  status?: string | number;
}

export interface DivebellBrowserNetworkRequestSummary {
  id: string;
  url: string;
  method: string;
  resourceType?: string;
  status?: number;
}

export interface DivebellBrowserNetworkRequestDetail extends DivebellBrowserNetworkRequestSummary {
  request: {
    headers: Readonly<Record<string, string>>;
    body?: string;
  };
  response?: {
    status?: number;
    headers: Readonly<Record<string, string>>;
    mimeType?: string;
    body?: string;
  };
}

export interface DivebellBrowserNetworkRouteOptions {
  abort?: boolean;
  body?: unknown;
  resourceType?: string;
}

export interface DivebellBrowserHarStartOptions {
  content?: "text" | "all" | "none";
}

export interface DivebellBrowserArtifactResult {
  path: string;
}

export interface DivebellBrowserNetworkApi {
  list(options?: DivebellBrowserNetworkOptions): Promise<DivebellBrowserNetworkRequestSummary[]>;
  get(requestId: string): Promise<DivebellBrowserNetworkRequestDetail>;
  clear(): Promise<void>;
  route(pattern: string, options?: DivebellBrowserNetworkRouteOptions): Promise<void>;
  unroute(pattern?: string): Promise<void>;
  har: {
    start(options?: DivebellBrowserHarStartOptions): Promise<void>;
    stop(path?: string): Promise<DivebellBrowserArtifactResult>;
  };
}

export type DivebellBrowserConsoleLevel = "log" | "info" | "warn" | "error";

export interface DivebellBrowserConsoleOptions {
  levels?: DivebellBrowserConsoleLevel[] | Set<DivebellBrowserConsoleLevel>;
  query?: string;
  limit?: number;
}

export interface DivebellBrowserConsoleEntry {
  level: DivebellBrowserConsoleLevel;
  args: string;
  timestamp?: number;
}

export interface DivebellBrowserConsoleResult {
  entries: DivebellBrowserConsoleEntry[];
  summary: {
    total: number;
    log: number;
    info: number;
    warn: number;
    error: number;
  };
}

export interface DivebellBrowserConsoleApi {
  list(options?: DivebellBrowserConsoleOptions): Promise<DivebellBrowserConsoleResult>;
  clear(): Promise<void>;
}

export interface DivebellBrowserWaitEvalResult {
  success: boolean;
  condition: { script: string };
  value?: unknown;
  reason?: string;
}

export interface DivebellBrowserMemoryBaseResult {
  memoryApiVersion: number;
}

export interface DivebellBrowserMemoryMetricsResult extends DivebellBrowserMemoryBaseResult {
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

export type DivebellBrowserMemoryStatusResult = DivebellBrowserMemoryBaseResult & (
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

export interface DivebellBrowserMemoryCaptureResult extends DivebellBrowserMemoryBaseResult {
  captureId: string;
  captureType: "sampling" | "snapshot";
  browserSession: string;
  targetId: string;
  url: string;
  startedAt: string;
}

export interface DivebellBrowserMemorySamplingStopResult extends DivebellBrowserMemoryCaptureResult {
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

export interface DivebellBrowserMemorySnapshotResult extends DivebellBrowserMemoryCaptureResult {
  finishedAt: string;
  path: string;
  fileSize: number;
  chunkCount: number;
  durationMs: number;
  garbageCollectedFirst: boolean;
  valid: boolean;
}

export interface DivebellBrowserMemorySamplingStartOptions {
  samplingInterval?: number;
}

export interface DivebellBrowserMemoryMetricsOptions {
  collectGarbage?: boolean;
}

export interface DivebellBrowserMemorySamplingStopOptions {
  path?: string;
  top?: number;
  maxSize?: number;
}

export interface DivebellBrowserMemorySnapshotOptions {
  path?: string;
  collectGarbage?: boolean;
  timeout?: number;
  maxSize?: number;
}

export interface DivebellBrowserMemoryApi {
  metrics(
    options?: DivebellBrowserMemoryMetricsOptions
  ): Promise<DivebellBrowserMemoryMetricsResult>;
  status(): Promise<DivebellBrowserMemoryStatusResult>;
  sampling: {
    start(
      options?: DivebellBrowserMemorySamplingStartOptions
    ): Promise<DivebellBrowserMemoryCaptureResult>;
    stop(
      options?: DivebellBrowserMemorySamplingStopOptions
    ): Promise<DivebellBrowserMemorySamplingStopResult>;
  };
  snapshot(
    options?: DivebellBrowserMemorySnapshotOptions
  ): Promise<DivebellBrowserMemorySnapshotResult>;
  collectGarbage(): Promise<unknown>;
  cancel(): Promise<unknown>;
}

export interface DivebellBrowserCoverageBaseResult {
  coverageApiVersion: number;
}

export type DivebellBrowserCoverageStatusResult = DivebellBrowserCoverageBaseResult & (
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

export interface DivebellBrowserCoverageStartOptions {
  callCount?: boolean;
}

export interface DivebellBrowserCoverageCheckpointOptions {
  path?: string;
  label?: string;
  maxSize?: number;
}

export interface DivebellBrowserCoverageCheckpointResult extends DivebellBrowserCoverageBaseResult {
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

export interface DivebellBrowserCoverageApi {
  status(): Promise<DivebellBrowserCoverageStatusResult>;
  start(
    options?: DivebellBrowserCoverageStartOptions
  ): Promise<DivebellBrowserCoverageStatusResult>;
  take(
    options?: DivebellBrowserCoverageCheckpointOptions
  ): Promise<DivebellBrowserCoverageCheckpointResult>;
  stop(
    options?: DivebellBrowserCoverageCheckpointOptions
  ): Promise<DivebellBrowserCoverageCheckpointResult>;
  cancel(): Promise<unknown>;
}

export interface DivebellBrowserRawOptions {
  ui?: boolean;
  input?: string;
}

export interface DivebellBrowserRawResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface DivebellBrowserApi {
  raw(args: readonly string[], options?: DivebellBrowserRawOptions): Promise<DivebellBrowserRawResult>;
  profileDirectory(): string;
  pageSnapshot(): Promise<string>;
  click(target: string): Promise<string>;
  fill(target: string, value: string): Promise<string>;
  focus(target: string): Promise<string>;
  press(key: string): Promise<string>;
  select(target: string, value: string | readonly string[]): Promise<string>;
  eval<T = unknown>(script: string): Promise<T>;
  evalFile<T = unknown>(path: string): Promise<T>;
  waitEval(script: string, options?: { timeout?: number }): Promise<DivebellBrowserWaitEvalResult>;
  wait(milliseconds: number): Promise<void>;
  getWindow<T = unknown>(path: string): Promise<T>;
  highlight(target: string): Promise<void>;
  screenshot(name?: string, options?: DivebellBrowserScreenshotOptions): Promise<string>;
  network: DivebellBrowserNetworkApi;
  console: DivebellBrowserConsoleApi;
  memory: DivebellBrowserMemoryApi;
  coverage: DivebellBrowserCoverageApi;
}

export interface DivebellExtensionApi {
  targets<T = RuntimeTargetDescriptor[]>(query?: DivebellResourceQuery, selector?: RuntimeSelector): Promise<RuntimeResourceResult<T>>;
  snapshot<T = RuntimeSnapshot>(query?: DivebellResourceQuery, selector?: RuntimeSelector): Promise<RuntimeResourceResult<T>>;
  events<T = unknown>(query?: DivebellResourceQuery, selector?: RuntimeSelector): Promise<RuntimeResourceResult<T>>;
  actions<T = unknown>(query?: DivebellResourceQuery, selector?: RuntimeSelector): Promise<RuntimeResourceResult<T>>;
  runAction<T = unknown>(
    actionName: string,
    payload?: Record<string, unknown>
  ): Promise<RuntimeResourceResult<T>>;
  waitFor<T = unknown>(
    targetId: string,
    status: string,
    options?: DivebellWaitOptions
  ): Promise<RuntimeResourceResult<T>>;
  browser: DivebellBrowserApi;
}

export interface CreateDivebellExtensionApiOptions {
  args: ParsedCliArgs;
  fetcher: Fetcher;
  browserRunner: BrowserRunner;
  bridgeStarter: BridgeStarter;
  bridgeStateStore?: BridgeStateStore;
  openContext?: CliOperationLogEntry;
}
