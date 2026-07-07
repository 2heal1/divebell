import { OPEN_RUNTIME_SESSION_QUERY_PARAM, type RuntimeDataCondition, type RuntimeSnapshot, type RuntimeTargetDescriptor } from "@openruntime/core";
import type { BridgeRuntimeInfo } from "@openruntime/bridge";
import {
  createConsoleLogScript,
  createGetWindowScript,
  createWaitEvalScript,
  parseBrowserJsonOutput,
  type BrowserRunOptions,
  type BrowserRunResult,
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

export type OpenRuntimeQueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly (string | number | boolean | null | undefined)[];

export type OpenRuntimeResourceQuery = Record<string, OpenRuntimeQueryValue>;

export interface OpenRuntimeWaitOptions {
  selector?: RuntimeSelector;
  timeout?: number;
  where?: RuntimeDataCondition[];
}

export interface OpenRuntimeInputOptionsRequest {
  selector?: RuntimeSelector;
  payload?: Record<string, unknown>;
  timeout?: number;
}

export interface OpenRuntimeBrowserOpenOptions extends BrowserRunOptions {
  sessionId?: string;
  cookies?: string;
  noBridge?: boolean;
}

export interface OpenRuntimeBrowserGotoOptions {
  sessionId?: string;
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

export interface OpenRuntimeBrowserApi {
  raw(args: string[], options?: BrowserRunOptions): Promise<BrowserRunResult>;
  open(url: string, options?: OpenRuntimeBrowserOpenOptions): Promise<string>;
  goto(url: string, options?: OpenRuntimeBrowserGotoOptions): Promise<string>;
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
  close(): Promise<string>;
}

export interface OpenRuntimeExtensionApi {
  bridgeUrl: string;
  runtimeSelector: RuntimeSelector;
  ensureBridge(options?: { port?: number; timeout?: number }): Promise<EnsureBridgeResult | { bridgeUrl: string; status: "remote" }>;
  runtimes(): Promise<BridgeRuntimeInfo[]>;
  selectRuntime(selector?: RuntimeSelector): Promise<BridgeRuntimeInfo>;
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
    payload?: Record<string, unknown>,
    selector?: RuntimeSelector
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
    bridgeUrl,
    runtimeSelector,
    ensureBridge: ensureLocalBridge,
    runtimes: listRuntimes,
    selectRuntime: chooseRuntime,
    targets: async (query, selector) => await fetchResource("targets", query, selector),
    snapshot: async (query, selector) => await fetchResource("snapshot", query, selector),
    events: async (query, selector) => await fetchResource("events", query, selector),
    actions: async (query, selector) => await fetchResource("actions", query, selector),
    inputOptions: async (actionName, inputName, inputOptions = {}) => {
      const runtime = await chooseRuntime(inputOptions.selector);
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
    runAction: async (actionName, payload, selector) => {
      const runtime = await chooseRuntime(selector);
      return await runRuntimeAction(options.fetcher, bridgeUrl, runtime, actionName, payload);
    },
    waitFor: async (targetId, status, waitOptions = {}) => {
      const runtime = await chooseRuntime(waitOptions.selector);
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
      args: options.args,
      browserRunner: options.browserRunner,
      ensureLocalBridge
    })
  };
}

function createOpenRuntimeBrowserApi(options: {
  args: ParsedCliArgs;
  browserRunner: BrowserRunner;
  ensureLocalBridge(): Promise<unknown>;
}): OpenRuntimeBrowserApi {
  const runText = async (args: string[], runOptions?: BrowserRunOptions): Promise<string> => {
    const result = await options.browserRunner.run(args, runOptions);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || result.stdout.trim() || `next-browser ${args[0] ?? "command"} failed.`);
    }
    return result.stdout.trim();
  };
  const runJson = async <T>(args: string[], runOptions?: BrowserRunOptions): Promise<T> => {
    const output = await runText(args, runOptions);
    return parseBrowserJsonOutput(output) as T;
  };

  return {
    raw: async (args, runOptions) => await options.browserRunner.run(args, runOptions),
    open: async (url, openOptions = {}) => {
      if (openOptions.noBridge !== true && !hasOption(options.args, "no-bridge")) {
        await options.ensureLocalBridge();
      }
      const browserArgs = ["open", withOpenRuntimeSession(url, openOptions.sessionId ?? getOptionValue(options.args, "session"))];
      if (openOptions.cookies !== undefined) {
        browserArgs.push("--cookies", openOptions.cookies);
      }
      return await runText(browserArgs, openOptions);
    },
    goto: async (url, gotoOptions = {}) =>
      await runText(["goto", withOpenRuntimeSession(url, gotoOptions.sessionId ?? getOptionValue(options.args, "session"))]),
    pageSnapshot: async () => await runJson(["snapshot"]),
    click: async (target) => await runText(["click", target]),
    fill: async (target, value) => await runText(["fill", target, value]),
    eval: async (script) => await runJson(["eval", script]),
    evalFile: async (path) => await runJson(["eval", "--file", path]),
    waitEval: async (script, waitOptions = {}) =>
      await waitForBrowserEval(options.browserRunner, script, waitOptions.timeout),
    getWindow: async (path) => await runJson(["eval", createGetWindowScript(path)]),
    screenshot: async (name, screenshotOptions = {}) => {
      const args = ["screenshot"];
      if (name !== undefined && name.length > 0) {
        args.push(name);
      }
      if (screenshotOptions.fullPage === true) {
        args.push("--full-page");
      }
      return await runText(args);
    },
    network: async (networkOptions = {}) => {
      const output = await runText(["network"]);
      return networkOptions.url === undefined
        ? normalizeNetworkOutput(output)
        : filterNetworkOutputByUrl(output, networkOptions.url);
    },
    console: async (consoleOptions = {}) => {
      const levels = normalizeConsoleLevels(consoleOptions.levels);
      const entries = filterConsoleEntries(
        parseConsoleEntries(await runJson(["eval", createConsoleLogScript()])),
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
    close: async () => await runText(["close"])
  };
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
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): OpenRuntimeBrowserConsoleEntry[] => {
    if (entry === null || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const level = normalizeConsoleLevel(item.level);
    if (level === undefined) return [];
    return [{
      level,
      args: typeof item.args === "string" ? item.args : String(item.args ?? ""),
      ...(typeof item.timestamp === "number" ? { timestamp: item.timestamp } : {})
    }];
  });
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
  if (parts.length < 6) return undefined;
  return parts[5];
}

function hasOption(args: ParsedCliArgs, name: string): boolean {
  return args.options.has(name);
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
