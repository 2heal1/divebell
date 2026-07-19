import { OPEN_RUNTIME_SESSION_QUERY_PARAM, type RuntimeDataCondition } from "@openruntime/core";
import type { BridgeRuntimeInfo } from "@openruntime/bridge";
import { normalizeOpenRuntimeUrlForMatch } from "../../utils/operation-log.js";

import type { Fetcher, RuntimeSelector, RuntimeResourceResult } from "./types.js";
export type { Fetcher, RuntimeSelector, RuntimeResourceResult } from "./types.js";

export async function fetchRuntimes(fetcher: Fetcher, bridgeUrl: string): Promise<BridgeRuntimeInfo[]> {
  const body = await requestJson<{ runtimes: BridgeRuntimeInfo[] }>(fetcher, `${bridgeUrl}/runtimes`);
  return body.runtimes;
}

export async function fetchRuntimeResource<T>(
  fetcher: Fetcher,
  bridgeUrl: string,
  runtime: BridgeRuntimeInfo,
  resource: string,
  searchParams: URLSearchParams
): Promise<RuntimeResourceResult<T>> {
  const url = new URL(`${bridgeUrl}/runtimes/${encodeURIComponent(runtime.runtimeId)}/${resource}`);
  for (const [name, value] of searchParams) {
    url.searchParams.append(name, value);
  }

  const result = await requestJson<T>(fetcher, url.toString());
  return {
    runtime,
    result
  };
}

export async function fetchInputOptions<T>(
  fetcher: Fetcher,
  bridgeUrl: string,
  runtime: BridgeRuntimeInfo,
  actionName: string,
  inputName: string,
  payload: Record<string, unknown> | undefined,
  timeout: number | undefined
): Promise<RuntimeResourceResult<T>> {
  const url = new URL(`${bridgeUrl}/runtimes/${encodeURIComponent(runtime.runtimeId)}/actions/${encodeURIComponent(actionName)}/options`);
  url.searchParams.set("input", inputName);
  if (payload !== undefined) {
    url.searchParams.set("payload", JSON.stringify(payload));
  }
  if (timeout !== undefined) {
    url.searchParams.set("timeout", String(timeout));
  }

  const result = await requestJson<T>(fetcher, url.toString());
  return {
    runtime,
    result
  };
}

export async function runRuntimeAction<T>(
  fetcher: Fetcher,
  bridgeUrl: string,
  runtime: BridgeRuntimeInfo,
  actionName: string,
  payload: Record<string, unknown> | undefined
): Promise<RuntimeResourceResult<T>> {
  const url = `${bridgeUrl}/runtimes/${encodeURIComponent(runtime.runtimeId)}/actions/${encodeURIComponent(actionName)}/run`;
  const result = await requestJson<T>(fetcher, url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload === undefined ? {} : { payload })
  });
  return {
    runtime,
    result
  };
}

export async function waitForRuntime<T>(
  fetcher: Fetcher,
  bridgeUrl: string,
  runtime: BridgeRuntimeInfo,
  targetId: string,
  status: string,
  timeout: number | undefined,
  where: RuntimeDataCondition[] | undefined
): Promise<RuntimeResourceResult<T>> {
  const url = `${bridgeUrl}/runtimes/${encodeURIComponent(runtime.runtimeId)}/wait-for`;
  const body: {
    targetId: string;
    status: string;
    timeout?: number;
    where?: RuntimeDataCondition[];
  } = {
    targetId,
    status
  };
  if (timeout !== undefined) {
    body.timeout = timeout;
  }
  if (where !== undefined && where.length > 0) {
    body.where = where;
  }

  const result = await requestJson<T>(fetcher, url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  return {
    runtime,
    result
  };
}

export function selectRuntime(
  runtimes: BridgeRuntimeInfo[],
  selector: RuntimeSelector = {},
  options: { requireUnique?: boolean } = {}
): BridgeRuntimeInfo {
  if (selector.runtimeId !== undefined) {
    const runtime = runtimes.find((item) => item.runtimeId === selector.runtimeId);
    if (runtime === undefined) {
      throw new Error(`Runtime "${selector.runtimeId}" was not found.`);
    }
    return runtime;
  }

  const selectorSessionId = selector.sessionId ?? getOpenRuntimeSessionIdFromUrl(selector.url);
  const selectorUrl = selector.url === undefined ? undefined : normalizeOpenRuntimeUrlForMatch(selector.url);
  const candidates = runtimes.filter((runtime) =>
    runtime.status === "connected" &&
    (selectorSessionId === undefined || runtimeMatchesSession(runtime, selectorSessionId)) &&
    (selectorUrl === undefined || normalizeOpenRuntimeUrlForMatch(runtime.url) === selectorUrl)
  );

  if (candidates.length === 0) {
    throw new Error(createNoRuntimeMessage(selector));
  }
  if (options.requireUnique === true && candidates.length > 1) {
    const runtimeIds = candidates.map((runtime) => runtime.runtimeId).join(", ");
    throw new Error(`Multiple connected runtimes matched. Pass --runtime with one of: ${runtimeIds}.`);
  }

  return candidates.sort((left, right) => right.lastSeenAt - left.lastSeenAt)[0] as BridgeRuntimeInfo;
}

function runtimeMatchesSession(runtime: BridgeRuntimeInfo, sessionId: string): boolean {
  return runtime.sessionId === sessionId || getOpenRuntimeSessionIdFromUrl(runtime.url) === sessionId;
}

function getOpenRuntimeSessionIdFromUrl(input: string | undefined): string | undefined {
  if (input === undefined) return undefined;
  try {
    const sessionId = new URL(input).searchParams.get(OPEN_RUNTIME_SESSION_QUERY_PARAM);
    return sessionId === null || sessionId.length === 0 ? undefined : sessionId;
  } catch {
    return undefined;
  }
}

function createNoRuntimeMessage(selector: RuntimeSelector): string {
  const conditions = [
    selector.sessionId === undefined ? undefined : `session "${selector.sessionId}"`,
    selector.url === undefined ? undefined : `URL "${selector.url}"`
  ].filter((condition): condition is string => condition !== undefined);
  if (conditions.length === 0) return "No connected runtime was found.";
  return `No connected runtime matched ${conditions.join(" and ")}.`;
}


export function normalizeBridgeUrl(input: string | undefined): string {
  const bridgeUrl = input ?? "http://localhost:17321";
  return bridgeUrl.endsWith("/") ? bridgeUrl.slice(0, -1) : bridgeUrl;
}

export async function requestJson<T>(fetcher: Fetcher, url: string, init?: RequestInit): Promise<T> {
  const response = await fetcher(url, init);
  const body = await response.text();
  const parsed = body.length === 0 ? undefined : JSON.parse(body);

  if (!response.ok) {
    const message = getErrorMessage(parsed) ?? `Bridge request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return parsed as T;
}

function getErrorMessage(value: unknown): string | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const error = (value as { error?: { message?: unknown } }).error;
  return typeof error?.message === "string" ? error.message : undefined;
}
