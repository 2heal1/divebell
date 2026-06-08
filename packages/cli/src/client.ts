import type { BridgeRuntimeInfo } from "@openruntime/bridge";

export type Fetcher = typeof fetch;

export interface RuntimeSelector {
  runtimeId?: string;
  url?: string;
}

export interface RuntimeResourceResult<T> {
  runtime: BridgeRuntimeInfo;
  result: T;
}

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
  timeout: number | undefined
): Promise<RuntimeResourceResult<T>> {
  const url = `${bridgeUrl}/runtimes/${encodeURIComponent(runtime.runtimeId)}/wait-for`;
  const body: {
    targetId: string;
    status: string;
    timeout?: number;
  } = {
    targetId,
    status
  };
  if (timeout !== undefined) {
    body.timeout = timeout;
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
  selector: RuntimeSelector = {}
): BridgeRuntimeInfo {
  if (selector.runtimeId !== undefined) {
    const runtime = runtimes.find((item) => item.runtimeId === selector.runtimeId);
    if (runtime === undefined) {
      throw new Error(`Runtime "${selector.runtimeId}" was not found.`);
    }
    return runtime;
  }

  const candidates = selector.url === undefined
    ? runtimes.filter((runtime) => runtime.status === "connected")
    : runtimes.filter((runtime) => runtime.status === "connected" && runtime.url === selector.url);

  if (candidates.length === 0) {
    throw new Error(selector.url === undefined
      ? "No connected runtime was found."
      : `No connected runtime matched URL "${selector.url}".`);
  }

  return candidates.sort((left, right) => right.lastSeenAt - left.lastSeenAt)[0] as BridgeRuntimeInfo;
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
