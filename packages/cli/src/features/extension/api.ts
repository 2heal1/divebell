import { DIVEBELL_SESSION_QUERY_PARAM } from "@divebell/core";
import type { BridgeRuntimeInfo } from "@divebell/bridge";
import { readFile } from "node:fs/promises";
import {
  createGetWindowScript,
  createWaitEvalScript,
  parseBrowserJsonOutput,
  resolveBrowserProfileDirectory,
  type BrowserRunOptions,
  type BrowserRunner
} from "../browser/runner.js";
import { normalizeAgentBrowserTarget } from "../browser/command-args.js";
import {
  canAutoStartBridge,
  createFileBridgeStateStore,
  ensureBridge as ensureDivebellBridge,
  type EnsureBridgeResult
} from "../bridge/process.js";
import { waitForRuntimeCommand } from "../runtime/wait.js";
import {
  fetchRuntimeResource,
  fetchRuntimes,
  normalizeBridgeUrl,
  runRuntimeAction,
  selectRuntime,
  type RuntimeResourceResult,
  type RuntimeSelector
} from "../runtime/client.js";
import { getNumberOption, getOptionValue, type ParsedCliArgs } from "../../utils/args.js";
import { createError } from "../../utils/output.js";
import type { CliOperationLogEntry } from "../../utils/operation-log.js";
import { applyOpenContextBrowserMode } from "../../open-context.js";

import type {
  CreateDivebellExtensionApiOptions,
  DivebellBrowserApi,
  DivebellBrowserConsoleEntry,
  DivebellBrowserConsoleLevel,
  DivebellBrowserConsoleOptions,
  DivebellBrowserConsoleResult,
  DivebellBrowserCoverageCheckpointOptions,
  DivebellBrowserNetworkRequestDetail,
  DivebellBrowserNetworkRequestSummary,
  DivebellBrowserWaitEvalResult,
  DivebellExtensionApi,
  DivebellResourceQuery,
  DivebellWaitOptions
} from "./types.js";
export type * from "./types.js";

export function createDivebellExtensionApi(options: CreateDivebellExtensionApiOptions): DivebellExtensionApi {
  const bridgeUrl = createBridgeUrl(options.args);
  const runtimeSelector = createRuntimeSelector(options.args);
  const browserRunner = applyOpenContextBrowserMode(options.browserRunner, options.openContext);

  const ensureLocalBridge = async (
    ensureOptions: { port?: number; timeout?: number } = {}
  ): Promise<EnsureBridgeResult | { bridgeUrl: string; status: "remote" }> => {
    if (!canAutoStartBridge(bridgeUrl)) {
      return {
        bridgeUrl,
        status: "remote"
      };
    }
    return await ensureDivebellBridge({
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
    query: DivebellResourceQuery | undefined,
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
    targets: async (query, selector) => await fetchResource("targets", query, selector),
    snapshot: async (query, selector) => await fetchResource("snapshot", query, selector),
    events: async (query, selector) => await fetchResource("events", query, selector),
    actions: async (query, selector) => await fetchResource("actions", query, selector),
    runAction: async (actionName, payload) => {
      const runtime = await chooseRuntime();
      return await runRuntimeAction(options.fetcher, bridgeUrl, runtime, actionName, payload);
    },
    waitFor: async <T = unknown>(targetId: string, status: string, waitOptions: DivebellWaitOptions = {}) => {
      const waitArgs = withNumberOption(options.args, "timeout", waitOptions.timeout);
      return await waitForRuntimeCommand(
        waitArgs,
        options.fetcher,
        bridgeUrl,
        browserRunner,
        options.bridgeStarter,
        options.bridgeStateStore ?? createFileBridgeStateStore(bridgeUrl),
        targetId,
        status,
        waitOptions.where
      ) as RuntimeResourceResult<T>;
    },
    browser: createDivebellBrowserApi({
      browserRunner,
      allowWithoutOpenContext: hasRuntimeSelectorValue(runtimeSelector),
      ...(options.openContext === undefined ? {} : { openContext: options.openContext })
    })
  };
}

function withNumberOption(args: ParsedCliArgs, name: string, value: number | undefined): ParsedCliArgs {
  if (value === undefined) return args;
  const options = new Map(args.options);
  options.set(name, [String(value)]);
  return {
    command: [...args.command],
    options
  };
}

function createDivebellBrowserApi(options: {
  browserRunner: BrowserRunner;
  allowWithoutOpenContext: boolean;
  openContext?: CliOperationLogEntry;
}): DivebellBrowserApi {
  const requireOpenContext = (): void => {
    if (options.openContext === undefined && !options.allowWithoutOpenContext) {
      throw createOpenContextRequiredError();
    }
  };
  const runText = async (
    args: string[],
    runOptions: BrowserRunOptions = {}
  ): Promise<string> => {
    requireOpenContext();
    const result = await options.browserRunner.run(args, runOptions);
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
    raw: async (args, runOptions = {}) => await options.browserRunner.run([...args], runOptions),
    profileDirectory: () => resolveBrowserProfileDirectory(),
    pageSnapshot: async () => await runText(["snapshot"]),
    click: async (target) => await runText(["click", normalizeAgentBrowserTarget(target)]),
    fill: async (target, value) => await runText(["fill", normalizeAgentBrowserTarget(target), value]),
    focus: async (target) => await runText(["focus", normalizeAgentBrowserTarget(target)]),
    press: async (key) => await runText(["press", key]),
    select: async (target, value) => await runText([
      "select",
      normalizeAgentBrowserTarget(target),
      ...(typeof value === "string" ? [value] : value)
    ]),
    eval: async (script) => await runJson(["eval", script]),
    evalFile: async (path) => await runJson(["eval", await readFile(path, "utf8")]),
    waitEval: async (script, waitOptions = {}) =>
      await waitForBrowserEval(options.browserRunner, script, waitOptions.timeout),
    wait: async (milliseconds) => {
      if (!Number.isFinite(milliseconds) || milliseconds < 0) {
        throw createError({
          code: "INVALID_BROWSER_WAIT",
          kind: "validation",
          message: "Browser wait duration must be a non-negative finite number.",
          retryable: false
        });
      }
      await runText(["wait", String(milliseconds)]);
    },
    getWindow: async (path) => await runJson(["eval", createGetWindowScript(path)]),
    highlight: async (target) => {
      await runText(["highlight", normalizeAgentBrowserTarget(target)]);
    },
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
    network: {
      list: async (networkOptions = {}) => {
        const args = ["network", "requests"];
        if (networkOptions.url !== undefined) args.push("--filter", networkOptions.url);
        if (networkOptions.resourceTypes !== undefined && networkOptions.resourceTypes.length > 0) {
          args.push("--type", networkOptions.resourceTypes.join(","));
        }
        if (networkOptions.method !== undefined) args.push("--method", networkOptions.method);
        if (networkOptions.status !== undefined) args.push("--status", String(networkOptions.status));
        args.push("--json");
        return parseNetworkRequestSummaries(await runJson(args));
      },
      get: async (requestId) =>
        parseNetworkRequestDetail(await runJson(["network", "request", requestId, "--json"])),
      clear: async () => {
        await runText(["network", "requests", "--clear"]);
      },
      route: async (pattern, routeOptions = {}) => {
        const args = ["network", "route", pattern];
        if (routeOptions.abort === true) args.push("--abort");
        if (routeOptions.body !== undefined) {
          args.push(
            "--body",
            typeof routeOptions.body === "string"
              ? routeOptions.body
              : JSON.stringify(routeOptions.body)
          );
        }
        if (routeOptions.resourceType !== undefined) {
          args.push("--resource-type", routeOptions.resourceType);
        }
        await runText(args);
      },
      unroute: async (pattern) => {
        await runText(["network", "unroute", ...(pattern === undefined ? [] : [pattern])]);
      },
      har: {
        start: async (harOptions = {}) => {
          const args = ["network", "har", "start"];
          if (harOptions.content !== undefined) args.push("--content", harOptions.content);
          await runText(args);
        },
        stop: async (path) => {
          const value = await runJson<unknown>([
            "network",
            "har",
            "stop",
            ...(path === undefined ? [] : [path]),
            "--json"
          ]);
          return { path: readArtifactPath(value, path) };
        }
      }
    },
    console: {
      list: async (consoleOptions = {}) => {
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
      clear: async () => {
        await runText(["console", "--clear"]);
      }
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
  options: DivebellBrowserCoverageCheckpointOptions
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
    hint: "Run `divebell open <url>` before running page commands."
  });
}

function createRuntimeSelector(args: ParsedCliArgs): RuntimeSelector {
  const selector: RuntimeSelector = {};
  const runtimeId = getOptionValue(args, "runtime");
  const sessionId = getOptionValue(args, "session");
  const url = getOptionValue(args, "url");
  if (runtimeId !== undefined) selector.runtimeId = runtimeId;
  if (sessionId !== undefined) selector.sessionId = sessionId;
  if (url !== undefined) selector.url = withDivebellSession(url, sessionId);
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

function createSearchParams(query: DivebellResourceQuery | undefined): URLSearchParams {
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

function withDivebellSession(input: string, sessionId: string | undefined): string {
  if (sessionId === undefined || sessionId.length === 0) return input;

  try {
    const url = new URL(input);
    url.searchParams.set(DIVEBELL_SESSION_QUERY_PARAM, sessionId);
    return url.toString();
  } catch {
    return input;
  }
}

async function waitForBrowserEval(
  browserRunner: BrowserRunner,
  script: string,
  timeout: number | undefined
): Promise<DivebellBrowserWaitEvalResult> {
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

function parseConsoleEntries(value: unknown): DivebellBrowserConsoleEntry[] {
  const rawEntries = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.messages)
      ? value.messages
      : [];

  return rawEntries.flatMap((entry): DivebellBrowserConsoleEntry[] => {
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
  levels: DivebellBrowserConsoleOptions["levels"] | undefined
): Set<DivebellBrowserConsoleLevel> | undefined {
  if (levels === undefined) return undefined;
  return levels instanceof Set ? levels : new Set(levels);
}

function normalizeConsoleLevel(value: unknown): DivebellBrowserConsoleLevel | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.toLowerCase();
  if (normalized === "warning") return "warn";
  if (normalized === "log" || normalized === "info" || normalized === "warn" || normalized === "error") {
    return normalized;
  }
  return undefined;
}

function filterConsoleEntries(
  entries: DivebellBrowserConsoleEntry[],
  options: {
    levels?: Set<DivebellBrowserConsoleLevel>;
    query?: string;
    limit?: number;
  }
): DivebellBrowserConsoleEntry[] {
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

function summarizeConsoleEntries(entries: DivebellBrowserConsoleEntry[]): DivebellBrowserConsoleResult["summary"] {
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

function parseNetworkRequestSummaries(value: unknown): DivebellBrowserNetworkRequestSummary[] {
  const requests = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.requests)
      ? value.requests
      : undefined;
  if (requests === undefined) {
    throw createInvalidBrowserOutputError("network requests", value);
  }
  return requests.map((request) => parseNetworkRequestSummary(request));
}

function parseNetworkRequestSummary(value: unknown): DivebellBrowserNetworkRequestSummary {
  if (!isRecord(value)) {
    throw createInvalidBrowserOutputError("network request summary", value);
  }
  const id = readRequiredString(value, ["requestId", "id"]);
  const url = readRequiredString(value, ["url"]);
  const method = readRequiredString(value, ["method"]);
  return {
    id,
    url,
    method,
    ...(typeof value.resourceType === "string" ? { resourceType: value.resourceType } : {}),
    ...(typeof value.status === "number" ? { status: value.status } : {})
  };
}

function parseNetworkRequestDetail(value: unknown): DivebellBrowserNetworkRequestDetail {
  const summary = parseNetworkRequestSummary(value);
  if (!isRecord(value)) {
    throw createInvalidBrowserOutputError("network request detail", value);
  }
  const requestHeaders = readHeaders(value.headers);
  const requestBody = typeof value.postData === "string" ? value.postData : undefined;
  const responseHeaders = readHeaders(value.responseHeaders);
  const responseBody = typeof value.body === "string" ? value.body : undefined;
  const mimeType = typeof value.mimeType === "string" ? value.mimeType : undefined;
  const hasResponse = value.status !== undefined
    || Object.keys(responseHeaders).length > 0
    || responseBody !== undefined
    || mimeType !== undefined;
  return {
    ...summary,
    request: {
      headers: requestHeaders,
      ...(requestBody === undefined ? {} : { body: requestBody })
    },
    ...(hasResponse
      ? {
          response: {
            ...(typeof value.status === "number" ? { status: value.status } : {}),
            headers: responseHeaders,
            ...(mimeType === undefined ? {} : { mimeType }),
            ...(responseBody === undefined ? {} : { body: responseBody })
          }
        }
      : {})
  };
}

function readHeaders(value: unknown): Readonly<Record<string, string>> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([name, headerValue]) =>
      typeof headerValue === "string" ? [[name, headerValue]] : []
    )
  );
}

function readRequiredString(
  value: Record<string, unknown>,
  names: readonly string[]
): string {
  for (const name of names) {
    const candidate = value[name];
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  throw createInvalidBrowserOutputError(`field ${names.join(" or ")}`, value);
}

function readArtifactPath(value: unknown, requestedPath: string | undefined): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (isRecord(value)) {
    for (const name of ["path", "outputPath"] as const) {
      const candidate = value[name];
      if (typeof candidate === "string" && candidate.length > 0) return candidate;
    }
  }
  if (requestedPath !== undefined && requestedPath.length > 0) return requestedPath;
  throw createInvalidBrowserOutputError("HAR output path", value);
}

function createInvalidBrowserOutputError(context: string, value: unknown): Error {
  return createError({
    code: "BROWSER_OUTPUT_INVALID",
    kind: "browser",
    message: `Browser returned invalid ${context} output.`,
    details: { value }
  });
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
