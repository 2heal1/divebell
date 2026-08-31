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

export interface DivebellBrowserTab {
  tabId: string;
  targetId?: string;
  label?: string | null;
  title?: string;
  url: string;
  type?: string;
  active: boolean;
}

export interface DivebellBrowserTabsApi {
  list(): Promise<DivebellBrowserTab[]>;
  activate(tab: string): Promise<void>;
}

export interface DivebellBrowserDebugTargetOptions {
  tab?: string;
}

export interface DivebellBrowserDebugStatusOptions extends DivebellBrowserDebugTargetOptions {
  allTabs?: boolean;
}

export interface DivebellBrowserDebugDisableOptions extends DivebellBrowserDebugStatusOptions {
  resume?: boolean;
}

export interface DivebellBrowserDebugSession {
  sessionId: string;
  documentGeneration: number;
  enabled: boolean;
  tabId?: string;
  targetId?: string;
  paused?: boolean;
}

export interface DivebellBrowserDebugStatusResult {
  connectionGeneration: number;
  enabledSessions: number;
  sessions: DivebellBrowserDebugSession[];
  engine?: string;
  paused?: boolean;
  pauses?: unknown[];
}

export interface DivebellBrowserDebugEnableResult {
  enabled: boolean;
  connectionGeneration: number;
  sessions: Array<{
    sessionId: string;
    tabId?: string;
    targetId?: string;
    debuggerId?: string | null;
  }>;
}

export interface DivebellBrowserDebugDisableResult {
  disabled: boolean;
  sessions: string[];
  resumed: string[];
}

export interface DivebellBrowserDebugScript {
  connectionGeneration: number;
  sessionId: string;
  documentGeneration: number;
  scriptId: string;
  executionContextId?: number;
  url?: string;
  scriptInstanceKey?: unknown;
  runtimeOwner?: unknown;
}

export interface DivebellBrowserDebugScriptsOptions extends DivebellBrowserDebugTargetOptions {
  filter?: string;
}

export interface DivebellBrowserDebugSourceResult {
  script: DivebellBrowserDebugScript;
  scriptSource: string;
  bytecode?: string | null;
}

export interface DivebellBrowserDebugSourceSearchOptions extends DivebellBrowserDebugTargetOptions {
  filter?: string;
  maxResults?: number;
}

export interface DivebellBrowserDebugSourceSearchResult {
  query: string;
  searchedScripts: number;
  matches: Array<{
    matchIndex?: number;
    scriptId: string;
    sessionId: string;
    url?: string;
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
    byteOffset?: number;
    context?: string;
  }>;
  truncated: boolean;
}

export interface DivebellBrowserDebugEvent {
  sequence: number;
  timestamp: number;
  type: string;
  connectionGeneration: number;
  sessionId?: string;
  documentGeneration?: number;
  data?: unknown;
}

export interface DivebellBrowserDebugEventsOptions {
  since?: number;
  wait?: number;
  clear?: boolean;
}

export interface DivebellBrowserDebugEventsResult {
  events: DivebellBrowserDebugEvent[];
  oldestSequence?: number;
  latestSequence: number;
  gap: boolean;
  bufferGap: boolean;
  transportGap: boolean;
  droppedThroughSequence?: number;
  lastTransportGapSequence?: number;
}

export type DivebellBrowserDebugLocationMode =
  | "strict"
  | "before"
  | "after"
  | "nearest"
  | "nearest-forward";

export interface DivebellBrowserDebugLogpointSetOptions extends DivebellBrowserDebugTargetOptions {
  scriptId: string;
  line: number;
  column?: number;
  expressions: readonly string[];
  when?: string;
  mode?: DivebellBrowserDebugLocationMode;
  maxLines?: number;
  maxUtf16Distance?: number;
  persist?: boolean;
  tags?: Readonly<Record<string, string>>;
}

export interface DivebellBrowserDebugProbeResult {
  probeId: string;
  kind?: "breakpoint" | "logpoint";
  enabled?: boolean;
  persistent?: boolean;
  status: string;
  condition?: string | null;
  when?: string | null;
  expressions?: string[];
  tags?: Record<string, string>;
  target?: unknown;
  bindings?: Array<{
    physicalId?: string;
    cdpBreakpointId?: string;
    probeId?: string;
    connectionGeneration?: number;
    sessionId?: string;
    documentGeneration?: number;
    scriptId?: string;
    executionContextId?: number | null;
    requestedLocation?: {
      line?: number;
      column?: number;
    };
    actualLocation?: {
      line?: number;
      column?: number;
    };
  }>;
}

export interface DivebellBrowserDebugProbeListResult {
  kind?: "breakpoint" | "logpoint";
  probes: DivebellBrowserDebugProbeResult[];
}

export interface DivebellBrowserDebugProbeRemoveResult {
  removed: boolean;
  probeId: string;
  cleanupErrors: string[];
}

export interface DivebellBrowserDebugApi {
  status(options?: DivebellBrowserDebugStatusOptions): Promise<DivebellBrowserDebugStatusResult>;
  enable(options?: DivebellBrowserDebugStatusOptions): Promise<DivebellBrowserDebugEnableResult>;
  disable(options?: DivebellBrowserDebugDisableOptions): Promise<DivebellBrowserDebugDisableResult>;
  scripts(options?: DivebellBrowserDebugScriptsOptions): Promise<DivebellBrowserDebugScript[]>;
  source(
    scriptId: string,
    options?: DivebellBrowserDebugTargetOptions
  ): Promise<DivebellBrowserDebugSourceResult>;
  sourceSearch(
    query: string,
    options?: DivebellBrowserDebugSourceSearchOptions
  ): Promise<DivebellBrowserDebugSourceSearchResult>;
  events(options?: DivebellBrowserDebugEventsOptions): Promise<DivebellBrowserDebugEventsResult>;
  logpoints: {
    set(options: DivebellBrowserDebugLogpointSetOptions): Promise<DivebellBrowserDebugProbeResult>;
    list(): Promise<DivebellBrowserDebugProbeListResult>;
    remove(probeId: string): Promise<DivebellBrowserDebugProbeRemoveResult>;
  };
  breakpoints: {
    list(): Promise<DivebellBrowserDebugProbeListResult>;
  };
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

export interface DivebellBrowserWebMcpAnnotations {
  readOnly?: boolean;
  untrustedContent?: boolean;
  consequential?: boolean;
  autosubmit?: boolean;
}

export interface DivebellBrowserWebMcpPage {
  tabId: string;
  targetId: string;
  url: string;
}

export interface DivebellBrowserWebMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  frameId: string;
  source: "imperative" | "declarative";
  annotations?: DivebellBrowserWebMcpAnnotations;
  backendNodeId?: number;
}

export interface DivebellBrowserWebMcpListResult {
  apiVersion: number;
  tools: readonly DivebellBrowserWebMcpTool[];
  count: number;
  page: DivebellBrowserWebMcpPage;
}

export interface DivebellBrowserWebMcpCallOptions {
  frameId?: string;
  timeout?: number;
}

export interface DivebellBrowserWebMcpCallError {
  message: string;
  exception?: unknown;
}

export interface DivebellBrowserWebMcpCallResult<T = unknown> {
  apiVersion: number;
  invocationId: string;
  status: "completed" | "canceled" | "error";
  tool: DivebellBrowserWebMcpTool;
  trust: "untrusted";
  page: DivebellBrowserWebMcpPage;
  output?: T;
  error?: DivebellBrowserWebMcpCallError;
}

export interface DivebellBrowserWebMcpApi {
  list(): Promise<DivebellBrowserWebMcpListResult>;
  call<T = unknown>(
    toolName: string,
    input?: Readonly<Record<string, unknown>>,
    options?: DivebellBrowserWebMcpCallOptions
  ): Promise<DivebellBrowserWebMcpCallResult<T>>;
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
  tabs: DivebellBrowserTabsApi;
  network: DivebellBrowserNetworkApi;
  console: DivebellBrowserConsoleApi;
  memory: DivebellBrowserMemoryApi;
  coverage: DivebellBrowserCoverageApi;
  webmcp: DivebellBrowserWebMcpApi;
  debug: DivebellBrowserDebugApi;
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
