import type { OpenRuntimeCore, RuntimeError } from "../runtime/types.js";
import { executeBridgeRuntimeRequest } from "./command.js";
import {
  OPEN_RUNTIME_BRIDGE_DEFAULT_PORT,
  type BridgeConnectOptions,
  type BridgeRuntimeRequest,
  type BridgeRuntimeResponse
} from "./types.js";

const reconnectDelays = [1000, 2000, 4000, 8000, 10000];

export function connectBridge(
  runtime: OpenRuntimeCore,
  options: BridgeConnectOptions = {}
): void {
  if (getGlobalBridgeConnection() !== undefined) {
    return;
  }

  const port = options.port ?? OPEN_RUNTIME_BRIDGE_DEFAULT_PORT;
  const autoReconnect = options.autoReconnect ?? true;
  const pageUrl = getPageUrl();
  const pageInstanceId = getPageInstanceId(options.pageInstanceId);

  let runtimeId: string | undefined;
  let stream: EventSource | undefined;
  let stopped = false;
  let reconnectAttempt = 0;
  let connection: GlobalBridgeConnection | undefined;

  const open = () => {
    if (typeof EventSource === "undefined") {
      throw new Error("EventSource is required to connect OpenRuntime Bridge.");
    }

    stream = new EventSource(createBridgeConnectUrl(port, pageUrl, pageInstanceId));
    stream.addEventListener("connected", (event) => {
      runtimeId = parseConnectedRuntimeId(event);
      reconnectAttempt = 0;
    });
    stream.addEventListener("request", (event) => {
      void handleRequest(runtime, port, () => runtimeId, event);
    });
    stream.onerror = () => {
      stream?.close();
      stream = undefined;
      if (!stopped && autoReconnect) {
        const delay = reconnectDelays[Math.min(reconnectAttempt, reconnectDelays.length - 1)] ?? 10000;
        reconnectAttempt += 1;
        setTimeout(open, delay);
      }
    };
  };

  const stop = () => {
    stopped = true;
    stream?.close();
    if (connection !== undefined) {
      clearGlobalBridgeConnection(connection);
    }
  };

  connection = { close: stop };
  setGlobalBridgeConnection(connection);
  globalThis.addEventListener?.("beforeunload", stop, { once: true });
  try {
    open();
  } catch (error) {
    clearGlobalBridgeConnection(connection);
    throw error;
  }
}

async function handleRequest(
  runtime: OpenRuntimeCore,
  port: number,
  getRuntimeId: () => string | undefined,
  event: MessageEvent
): Promise<void> {
  const request = parseRequest(event);
  if (request === undefined) return;

  let response: BridgeRuntimeResponse;
  try {
    response = {
      success: true,
      result: await executeBridgeRuntimeRequest(runtime, request)
    };
  } catch (error) {
    response = {
      success: false,
      error: toRuntimeError(error)
    };
  }

  const runtimeId = getRuntimeId();
  if (runtimeId === undefined) return;

  await fetch(createBridgeResponseUrl(port, runtimeId, request.requestId), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(response)
  });
}

function createBridgeConnectUrl(port: number, pageUrl: string, pageInstanceId: string): string {
  const url = new URL(`http://localhost:${port}/connect`);
  url.searchParams.set("url", pageUrl);
  url.searchParams.set("pageInstanceId", pageInstanceId);
  return url.toString();
}

function createBridgeResponseUrl(port: number, runtimeId: string, requestId: string): string {
  return `http://localhost:${port}/runtimes/${encodeURIComponent(runtimeId)}/responses/${encodeURIComponent(requestId)}`;
}

function getPageUrl(): string {
  return globalThis.location?.href ?? "unknown";
}

interface GlobalBridgeConnection {
  close(): void;
}

interface OpenRuntimeBridgeGlobal {
  __OPEN_RUNTIME_BRIDGE_CONNECTION__?: GlobalBridgeConnection;
}

function getBridgeGlobal(): OpenRuntimeBridgeGlobal {
  return globalThis as OpenRuntimeBridgeGlobal;
}

function getGlobalBridgeConnection(): GlobalBridgeConnection | undefined {
  return getBridgeGlobal().__OPEN_RUNTIME_BRIDGE_CONNECTION__;
}

function setGlobalBridgeConnection(connection: GlobalBridgeConnection): void {
  getBridgeGlobal().__OPEN_RUNTIME_BRIDGE_CONNECTION__ = connection;
}

function clearGlobalBridgeConnection(connection: GlobalBridgeConnection): void {
  const bridgeGlobal = getBridgeGlobal();
  if (bridgeGlobal.__OPEN_RUNTIME_BRIDGE_CONNECTION__ === connection) {
    delete bridgeGlobal.__OPEN_RUNTIME_BRIDGE_CONNECTION__;
  }
}

function getPageInstanceId(configuredId: string | undefined): string {
  if (configuredId !== undefined && configuredId.length > 0) {
    return configuredId;
  }

  return createPageInstanceId();
}

function createPageInstanceId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid !== undefined) {
    return `page-${uuid}`;
  }

  return `page-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function parseConnectedRuntimeId(event: MessageEvent): string | undefined {
  const data = parseJson(event.data);
  return typeof data?.runtimeId === "string" ? data.runtimeId : undefined;
}

function parseRequest(event: MessageEvent): BridgeRuntimeRequest | undefined {
  const data = parseJson(event.data);
  if (data === undefined || typeof data !== "object") return undefined;
  const request = data as Partial<BridgeRuntimeRequest>;
  if (typeof request.requestId !== "string") return undefined;
  if (
    request.method !== "getTargets" &&
    request.method !== "getSnapshot" &&
    request.method !== "getEvents" &&
    request.method !== "getActions" &&
    request.method !== "getInputOptions" &&
    request.method !== "runAction" &&
    request.method !== "waitFor"
  ) {
    return undefined;
  }

  const bridgeRequest: BridgeRuntimeRequest = {
    requestId: request.requestId,
    method: request.method
  };
  if (request.query !== undefined) {
    bridgeRequest.query = request.query;
  }
  if (typeof request.actionName === "string") {
    bridgeRequest.actionName = request.actionName;
  }
  if (typeof request.inputName === "string") {
    bridgeRequest.inputName = request.inputName;
  }
  if (isRecord(request.payload)) {
    bridgeRequest.payload = request.payload;
  }
  if (typeof request.targetId === "string") {
    bridgeRequest.targetId = request.targetId;
  }
  if (typeof request.status === "string") {
    bridgeRequest.status = request.status;
  }
  if (Array.isArray(request.where)) {
    bridgeRequest.where = request.where;
  }
  if (isRecord(request.options)) {
    bridgeRequest.options = request.options;
  }

  return bridgeRequest;
}

function parseJson(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "string") return undefined;

  try {
    const parsed = JSON.parse(value);
    return parsed !== null && typeof parsed === "object" ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toRuntimeError(error: unknown): RuntimeError {
  if (error instanceof Error) {
    const runtimeError: RuntimeError = {
      message: error.message
    };

    if (error.stack !== undefined) {
      runtimeError.stack = error.stack;
    }

    return runtimeError;
  }

  return {
    message: String(error)
  };
}
