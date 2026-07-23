import type { BridgeRuntimeInfo } from "@openruntime/bridge";
import type { RuntimeDataCondition } from "@openruntime/core";
import { getNumberOption, type ParsedCliArgs } from "../../utils/args.js";
import type { BrowserRunner } from "../browser/runner.js";
import { createFileBridgeStateStore, ensureBridge, waitForSelectedRuntime, type BridgeStarter } from "../bridge/process.js";
import { fetchRuntimes, selectRuntime, waitForRuntime, type Fetcher, type RuntimeResourceResult, type RuntimeSelector } from "./client.js";
import { normalizeOpenRuntimeUrlForMatch } from "../../utils/operation-log.js";
import { runBrowserOrThrow } from "../browser/execution.js";
import { createOptionalNumberProperty, hasOption, requireOption, sleep } from "../../utils/command.js";
import { getOpenRuntimeSessionId, withOpenRuntimeSession } from "../../utils/url.js";
import { createRuntimeSelector } from "./selector.js";
export function createWaitForFailure(
  targetId: string,
  status: string,
  where: RuntimeDataCondition[] | undefined,
  reason: string
): {
  result: {
    success: false;
    condition: {
      id: string;
      status: string;
      where?: RuntimeDataCondition[];
    };
    reason: string;
  };
} {
  const condition: { id: string; status: string; where?: RuntimeDataCondition[] } = {
    id: targetId,
    status
  };
  if (where !== undefined) {
    condition.where = where;
  }

  return {
    result: {
      success: false,
      condition,
      reason
    }
  };
}

export async function waitForRuntimeCommand(
  args: ParsedCliArgs,
  fetcher: Fetcher,
  bridgeUrl: string,
  browserRunner: BrowserRunner,
  bridgeStarter: BridgeStarter,
  bridgeStateStore: ReturnType<typeof createFileBridgeStateStore>,
  targetId: string,
  status: string,
  where: RuntimeDataCondition[] | undefined
): Promise<RuntimeResourceResult<unknown>> {
  if (hasOption(args, "next") && hasOption(args, "strict")) {
    throw new Error("--next cannot be used with --strict.");
  }

  if (hasOption(args, "strict")) {
    const runtime = await selectRuntimeForWait(args, fetcher, bridgeUrl, browserRunner, bridgeStarter, bridgeStateStore);
    return await waitForRuntime(
      fetcher,
      bridgeUrl,
      runtime,
      targetId,
      status,
      getNumberOption(args, "timeout"),
      where
    );
  }

  return await waitForLatestRuntime(args, fetcher, bridgeUrl, browserRunner, bridgeStarter, bridgeStateStore, targetId, status, where);
}

async function selectRuntimeForWait(
  args: ParsedCliArgs,
  fetcher: Fetcher,
  bridgeUrl: string,
  browserRunner: BrowserRunner,
  bridgeStarter: BridgeStarter,
  bridgeStateStore: ReturnType<typeof createFileBridgeStateStore>
) {
  const selector = createRuntimeSelector(args);
  try {
    const runtimes = await fetchRuntimes(fetcher, bridgeUrl);
    return selectRuntime(runtimes, selector);
  } catch (error) {
    if (!hasOption(args, "open")) {
      throw addOpenHint(error, selector);
    }

    const url = requireOption(args, "url");
    await ensureBridge({
      fetcher,
      bridgeUrl,
      starter: bridgeStarter,
      stateStore: bridgeStateStore,
      ...createOptionalNumberProperty("port", getNumberOption(args, "port"))
    });
    await runBrowserOrThrow(browserRunner, ["open", withOpenRuntimeSession(url, selector.sessionId)]);
    return await waitForSelectedRuntime({
      fetcher,
      bridgeUrl,
      selector,
      ...createOptionalNumberProperty("timeout", getNumberOption(args, "timeout"))
    });
  }
}

async function waitForLatestRuntime(
  args: ParsedCliArgs,
  fetcher: Fetcher,
  bridgeUrl: string,
  browserRunner: BrowserRunner,
  bridgeStarter: BridgeStarter,
  bridgeStateStore: ReturnType<typeof createFileBridgeStateStore>,
  targetId: string,
  status: string,
  where: RuntimeDataCondition[] | undefined
): Promise<RuntimeResourceResult<unknown>> {
  const selector = createRuntimeSelector(args, { ignoreRuntimeId: hasOption(args, "next") });
  const timeout = getNumberOption(args, "timeout") ?? 5000;
  const deadline = Date.now() + timeout;
  const ignoredRuntimeIds = hasOption(args, "next")
    ? await collectConnectedRuntimeIds(fetcher, bridgeUrl, selector)
    : new Set<string>();
  let lastError: unknown;
  let lastResult: RuntimeResourceResult<unknown> | undefined;
  let didOpen = false;

  while (Date.now() <= deadline) {
    const remainingTimeout = Math.max(1, deadline - Date.now());
    try {
      const runtimes = await fetchRuntimes(fetcher, bridgeUrl);
      const runtime = selectRuntime(
        ignoredRuntimeIds.size === 0
          ? runtimes
          : runtimes.filter((item) => !ignoredRuntimeIds.has(item.runtimeId)),
        selector
      );
      const result = await waitForRuntime(
        fetcher,
        bridgeUrl,
        runtime,
        targetId,
        status,
        remainingTimeout,
        where
      );
      if (!isRetryableWaitResult(result.result)) {
        return result;
      }
      lastResult = result;
    } catch (error) {
      lastError = error;
      if (!isRetryableWaitError(error)) {
        throw error;
      }

      if (hasOption(args, "open") && !didOpen) {
        didOpen = true;
        const url = requireOption(args, "url");
        await ensureBridge({
          fetcher,
          bridgeUrl,
          starter: bridgeStarter,
          stateStore: bridgeStateStore,
          ...createOptionalNumberProperty("port", getNumberOption(args, "port"))
        });
        await runBrowserOrThrow(browserRunner, ["open", withOpenRuntimeSession(url, selector.sessionId)]);
      }
    }

    await sleep(100);
  }

  if (lastResult !== undefined) {
    return lastResult;
  }

  if (hasOption(args, "next")) {
    throw addOpenHint(new Error("No new connected runtime was found before timeout."), selector);
  }

  throw addOpenHint(lastError ?? new Error("No connected runtime was found before timeout."), selector);
}

async function collectConnectedRuntimeIds(
  fetcher: Fetcher,
  bridgeUrl: string,
  selector: RuntimeSelector
): Promise<Set<string>> {
  const runtimes = await fetchRuntimes(fetcher, bridgeUrl);
  const matchingConnectedRuntimes = filterConnectedRuntimes(runtimes, selector);
  return new Set(matchingConnectedRuntimes.map((runtime) => runtime.runtimeId));
}

function filterConnectedRuntimes(runtimes: BridgeRuntimeInfo[], selector: RuntimeSelector): BridgeRuntimeInfo[] {
  if (selector.runtimeId !== undefined) {
    return runtimes.filter((runtime) => runtime.runtimeId === selector.runtimeId && runtime.status === "connected");
  }

  const sessionId = selector.sessionId ?? (
    selector.url === undefined ? undefined : getOpenRuntimeSessionId(selector.url)
  );
  const normalizedUrl = selector.url === undefined ? undefined : normalizeUrlWithoutOpenRuntimeSession(selector.url);

  return runtimes.filter((runtime) =>
    runtime.status === "connected" &&
    (sessionId === undefined || runtime.sessionId === sessionId || getOpenRuntimeSessionId(runtime.url) === sessionId) &&
    (normalizedUrl === undefined || normalizeUrlWithoutOpenRuntimeSession(runtime.url) === normalizedUrl)
  );
}

function normalizeUrlWithoutOpenRuntimeSession(input: string): string {
  return normalizeOpenRuntimeUrlForMatch(input);
}


function isRetryableWaitResult(result: unknown): boolean {
  if (result === null || typeof result !== "object") return false;
  const value = result as {
    success?: unknown;
    reason?: unknown;
  };
  return value.success === false && value.reason === "Target is not registered.";
}

export function isFailedWaitResult(result: unknown): boolean {
  if (result === null || typeof result !== "object") return false;
  return (result as { success?: unknown }).success === false;
}

function isRetryableWaitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.startsWith("No connected runtime") ||
    /^Runtime ".*" was not found\.$/.test(message) ||
    /^Runtime ".*" is disconnected\.$/.test(message) ||
    message === "Runtime is disconnected.";
}

function addOpenHint(error: unknown, selector: { sessionId?: string; url?: string }): Error {
  if (error instanceof Error && selector.url !== undefined && error.message.startsWith("No connected runtime matched")) {
    return new Error(`${error.message}\nRun \`openruntime open <url>\` before waiting.`);
  }
  return error instanceof Error ? error : new Error(String(error));
}
