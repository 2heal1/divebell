import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import {
  createPacScript,
  matchBrowserNetworkRule,
  rewriteBrowserRequestUrl,
  validateBrowserNetworkRules,
  validateBrowserProxyDescriptor,
  type BrowserNetworkRule,
  type BrowserNetworkRules,
  type BrowserProxyDescriptor
} from "./network-control.js";

const CONTROL_REQUEST_TIMEOUT_MS = 5_000;
const CONTROL_FETCH_TIMEOUT_MS = 15_000;
const MAX_FULFILL_BODY_BYTES = 10 * 1024 * 1024;

export interface NetworkControlServerConfig {
  schemaVersion: 1;
  token: string;
  rules?: BrowserNetworkRules;
  proxy?: BrowserProxyDescriptor;
}

interface CdpMessage {
  id?: number;
  method?: string;
  params?: unknown;
  sessionId?: string;
  result?: unknown;
  error?: { message?: string };
}

export interface NetworkCdpControllerClient {
  onEvent(listener: (message: CdpMessage) => void): void;
  send(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<unknown>;
  close(): void;
}

interface FetchPausedParams {
  requestId: string;
  resourceType?: string;
  request?: {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    postData?: string;
  };
}

export interface NetworkFulfillRequest {
  method?: string;
  headers?: Record<string, string>;
  postData?: string;
}

export interface NetworkFulfillResponse {
  status: number;
  statusText: string;
  headers: Array<{ name: string; value: string }>;
  body: string;
}

export async function runNetworkControlServer(configPath: string): Promise<void> {
  const config = await readNetworkControlServerConfig(configPath);
  const pac = config.proxy === undefined ? undefined : createPacScript(config.proxy);
  let controller: NetworkCdpController | undefined;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.searchParams.get("token") !== config.token) {
      response.writeHead(404).end();
      return;
    }
    if (request.method === "GET" && url.pathname === "/proxy.pac" && pac !== undefined) {
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/x-ns-proxy-autoconfig; charset=utf-8"
      }).end(pac);
      return;
    }
    if (request.method === "POST" && url.pathname === "/attach") {
      try {
        const cdpUrl = await readCdpUrl(request);
        if (controller !== undefined) controller.close();
        controller = await NetworkCdpController.connect(cdpUrl, config.rules);
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(controller.status()));
      } catch (error) {
        writeControlError(response, error);
      }
      return;
    }
    if (request.method === "GET" && url.pathname === "/status") {
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(controller?.status() ?? { attachedTargets: 0, enabledTargets: 0, pausedRequests: 0, matchedRequests: 0, failedRequests: 0, eventErrors: 0 }));
      return;
    }
    if (request.method === "POST" && url.pathname === "/stop") {
      controller?.close();
      response.writeHead(204).end();
      server.close();
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Network control server did not bind a TCP port.");
  const controlUrl = `http://127.0.0.1:${address.port}`;
  process.send?.({
    type: "divebell.network-control.ready",
    controlUrl,
    ...(pac === undefined ? {} : { pacUrl: `${controlUrl}/proxy.pac?token=${encodeURIComponent(config.token)}` })
  });
  await new Promise<void>((resolve) => server.once("close", resolve));
  controller?.close();
}

export async function readNetworkControlServerConfig(path: string): Promise<NetworkControlServerConfig> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`Could not read network control config ${basename(path)}: ${errorMessage(error)}`);
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || typeof parsed.token !== "string" || parsed.token.length < 16) {
    throw new Error("Network control config is invalid.");
  }
  return {
    schemaVersion: 1,
    token: parsed.token,
    ...(parsed.rules === undefined ? {} : { rules: validateBrowserNetworkRules(parsed.rules) }),
    ...(parsed.proxy === undefined ? {} : { proxy: validateBrowserProxyDescriptor(parsed.proxy) })
  };
}

export class NetworkCdpController {
  readonly #client: NetworkCdpControllerClient;
  readonly #rules: BrowserNetworkRules | undefined;
  readonly #sessionEnables = new Map<string, Promise<void>>();
  #attachedTargets = 0;
  #pausedRequests = 0;
  #matchedRequests = 0;
  #failedRequests = 0;
  #eventErrors = 0;

  private constructor(client: NetworkCdpControllerClient, rules: BrowserNetworkRules | undefined) {
    this.#client = client;
    this.#rules = rules;
    client.onEvent((message) => {
      void this.handleEvent(message).catch(() => {
        // CDP target attachment and Fetch setup can race target destruction.
        // Keep the daemon alive and expose the failure through status instead.
        this.#eventErrors += 1;
      });
    });
  }

  /** @internal Test seam for CDP event-failure containment. */
  static createForTesting(client: NetworkCdpControllerClient, rules: BrowserNetworkRules | undefined): NetworkCdpController {
    return new NetworkCdpController(client, rules);
  }

  static async connect(cdpUrl: string, rules: BrowserNetworkRules | undefined): Promise<NetworkCdpController> {
    const client = await CdpClient.connect(cdpUrl);
    const controller = new NetworkCdpController(client, rules);
    try {
      await client.send("Target.setAutoAttach", {
        autoAttach: true,
        flatten: true,
        waitForDebuggerOnStart: false
      });
      const targets = await client.send("Target.getTargets") as { targetInfos?: unknown };
      for (const target of Array.isArray(targets.targetInfos) ? targets.targetInfos : []) {
        if (!isRecord(target) || typeof target.targetId !== "string" || !isInterceptableTarget(target.type)) continue;
        try {
          const attached = await client.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
          if (isRecord(attached) && typeof attached.sessionId === "string") await controller.enableSession(attached.sessionId);
        } catch {
          // A target can disappear between Target.getTargets and attachment.
        }
      }
      return controller;
    } catch (error) {
      client.close();
      throw error;
    }
  }

  close(): void {
    this.#client.close();
  }

  status(): { attachedTargets: number; enabledTargets: number; pausedRequests: number; matchedRequests: number; failedRequests: number; eventErrors: number } {
    return {
      attachedTargets: this.#attachedTargets,
      enabledTargets: this.#sessionEnables.size,
      pausedRequests: this.#pausedRequests,
      matchedRequests: this.#matchedRequests,
      failedRequests: this.#failedRequests,
      eventErrors: this.#eventErrors
    };
  }

  private async handleEvent(message: CdpMessage): Promise<void> {
    if (message.method === "Target.attachedToTarget" && isRecord(message.params)) {
      const sessionId = message.params.sessionId;
      const targetInfo = isRecord(message.params.targetInfo) ? message.params.targetInfo : undefined;
      if (typeof sessionId === "string" && targetInfo !== undefined && isInterceptableTarget(targetInfo.type)) {
        this.#attachedTargets += 1;
        await this.enableSession(sessionId);
      }
      return;
    }
    if (message.method === "Target.detachedFromTarget" && isRecord(message.params) && typeof message.params.sessionId === "string") {
      this.#sessionEnables.delete(message.params.sessionId);
      return;
    }
    if (message.method === "Fetch.requestPaused" && message.sessionId !== undefined && isRecord(message.params)) {
      this.#pausedRequests += 1;
      await this.handlePaused(message.sessionId, message.params as FetchPausedParams);
    }
  }

  private async enableSession(sessionId: string): Promise<void> {
    const existing = this.#sessionEnables.get(sessionId);
    if (existing !== undefined) return await existing;
    const enabled = this.#client.send("Fetch.enable", {
      patterns: [{ urlPattern: "*", requestStage: "Request" }]
    }, sessionId).then(() => undefined);
    this.#sessionEnables.set(sessionId, enabled);
    try {
      await enabled;
    } catch (error) {
      this.#sessionEnables.delete(sessionId);
      throw error;
    }
  }

  private async handlePaused(sessionId: string, params: FetchPausedParams): Promise<void> {
    const requestId = params.requestId;
    const url = params.request?.url;
    if (typeof requestId !== "string" || typeof url !== "string") return;
    const rule = this.#rules === undefined
      ? undefined
      : matchBrowserNetworkRule(this.#rules, {
          url,
          ...(params.resourceType === undefined ? {} : { resourceType: params.resourceType })
        });
    if (rule !== undefined) this.#matchedRequests += 1;
    try {
      if (rule === undefined) {
        await this.#client.send("Fetch.continueRequest", { requestId }, sessionId);
      } else if (rule.action.type === "rewrite") {
        await this.#client.send("Fetch.continueRequest", {
          requestId,
          url: rewriteBrowserRequestUrl(rule, url)
        }, sessionId);
      } else {
        await fulfillRequest(this.#client, sessionId, requestId, params, rule);
      }
    } catch {
      this.#failedRequests += 1;
      try {
        await this.#client.send("Fetch.failRequest", { requestId, errorReason: "Failed" }, sessionId);
      } catch {
        // The browser can close a target while its request is being handled.
      }
    }
  }
}

async function fulfillRequest(
  client: NetworkCdpControllerClient,
  sessionId: string,
  requestId: string,
  paused: FetchPausedParams,
  rule: BrowserNetworkRule
): Promise<void> {
  if (rule.action.type !== "fulfill") return;
  const fulfilled = await fetchNetworkFulfillResponse(rule.action.url, paused.request, rule.action.timeoutMs);
  await client.send("Fetch.fulfillRequest", {
    requestId,
    responseCode: fulfilled.status,
    responsePhrase: fulfilled.statusText,
    responseHeaders: fulfilled.headers,
    body: fulfilled.body
  }, sessionId);
}

export async function fetchNetworkFulfillResponse(
  targetUrl: string,
  request: NetworkFulfillRequest | undefined,
  timeoutMs = CONTROL_FETCH_TIMEOUT_MS,
  requestFetch: typeof fetch = fetch
): Promise<NetworkFulfillResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(request?.headers ?? {})) {
      if (!["cookie", "authorization", "host", "content-length"].includes(name.toLowerCase())) headers.set(name, value);
    }
    const method = request?.method ?? "GET";
    const response = await requestFetch(targetUrl, {
      method,
      headers,
      ...(method === "GET" || method === "HEAD" || request?.postData === undefined
        ? {}
        : { body: request.postData }),
      signal: controller.signal,
      redirect: "follow"
    });
    const body = Buffer.from(await response.arrayBuffer());
    if (body.byteLength > MAX_FULFILL_BODY_BYTES) throw new Error("Fulfilled response exceeds the 10 MiB safety limit.");
    const responseHeaders: Array<{ name: string; value: string }> = [];
    response.headers.forEach((value, name) => {
      const lower = name.toLowerCase();
      if (!["content-encoding", "content-length", "transfer-encoding", "connection", "set-cookie"].includes(lower)) {
        responseHeaders.push({ name, value });
      }
    });
    responseHeaders.push({ name: "content-length", value: String(body.byteLength) });
    return { status: response.status, statusText: response.statusText, headers: responseHeaders, body: body.toString("base64") };
  } finally {
    clearTimeout(timer);
  }
}

class CdpClient {
  readonly #socket: WebSocket;
  #nextId = 0;
  readonly #pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  readonly #listeners = new Set<(message: CdpMessage) => void>();

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.addEventListener("message", (event) => this.handleMessage(event.data));
    socket.addEventListener("close", () => this.rejectPending(new Error("The browser debugging connection closed.")));
    socket.addEventListener("error", () => this.rejectPending(new Error("The browser debugging connection failed.")));
  }

  static async connect(url: string): Promise<CdpClient> {
    if (!/^wss?:\/\//i.test(url)) throw new Error("Browser CDP URL must use ws or wss.");
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out connecting to the browser debugger.")), CONTROL_REQUEST_TIMEOUT_MS);
      socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Could not connect to the browser debugger.")); }, { once: true });
    });
    return new CdpClient(socket);
  }

  onEvent(listener: (message: CdpMessage) => void): void {
    this.#listeners.add(listener);
  }

  async send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<unknown> {
    const id = ++this.#nextId;
    const response = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}.`));
      }, CONTROL_REQUEST_TIMEOUT_MS);
      this.#pending.set(id, { resolve, reject, timer });
    });
    this.#socket.send(JSON.stringify({ id, method, params, ...(sessionId === undefined ? {} : { sessionId }) }));
    return await response;
  }

  close(): void {
    this.#socket.close();
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== "string") return;
    let message: CdpMessage;
    try { message = JSON.parse(data) as CdpMessage; } catch { return; }
    if (message.id !== undefined) {
      const pending = this.#pending.get(message.id);
      if (pending === undefined) return;
      this.#pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error !== undefined) pending.reject(new Error(message.error.message ?? "Browser debugger request failed."));
      else pending.resolve(message.result);
      return;
    }
    for (const listener of this.#listeners) listener(message);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }
}

async function readCdpUrl(request: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of request) body += String(chunk);
  let parsed: unknown;
  try { parsed = JSON.parse(body) as unknown; } catch { throw new Error("Attach request must contain JSON."); }
  if (!isRecord(parsed) || typeof parsed.cdpUrl !== "string" || !/^wss?:\/\//i.test(parsed.cdpUrl)) {
    throw new Error("Attach request must contain a ws(s) cdpUrl.");
  }
  return parsed.cdpUrl;
}

function writeControlError(response: ServerResponse, error: unknown): void {
  response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: errorMessage(error) }));
}

function isInterceptableTarget(value: unknown): boolean {
  return value === "page" || value === "iframe";
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
