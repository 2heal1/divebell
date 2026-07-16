import { OPEN_RUNTIME_SESSION_QUERY_PARAM, type RuntimeDataCondition, type RuntimeSnapshot, type RuntimeTargetDescriptor } from "@openruntime/core";
import type { BridgeRuntimeInfo } from "@openruntime/bridge";
import { readFile } from "node:fs/promises";
import {
  createGetWindowScript,
  createWaitEvalScript,
  parseBrowserJsonOutput,
  type BrowserRunner
} from "./browser.js";
import {
  canAutoStartBridge,
  ensureBridge as ensureOpenRuntimeBridge,
  type BridgeStarter,
  type BridgeStateStore,
  type EnsureBridgeResult
} from "./bridge-process.js";
import {
  fetchInputOptions,
  fetchRuntimeResource,
  fetchRuntimes,
  normalizeBridgeUrl,
  runRuntimeAction,
  selectRuntime,
  waitForRuntime,
  type Fetcher,
  type RuntimeResourceResult,
  type RuntimeSelector
} from "./client.js";
import { getNumberOption, getOptionValue, type ParsedCliArgs } from "./args.js";
import { createError } from "./output.js";
import type { CliOperationLogEntry } from "./operation-log.js";

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
  targets<T = RuntimeTargetDescriptor[]>(query?: OpenRuntimeResourceQuery): Promise<RuntimeResourceResult<T>>;
  snapshot<T = RuntimeSnapshot>(query?: OpenRuntimeResourceQuery): Promise<RuntimeResourceResult<T>>;
  events<T = unknown>(query?: OpenRuntimeResourceQuery): Promise<RuntimeResourceResult<T>>;
  actions<T = unknown>(query?: OpenRuntimeResourceQuery): Promise<RuntimeResourceResult<T>>;
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

export function createOpenRuntimeExtensionApi(options: CreateOpenRuntimeExtensionApiOptions): OpenRuntimeExtensionApi {
  const bridgeUrl = createBridgeUrl(options.args);
  const runtimeSelector = createRuntimeSelector(options.args);

  const ensureLocalBridge = async (
    ensureOptions: { port?: number; timeout?: number } = {}
  ): Promise<EnsureBridgeResult | { bridgeUrl: string; status: "remote" }> => {
    if (!canAutoStartBridge(bridgeUrl)) {
      return {
        bridgeUrl,
        status: "remote"
      };
    }
    return await ensureOpenRuntimeBridge({
      fetcher: options.fetcher,
      bridgeUrl,
      starter: options.bridgeStarter,
      ...createOptionalNumberProperty("port", ensureOptions.port ?? getNumberOption(options.args, "port")),
      ...(options.bridgeStateStore === undefined ? {} : { stateStore: options.bridgeStateStore }),
      ...(ensureOptions.timeout === undefined ? {} : { timeout: ensureOptions.timeout })
    });
  };

  const listRuntimes = async (): Promise<BridgeRuntimeInfo[]> => {
    await ensureLocalBridge();
    return await fetchRuntimes(options.fetcher, bridgeUrl);
  };

  const chooseRuntime = async (selector: RuntimeSelector = runtimeSelector): Promise<BridgeRuntimeInfo> => {
    if (!hasRuntimeSelectorValue(selector) && options.openContext === undefined) {
      throw createOpenContextRequiredError();
    }
    return selectRuntime(await listRuntimes(), selector);
  };

  const fetchResource = async <T>(
    resource: "targets" | "snapshot" | "events" | "actions",
    query: OpenRuntimeResourceQuery | undefined,
    selector: RuntimeSelector | undefined
  ): Promise<RuntimeResourceResult<T>> => {
    const runtime = await chooseRuntime(selector);
    return await fetchRuntimeResource<T>(
      options.fetcher,
      bridgeUrl,
      runtime,
      resource,
      createSearchParams(query)
    );
  };

  return {
    targets: async (query) => await fetchResource("targets", query, undefined),
    snapshot: async (query) => await fetchResource("snapshot", query, undefined),
    events: async (query) => await fetchResource("events", query, undefined),
    actions: async (query) => await fetchResource("actions", query, undefined),
    inputOptions: async (actionName, inputName, inputOptions = {}) => {
      const runtime = await chooseRuntime();
      return await fetchInputOptions(
        options.fetcher,
        bridgeUrl,
        runtime,
        actionName,
        inputName,
        inputOptions.payload,
        inputOptions.timeout
      );
    },
    runAction: async (actionName, payload) => {
      const runtime = await chooseRuntime();
      return await runRuntimeAction(options.fetcher, bridgeUrl, runtime, actionName, payload);
    },
    waitFor: async (targetId, status, waitOptions = {}) => {
      const runtime = await chooseRuntime();
      return await waitForRuntime(
        options.fetcher,
        bridgeUrl,
        runtime,
        targetId,
        status,
        waitOptions.timeout,
        waitOptions.where
      );
    },
    browser: createOpenRuntimeBrowserApi({
      browserRunner: options.browserRunner,
      ...(options.openContext === undefined ? {} : { openContext: options.openContext })
    })
  };
}

function createOpenRuntimeBrowserApi(options: {
  browserRunner: BrowserRunner;
  openContext?: CliOperationLogEntry;
}): OpenRuntimeBrowserApi {
  const runText = async (args: string[]): Promise<string> => {
    if (options.openContext === undefined) {
      throw createOpenContextRequiredError();
    }
    const result = await options.browserRunner.run(args);
    if (result.exitCode !== 0) {
      throw createError({
        code: "PAGE_OPERATION_FAILED",
        kind: "browser",
        message: result.stderr.trim() || result.stdout.trim() || `Browser command "${args[0] ?? "unknown"}" failed.`,
        details: {
          command: args,
          ...(result.stdout.trim().length === 0 ? {} : { stdout: result.stdout.trim() }),
          ...(result.stderr.trim().length === 0 ? {} : { stderr: result.stderr.trim() })
        }
      });
    }
    return result.stdout.trim();
  };
  const runJson = async <T>(args: string[]): Promise<T> => {
    const output = await runText(args);
    return parseBrowserJsonOutput(output) as T;
  };

  return {
    pageSnapshot: async <T = unknown>() => await runText(["snapshot"]) as T,
    click: async (target) => await runText(["click", normalizeAgentBrowserTarget(target)]),
    fill: async (target, value) => await runText(["fill", normalizeAgentBrowserTarget(target), value]),
    eval: async (script) => await runJson(["eval", script]),
    evalFile: async (path) => await runJson(["eval", await readFile(path, "utf8")]),
    waitEval: async (script, waitOptions = {}) =>
      await waitForBrowserEval(options.browserRunner, script, waitOptions.timeout),
    getWindow: async (path) => await runJson(["eval", createGetWindowScript(path)]),
    screenshot: async (name, screenshotOptions = {}) => {
      const args = ["screenshot"];
      if (name !== undefined && name.length > 0) {
        args.push(name);
      }
      if (screenshotOptions.fullPage === true) {
        args.push("--full");
      }
      return await runText(args);
    },
    network: async (networkOptions = {}) => {
      const output = await runText(["network", "requests"]);
      return networkOptions.url === undefined
        ? normalizeNetworkOutput(output)
        : filterNetworkOutputByUrl(output, networkOptions.url);
    },
    console: async (consoleOptions = {}) => {
      const levels = normalizeConsoleLevels(consoleOptions.levels);
      const entries = filterConsoleEntries(
        parseConsoleEntries(await runJson(["console", "--json"])),
        {
          ...(levels === undefined ? {} : { levels }),
          ...(consoleOptions.query === undefined ? {} : { query: consoleOptions.query }),
          ...(consoleOptions.limit === undefined ? {} : { limit: consoleOptions.limit })
        }
      );
      return {
        entries,
        summary: summarizeConsoleEntries(entries)
      };
    },
    memory: {
      metrics: async (memoryOptions = {}) => {
        if (memoryOptions.collectGarbage !== false) {
          await runJson(["memory", "collect-garbage", "--json"]);
        }
        return await runJson(["memory", "metrics", "--json"]);
      },
      status: async () => await runJson(["memory", "status", "--json"]),
      sampling: {
        start: async (memoryOptions = {}) => {
          const args = ["memory", "sampling", "start"];
          appendNumberOption(args, "sampling-interval", memoryOptions.samplingInterval);
          args.push("--json");
          return await runJson(args);
        },
        stop: async (memoryOptions = {}) => {
          const args = ["memory", "sampling", "stop"];
          if (memoryOptions.path !== undefined) args.push(memoryOptions.path);
          appendNumberOption(args, "top", memoryOptions.top);
          appendNumberOption(args, "max-size", memoryOptions.maxSize);
          args.push("--json");
          return await runJson(args);
        }
      },
      snapshot: async (memoryOptions = {}) => {
        const args = ["memory", "snapshot"];
        if (memoryOptions.path !== undefined) args.push(memoryOptions.path);
        if (memoryOptions.collectGarbage === false) args.push("--no-gc");
        appendNumberOption(args, "timeout", memoryOptions.timeout);
        appendNumberOption(args, "max-size", memoryOptions.maxSize);
        args.push("--json");
        return await runJson(args);
      },
      collectGarbage: async () => await runJson(["memory", "collect-garbage", "--json"]),
      cancel: async () => await runJson(["memory", "cancel", "--json"])
    },
    coverage: {
      status: async () => await runJson(["coverage", "status", "--json"]),
      start: async (coverageOptions = {}) => {
        const args = ["coverage", "start"];
        if (coverageOptions.callCount === true) args.push("--call-count");
        args.push("--json");
        return await runJson(args);
      },
      take: async (coverageOptions = {}) =>
        await runJson(createCoverageCheckpointArgs("take", coverageOptions)),
      stop: async (coverageOptions = {}) =>
        await runJson(createCoverageCheckpointArgs("stop", coverageOptions)),
      cancel: async () => await runJson(["coverage", "cancel", "--json"])
    }
  };
}

function createCoverageCheckpointArgs(
  operation: "take" | "stop",
  options: OpenRuntimeBrowserCoverageCheckpointOptions
): string[] {
  const args = ["coverage", operation];
  if (options.path !== undefined) args.push(options.path);
  if (options.label !== undefined) args.push("--label", options.label);
  appendNumberOption(args, "max-size", options.maxSize);
  args.push("--json");
  return args;
}

function appendNumberOption(args: string[], name: string, value: number | undefined): void {
  if (value !== undefined) {
    args.push(`--${name}`, String(value));
  }
}

function hasRuntimeSelectorValue(selector: RuntimeSelector): boolean {
  return selector.runtimeId !== undefined || selector.sessionId !== undefined || selector.url !== undefined;
}

function createOpenContextRequiredError(): Error {
  return createError({
    code: "OPEN_CONTEXT_REQUIRED",
    kind: "validation",
    message: "No opened page context was found.",
    retryable: false,
    hint: "Run `openruntime open <url>` before running page commands."
  });
}

function createRuntimeSelector(args: ParsedCliArgs): RuntimeSelector {
  const selector: RuntimeSelector = {};
  const runtimeId = getOptionValue(args, "runtime");
  const sessionId = getOptionValue(args, "session");
  const url = getOptionValue(args, "url");
  if (runtimeId !== undefined) selector.runtimeId = runtimeId;
  if (sessionId !== undefined) selector.sessionId = sessionId;
  if (url !== undefined) selector.url = withOpenRuntimeSession(url, sessionId);
  return selector;
}

function createBridgeUrl(args: ParsedCliArgs): string {
  const bridge = getOptionValue(args, "bridge");
  if (bridge !== undefined) {
    return normalizeBridgeUrl(bridge);
  }

  const port = getNumberOption(args, "port");
  if (port !== undefined) {
    return `http://localhost:${port}`;
  }

  return normalizeBridgeUrl(undefined);
}

function createSearchParams(query: OpenRuntimeResourceQuery | undefined): URLSearchParams {
  const params = new URLSearchParams();
  if (query === undefined) return params;

  for (const [rawName, rawValue] of Object.entries(query)) {
    const name = normalizeQueryName(rawName);
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      if (value === undefined) continue;
      params.append(name, value === null ? "null" : String(value));
    }
  }
  return params;
}

function normalizeQueryName(name: string): string {
  if (name === "targetId") return "target-id";
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function withOpenRuntimeSession(input: string, sessionId: string | undefined): string {
  if (sessionId === undefined || sessionId.length === 0) return input;

  try {
    const url = new URL(input);
    url.searchParams.set(OPEN_RUNTIME_SESSION_QUERY_PARAM, sessionId);
    return url.toString();
  } catch {
    return input;
  }
}

async function waitForBrowserEval(
  browserRunner: BrowserRunner,
  script: string,
  timeout: number | undefined
): Promise<OpenRuntimeBrowserWaitEvalResult> {
  const deadline = Date.now() + (timeout ?? 5000);
  let lastValue: unknown;
  let lastError: string | undefined;

  while (Date.now() <= deadline) {
    const result = await browserRunner.run(["eval", createWaitEvalScript(script)]);
    if (result.exitCode === 0) {
      try {
        lastValue = parseBrowserJsonOutput(result.stdout);
        if (lastValue === true) {
          return {
            success: true,
            condition: { script },
            value: lastValue
          };
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    } else {
      lastError = result.stderr.trim() || result.stdout.trim();
    }
    await sleep(100);
  }

  return {
    success: false,
    condition: { script },
    ...(lastValue === undefined ? {} : { value: lastValue }),
    reason: lastError === undefined
      ? "Condition did not become true before timeout."
      : `Condition did not become true before timeout. Last error: ${lastError}`
  };
}

function parseConsoleEntries(value: unknown): OpenRuntimeBrowserConsoleEntry[] {
  const rawEntries = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.messages)
      ? value.messages
      : [];

  return rawEntries.flatMap((entry): OpenRuntimeBrowserConsoleEntry[] => {
    if (entry === null || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const level = normalizeConsoleLevel(item.level ?? item.type);
    if (level === undefined) return [];
    return [{
      level,
      args: typeof item.text === "string"
        ? item.text
        : typeof item.args === "string"
          ? item.args
          : String(item.args ?? ""),
      ...(typeof item.timestamp === "number" ? { timestamp: item.timestamp } : {})
    }];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeConsoleLevels(
  levels: OpenRuntimeBrowserConsoleOptions["levels"] | undefined
): Set<OpenRuntimeBrowserConsoleLevel> | undefined {
  if (levels === undefined) return undefined;
  return levels instanceof Set ? levels : new Set(levels);
}

function normalizeConsoleLevel(value: unknown): OpenRuntimeBrowserConsoleLevel | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.toLowerCase();
  if (normalized === "warning") return "warn";
  if (normalized === "log" || normalized === "info" || normalized === "warn" || normalized === "error") {
    return normalized;
  }
  return undefined;
}

function filterConsoleEntries(
  entries: OpenRuntimeBrowserConsoleEntry[],
  options: {
    levels?: Set<OpenRuntimeBrowserConsoleLevel>;
    query?: string;
    limit?: number;
  }
): OpenRuntimeBrowserConsoleEntry[] {
  const normalizedQuery = options.query?.toLowerCase();
  const filtered = entries.filter((entry) =>
    (options.levels === undefined || options.levels.has(entry.level)) &&
    (normalizedQuery === undefined ||
      entry.level.includes(normalizedQuery) ||
      entry.args.toLowerCase().includes(normalizedQuery))
  );

  if (options.limit === undefined || options.limit < 0) return filtered;
  return filtered.slice(-options.limit);
}

function summarizeConsoleEntries(entries: OpenRuntimeBrowserConsoleEntry[]): OpenRuntimeBrowserConsoleResult["summary"] {
  const summary = {
    total: entries.length,
    log: 0,
    info: 0,
    warn: 0,
    error: 0
  };
  for (const entry of entries) {
    summary[entry.level] += 1;
  }
  return summary;
}

function filterNetworkOutputByUrl(output: string, query: string): string {
  const normalized = normalizeNetworkOutput(output);
  if (normalized.trim() === "(no requests)") return normalized;

  const lines = normalized.split(/\r?\n/);
  const filtered = lines.filter((line) => {
    if (line.length === 0 || line.startsWith("#")) return true;
    return getNetworkLineUrl(line)?.includes(query) ?? false;
  });
  return filtered.join("\n");
}

function normalizeNetworkOutput(output: string): string {
  return output.split(/\r?\n/).filter((line) => !line.includes("network <idx>")).join("\n");
}

function getNetworkLineUrl(line: string): string | undefined {
  const parts = line.trim().split(/\s+/);
  if (/^\[[^\]]+\]$/.test(parts[0] ?? "") && parts.length >= 3) {
    return parts[2];
  }
  return parts.length >= 6 ? parts[5] : undefined;
}

function normalizeAgentBrowserTarget(target: string): string {
  const trimmed = target.trim();
  return /^e\d+$/.test(trimmed) ? `@${trimmed}` : target;
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
