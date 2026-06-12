import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { OPEN_RUNTIME_BRIDGE_DEFAULT_PORT } from "@openruntime/core";
import type { BridgeRuntimeInfo } from "@openruntime/bridge";
import type { Fetcher, RuntimeSelector } from "./client.js";
import { fetchRuntimes, selectRuntime } from "./client.js";

export interface BridgeStartOptions {
  port: number;
}

export interface BridgeStarter {
  start(options: BridgeStartOptions): Promise<void>;
}

export interface EnsureBridgeOptions {
  fetcher: Fetcher;
  bridgeUrl: string;
  starter: BridgeStarter;
  port?: number;
  timeout?: number;
}

export interface WaitForRuntimeSelectionOptions {
  fetcher: Fetcher;
  bridgeUrl: string;
  selector: RuntimeSelector;
  timeout?: number;
}

export function createDetachedBridgeStarter(entryModuleUrl: string): BridgeStarter {
  return {
    start: async ({ port }) => {
      const child = spawn(process.execPath, [
        fileURLToPath(entryModuleUrl),
        "bridge",
        "start",
        "--port",
        String(port)
      ], {
        detached: true,
        stdio: "ignore"
      });
      child.unref();
    }
  };
}

export async function ensureBridge(options: EnsureBridgeOptions): Promise<void> {
  const firstProbe = await probeBridge(options.fetcher, options.bridgeUrl);
  if (firstProbe === "available") {
    return;
  }
  if (firstProbe === "wrong-service") {
    throw new Error(`A non-OpenRuntime service is responding at ${options.bridgeUrl}. Use --bridge or --port to choose another Bridge.`);
  }

  const port = options.port ?? getBridgePort(options.bridgeUrl);
  if (port === undefined || !canAutoStartBridge(options.bridgeUrl)) {
    throw new Error(`OpenRuntime Bridge is not reachable at ${options.bridgeUrl}. Start it with "open-runtime bridge start" or use a local --bridge URL.`);
  }

  await options.starter.start({ port });
  const deadline = Date.now() + (options.timeout ?? 5000);
  while (Date.now() <= deadline) {
    const probe = await probeBridge(options.fetcher, options.bridgeUrl);
    if (probe === "available") {
      return;
    }
    if (probe === "wrong-service") {
      throw new Error(`A non-OpenRuntime service is responding at ${options.bridgeUrl}. Use --bridge or --port to choose another Bridge.`);
    }
    await sleep(100);
  }

  throw new Error(`OpenRuntime Bridge did not become available at ${options.bridgeUrl}.`);
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
    throw new Error(`${lastError.message} Make sure the page service is running and the page connects to OpenRuntime Bridge.`);
  }
  throw new Error("No connected runtime was found. Make sure the page service is running and the page connects to OpenRuntime Bridge.");
}

export function getBridgePort(bridgeUrl: string): number | undefined {
  try {
    const url = new URL(bridgeUrl);
    if (url.port.length > 0) {
      return Number(url.port);
    }
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]") {
      return OPEN_RUNTIME_BRIDGE_DEFAULT_PORT;
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

function canAutoStartBridge(bridgeUrl: string): boolean {
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

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
