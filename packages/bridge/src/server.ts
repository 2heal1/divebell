import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  OPEN_RUNTIME_BRIDGE_DEFAULT_PORT,
  OPEN_RUNTIME_SESSION_QUERY_PARAM,
  matchesRuntimeCondition,
  type BridgeRuntimeCommandName,
  type BridgeRuntimeRequest,
  type BridgeRuntimeResponse,
  type BridgeServerRuntimeSyncPayload,
  type RuntimeDataCondition
} from "@openruntime/core";
import { BridgeHttpError, getPathSegments, readJson, writeCorsHeaders, writeError, writeJson } from "./http-utils.js";
import { getCommandFromResource, parseRuntimeQuery } from "./query.js";
import { RuntimeConnectionStore, type RuntimeStream } from "./runtime-store.js";
import type { BridgeListenOptions, BridgeServer, BridgeServerAddress, CreateBridgeServerOptions } from "./types.js";

export function createBridgeServer(options: CreateBridgeServerOptions = {}): BridgeServer {
  return new NodeBridgeServer(options);
}

class NodeBridgeServer implements BridgeServer {
  readonly #store: RuntimeConnectionStore;
  readonly #server: Server;
  #address: BridgeServerAddress | undefined;

  constructor(options: CreateBridgeServerOptions) {
    this.#store = new RuntimeConnectionStore(options);
    this.#server = createServer((request, response) => {
      void this.#handleRequest(request, response);
    });
  }

  listen(options: BridgeListenOptions = {}): Promise<BridgeServerAddress> {
    const hostname = options.hostname ?? "localhost";
    const port = options.port ?? OPEN_RUNTIME_BRIDGE_DEFAULT_PORT;

    return new Promise((resolve, reject) => {
      const onError = (error: Error) => {
        this.#server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        this.#server.off("error", onError);
        const address = this.#server.address();
        if (address === null || typeof address === "string") {
          reject(new Error("Bridge server did not expose a TCP address."));
          return;
        }

        this.#address = {
          hostname,
          port: address.port,
          url: `http://${hostname}:${address.port}`
        };
        resolve(this.#address);
      };

      this.#server.once("error", onError);
      this.#server.once("listening", onListening);
      this.#server.listen(port, hostname);
    });
  }

  close(): Promise<void> {
    this.#store.disconnectAll();
    return new Promise((resolve, reject) => {
      this.#server.close((error) => {
        if (error !== undefined) {
          reject(error);
          return;
        }
        this.#address = undefined;
        resolve();
      });
    });
  }

  address(): BridgeServerAddress | undefined {
    return this.#address;
  }

  async #handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    writeCorsHeaders(response);
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      const segments = getPathSegments(url);

      if (request.method === "GET" && segments.length === 1 && segments[0] === "connect") {
        this.#handleRuntimeConnect(url, request, response);
        return;
      }

      if (request.method === "POST" && segments.length === 1 && segments[0] === "server-runtimes") {
        await this.#handleServerRuntimeSync(request, response);
        return;
      }

      if (request.method === "GET" && segments.length === 1 && segments[0] === "runtimes") {
        writeJson(response, 200, {
          runtimes: this.#store.list()
        });
        return;
      }

      if (
        request.method === "POST" &&
        segments.length === 4 &&
        segments[0] === "runtimes" &&
        segments[2] === "responses"
      ) {
        await this.#handleRuntimeResponse(segments[1] ?? "", segments[3] ?? "", request, response);
        return;
      }

      if (request.method === "GET" && segments.length === 3 && segments[0] === "runtimes") {
        await this.#handleRuntimeRead(segments[1] ?? "", segments[2] ?? "", url, response);
        return;
      }

      if (
        request.method === "GET" &&
        segments.length === 5 &&
        segments[0] === "runtimes" &&
        segments[2] === "actions" &&
        segments[4] === "options"
      ) {
        await this.#handleInputOptions(segments[1] ?? "", segments[3] ?? "", url, response);
        return;
      }

      if (
        request.method === "POST" &&
        segments.length === 5 &&
        segments[0] === "runtimes" &&
        segments[2] === "actions" &&
        segments[4] === "run"
      ) {
        await this.#handleRunAction(segments[1] ?? "", segments[3] ?? "", request, response);
        return;
      }

      if (
        request.method === "POST" &&
        segments.length === 3 &&
        segments[0] === "runtimes" &&
        segments[2] === "wait-for"
      ) {
        await this.#handleWaitFor(segments[1] ?? "", request, response);
        return;
      }

      throw new BridgeHttpError(404, "not_found", "Bridge route was not found.");
    } catch (error) {
      writeError(response, error);
    }
  }

  #handleRuntimeConnect(url: URL, request: IncomingMessage, response: ServerResponse): void {
    const runtimeUrl = url.searchParams.get("url");
    if (runtimeUrl === null || runtimeUrl.length === 0) {
      throw new BridgeHttpError(400, "missing_runtime_url", "Runtime connection must include a url query.");
    }
    const pageInstanceId = normalizeOptionalQuery(url.searchParams.get("pageInstanceId"));
    const runtimeId = normalizeOptionalQuery(url.searchParams.get("runtimeId"));
    const sessionId = normalizeOptionalQuery(url.searchParams.get("sessionId")) ?? getOpenRuntimeSessionIdFromUrl(runtimeUrl);
    const renderId = normalizeOptionalQuery(url.searchParams.get("renderId"));

    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      "access-control-allow-origin": "*"
    });

    const stream = new ServerSentEventStream(response);
    const runtime = this.#store.connect(runtimeUrl, stream, {
      ...(pageInstanceId === undefined ? {} : { pageInstanceId }),
      ...(runtimeId === undefined ? {} : { runtimeId }),
      ...(sessionId === undefined ? {} : { sessionId }),
      ...(renderId === undefined ? {} : { renderId })
    });
    stream.send("connected", {
      runtimeId: runtime.runtimeId
    });

    request.on("close", () => {
      this.#store.disconnect(runtime.runtimeId, stream);
    });
  }

  async #handleServerRuntimeSync(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await readJson(request);
    if (!isServerRuntimeSyncPayload(body)) {
      throw new BridgeHttpError(400, "invalid_server_runtime_sync", "Server runtime sync body is invalid.");
    }

    const runtime = this.#store.syncServerRuntime(body);
    writeJson(response, 200, {
      runtimeId: runtime.runtimeId,
      ...(runtime.renderId === undefined ? {} : { renderId: runtime.renderId }),
      accepted: true
    });
  }

  async #handleRuntimeResponse(
    runtimeId: string,
    requestId: string,
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const body = await readJson(request);
    if (!isBridgeRuntimeResponse(body)) {
      throw new BridgeHttpError(400, "invalid_runtime_response", "Runtime response body is invalid.");
    }

    const accepted = this.#store.resolve(runtimeId, requestId, body);
    if (!accepted) {
      throw new BridgeHttpError(404, "request_not_found", "Runtime request was not found.");
    }

    writeJson(response, 200, {
      accepted: true
    });
  }

  async #handleRuntimeRead(
    runtimeId: string,
    resource: string,
    url: URL,
    response: ServerResponse
  ): Promise<void> {
    const method = getCommandFromResource(resource);
    if (method === undefined) {
      throw new BridgeHttpError(404, "resource_not_found", "Runtime resource was not found.");
    }

    const runtime = this.#store.get(runtimeId);
    if (runtime === undefined) {
      throw new BridgeHttpError(404, "runtime_not_found", "Runtime was not found.");
    }

    const query = parseRuntimeQuery(method, url.searchParams);
    if (runtime.status === "disconnected") {
      const cached = this.#getCachedRuntimeResult(runtimeId, method, query);
      if (cached !== undefined) {
        writeJson(response, 200, cached);
        return;
      }
      throw new BridgeHttpError(409, "runtime_disconnected", "Runtime is disconnected.");
    }

    if (runtime.status === "server") {
      const cached = this.#getCachedRuntimeResult(runtimeId, method, query);
      if (cached !== undefined) {
        writeJson(response, 200, cached);
        return;
      }
      throw new BridgeHttpError(409, "runtime_server_only", "Runtime has not connected from a browser yet.");
    }

    const result = await this.#store.request(runtimeId, method, query === undefined ? {} : { query });
    this.#store.cacheResult(runtimeId, method, result);
    writeJson(response, 200, this.#getCachedRuntimeResult(runtimeId, method, query) ?? result);
  }

  async #handleInputOptions(
    runtimeId: string,
    actionName: string,
    url: URL,
    response: ServerResponse
  ): Promise<void> {
    const inputName = url.searchParams.get("input");
    if (inputName === null || inputName.length === 0) {
      throw new BridgeHttpError(400, "missing_input_name", "Input options request must include an input query.");
    }

    const payload = parsePayloadQuery(url.searchParams.get("payload"));
    const options = parseTimeoutOptions(url.searchParams);
    const requestInput: Omit<BridgeRuntimeRequest, "requestId" | "method"> = {
      actionName,
      inputName
    };
    if (payload !== undefined) requestInput.payload = payload;
    if (options !== undefined) requestInput.options = options;

    const result = await this.#requestConnectedRuntime(runtimeId, "getInputOptions", requestInput);
    writeJson(response, 200, result);
  }

  async #handleRunAction(
    runtimeId: string,
    actionName: string,
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const body = await readJson(request);
    const payload = getPayload(body);
    const requestInput: Omit<BridgeRuntimeRequest, "requestId" | "method"> = {
      actionName
    };
    if (payload !== undefined) requestInput.payload = payload;

    const result = await this.#requestConnectedRuntime(runtimeId, "runAction", requestInput);
    writeJson(response, 200, result);
  }

  async #handleWaitFor(
    runtimeId: string,
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const body = await readJson(request);
    if (!isRecord(body)) {
      throw new BridgeHttpError(400, "invalid_wait_for_body", "wait-for body must be an object.");
    }

    const targetId = getStringField(body, "targetId") ?? getStringField(body, "id");
    const status = getStringField(body, "status");
    if (targetId === undefined || status === undefined) {
      throw new BridgeHttpError(400, "invalid_wait_for_body", "wait-for body must include targetId and status.");
    }

    const options = parseTimeoutBody(body);
    const requestInput: Omit<BridgeRuntimeRequest, "requestId" | "method"> = {
      targetId,
      status
    };
    const where = parseWhereBody(body);
    if (where !== undefined) requestInput.where = where;
    if (options !== undefined) requestInput.options = options;

    const cachedSnapshot = this.#store.getCachedSnapshot(runtimeId);
    const cachedTarget = cachedSnapshot?.targets[targetId];
    if (matchesRuntimeCondition(cachedTarget, {
      id: targetId,
      status,
      ...(where === undefined ? {} : { where })
    })) {
      writeJson(response, 200, createWaitSuccess(targetId, status, where, cachedSnapshot, cachedTarget));
      return;
    }

    const runtime = this.#store.get(runtimeId);
    if (runtime?.status === "connected") {
      const result = await this.#requestConnectedRuntime(runtimeId, "waitFor", requestInput);
      writeJson(response, 200, result);
      return;
    }

    if (this.#store.hasCachedTarget(runtimeId, targetId)) {
      const cachedResult = await this.#waitForCachedTarget(runtimeId, targetId, status, where, options?.timeout);
      writeJson(response, 200, cachedResult);
      return;
    }

    const result = await this.#requestConnectedRuntime(runtimeId, "waitFor", requestInput);
    writeJson(response, 200, result);
  }

  async #requestConnectedRuntime(
    runtimeId: string,
    method: BridgeRuntimeCommandName,
    requestInput: Omit<BridgeRuntimeRequest, "requestId" | "method">
  ): Promise<unknown> {
    const runtime = this.#store.get(runtimeId);
    if (runtime === undefined) {
      throw new BridgeHttpError(404, "runtime_not_found", "Runtime was not found.");
    }
    if (runtime.status === "disconnected") {
      throw new BridgeHttpError(409, "runtime_disconnected", "Runtime is disconnected.");
    }
    if (runtime.status === "server") {
      throw new BridgeHttpError(409, "runtime_server_only", "Runtime has not connected from a browser yet.");
    }

    return this.#store.request(runtimeId, method, requestInput, getRequestTimeout(requestInput.options?.timeout));
  }

  #getCachedRuntimeResult(
    runtimeId: string,
    method: BridgeRuntimeCommandName,
    query?: Omit<BridgeRuntimeRequest, "requestId" | "method">["query"]
  ): unknown {
    if (method === "getSnapshot") return this.#store.getCachedSnapshot(runtimeId);
    if (method === "getEvents") return this.#store.getCachedEvents(runtimeId, query);
    if (method === "getTargets") return this.#store.getCachedTargets(runtimeId, query);
    if (method === "getActions") return this.#store.getCachedActions(runtimeId, query);
    return undefined;
  }

  async #waitForCachedTarget(
    runtimeId: string,
    targetId: string,
    status: string,
    where: RuntimeDataCondition[] | undefined,
    timeout = 5000
  ): Promise<unknown> {
    const deadline = Date.now() + timeout;
    let snapshot = this.#store.getCachedSnapshot(runtimeId);
    let target = snapshot?.targets[targetId];

    while (Date.now() <= deadline) {
      if (matchesRuntimeCondition(target, {
        id: targetId,
        status,
        ...(where === undefined ? {} : { where })
      })) {
        return createWaitSuccess(targetId, status, where, snapshot, target);
      }

      await sleep(50);
      snapshot = this.#store.getCachedSnapshot(runtimeId);
      target = snapshot?.targets[targetId];
    }

    return {
      success: false,
      condition: {
        id: targetId,
        status,
        ...(where === undefined ? {} : { where })
      },
      snapshot,
      reason: target === undefined ? "Target is not registered." : `Timed out waiting for "${targetId}" to reach "${status}".`
    };
  }
}

function createWaitSuccess(
  targetId: string,
  status: string,
  where: RuntimeDataCondition[] | undefined,
  snapshot: unknown,
  target: unknown
): unknown {
  return {
    success: true,
    condition: {
      id: targetId,
      status,
      ...(where === undefined ? {} : { where })
    },
    snapshot,
    target
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isServerRuntimeSyncPayload(value: unknown): value is BridgeServerRuntimeSyncPayload {
  if (!isRecord(value)) return false;
  if (typeof value.runtimeId !== "string" || value.runtimeId.length === 0) return false;
  if (typeof value.url !== "string" || value.url.length === 0) return false;
  if (value.sessionId !== undefined && typeof value.sessionId !== "string") return false;
  if (value.renderId !== undefined && typeof value.renderId !== "string") return false;
  if (value.source !== undefined && typeof value.source !== "string") return false;
  if (value.targets !== undefined && !Array.isArray(value.targets)) return false;
  if (value.snapshot !== undefined && !isRecord(value.snapshot)) return false;
  if (value.events !== undefined && !isRecord(value.events)) return false;
  if (value.actions !== undefined && !Array.isArray(value.actions)) return false;
  return true;
}

function parseWhereBody(body: Record<string, unknown>): RuntimeDataCondition[] | undefined {
  if (!("where" in body)) {
    return undefined;
  }

  if (!Array.isArray(body.where)) {
    throw new BridgeHttpError(400, "invalid_wait_for_body", "where must be an array.");
  }

  return body.where.map((item) => {
    if (!isRecord(item) || typeof item.path !== "string" || item.path.length === 0 || !("equals" in item)) {
      throw new BridgeHttpError(400, "invalid_wait_for_body", "where entries must include path and equals.");
    }

    return {
      path: item.path,
      equals: item.equals
    };
  });
}

class ServerSentEventStream implements RuntimeStream {
  readonly #response: ServerResponse;

  constructor(response: ServerResponse) {
    this.#response = response;
  }

  send(event: string, data: unknown): void {
    this.#response.write(`event: ${event}\n`);
    this.#response.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  close(): void {
    this.#response.end();
  }
}

function isBridgeRuntimeResponse(value: unknown): value is BridgeRuntimeResponse {
  if (value === null || typeof value !== "object") return false;
  const response = value as Partial<BridgeRuntimeResponse>;
  return typeof response.success === "boolean";
}

function parsePayloadQuery(value: string | null): Record<string, unknown> | undefined {
  if (value === null || value.length === 0) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new BridgeHttpError(400, "invalid_payload", "payload query must be valid JSON.");
  }

  if (!isRecord(parsed)) {
    throw new BridgeHttpError(400, "invalid_payload", "payload must be a JSON object.");
  }
  return parsed;
}

function getPayload(body: unknown): Record<string, unknown> | undefined {
  if (body === undefined) return undefined;
  if (!isRecord(body)) {
    throw new BridgeHttpError(400, "invalid_payload", "Request body must be a JSON object.");
  }

  if ("payload" in body) {
    const payload = body.payload;
    if (payload === undefined) return undefined;
    if (!isRecord(payload)) {
      throw new BridgeHttpError(400, "invalid_payload", "payload must be a JSON object.");
    }
    return payload;
  }

  return body;
}

function parseTimeoutOptions(searchParams: URLSearchParams): { timeout: number } | undefined {
  const value = searchParams.get("timeout");
  if (value === null) return undefined;
  return {
    timeout: parseTimeout(value)
  };
}

function parseTimeoutBody(body: Record<string, unknown>): { timeout: number } | undefined {
  const timeout = body.timeout;
  if (timeout === undefined) return undefined;
  if (typeof timeout !== "number") {
    throw new BridgeHttpError(400, "invalid_timeout", "timeout must be a number.");
  }
  return {
    timeout: normalizeTimeout(timeout)
  };
}

function parseTimeout(value: string): number {
  return normalizeTimeout(Number(value));
}

function normalizeTimeout(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new BridgeHttpError(400, "invalid_timeout", "timeout must be a non-negative number.");
  }
  return Math.floor(value);
}

function getRequestTimeout(timeout: number | undefined): number | undefined {
  if (timeout === undefined) return undefined;
  return timeout + 1000;
}

function getStringField(body: Record<string, unknown>, name: string): string | undefined {
  const value = body[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeOptionalQuery(value: string | null): string | undefined {
  return value === null || value.length === 0 ? undefined : value;
}

function getOpenRuntimeSessionIdFromUrl(input: string): string | undefined {
  try {
    const sessionId = new URL(input).searchParams.get(OPEN_RUNTIME_SESSION_QUERY_PARAM);
    return sessionId === null || sessionId.length === 0 ? undefined : sessionId;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
