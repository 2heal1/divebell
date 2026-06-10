import type {
  BridgeRuntimeCommandName,
  BridgeRuntimeQuery,
  BridgeRuntimeRequest,
  BridgeRuntimeResponse
} from "@openruntime/core";
import type { GetEventsResult, RuntimeSnapshot } from "@openruntime/core";
import { BridgeHttpError } from "./http-utils.js";
import type { BridgeRuntimeInfo } from "./types.js";

export interface RuntimeStream {
  send(event: string, data: unknown): void;
  close(): void;
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

interface RuntimeRecord {
  info: BridgeRuntimeInfo;
  stream?: RuntimeStream;
  pending: Map<string, PendingRequest>;
  lastSnapshot?: RuntimeSnapshot;
  lastEvents?: GetEventsResult;
}

export class RuntimeConnectionStore {
  readonly #runtimes = new Map<string, RuntimeRecord>();
  readonly #clock: { now(): number };
  readonly #commandTimeout: number;
  readonly #idGenerator: () => string;
  #requestId = 0;

  constructor(options: {
    clock?: { now(): number };
    commandTimeout?: number;
    idGenerator?: () => string;
  } = {}) {
    this.#clock = options.clock ?? { now: () => Date.now() };
    this.#commandTimeout = options.commandTimeout ?? 5000;
    this.#idGenerator = options.idGenerator ?? (() => `runtime-${this.#clock.now().toString(36)}-${this.#runtimes.size + 1}`);
  }

  connect(url: string, stream: RuntimeStream, pageInstanceId?: string): BridgeRuntimeInfo {
    const now = this.#clock.now();
    const info: BridgeRuntimeInfo = {
      runtimeId: this.#idGenerator(),
      url,
      ...(pageInstanceId === undefined ? {} : { pageInstanceId }),
      status: "connected",
      connectedAt: now,
      lastSeenAt: now
    };

    this.#runtimes.set(info.runtimeId, {
      info,
      stream,
      pending: new Map()
    });

    return { ...info };
  }

  disconnect(runtimeId: string, stream: RuntimeStream): void {
    const runtime = this.#runtimes.get(runtimeId);
    if (runtime === undefined || runtime.stream !== stream) return;

    delete runtime.stream;
    runtime.info = {
      ...runtime.info,
      status: "disconnected",
      disconnectedAt: this.#clock.now(),
      lastSeenAt: this.#clock.now()
    };

    for (const [requestId, pending] of runtime.pending) {
      clearTimeout(pending.timer);
      pending.reject(createRuntimeDisconnectedError(`Runtime "${runtimeId}" disconnected before responding to request "${requestId}".`));
    }
    runtime.pending.clear();
  }

  disconnectAll(): void {
    for (const runtime of this.#runtimes.values()) {
      runtime.stream?.close();
      delete runtime.stream;
      runtime.info = {
        ...runtime.info,
        status: "disconnected",
        disconnectedAt: this.#clock.now(),
        lastSeenAt: this.#clock.now()
      };
      this.#rejectPending(runtime, createRuntimeDisconnectedError(`Runtime "${runtime.info.runtimeId}" disconnected.`));
    }
  }

  list(): BridgeRuntimeInfo[] {
    return Array.from(this.#runtimes.values())
      .filter((runtime) => runtime.info.status === "connected")
      .map((runtime) => ({ ...runtime.info }))
      .sort((left, right) => right.lastSeenAt - left.lastSeenAt);
  }

  get(runtimeId: string): BridgeRuntimeInfo | undefined {
    const runtime = this.#runtimes.get(runtimeId);
    return runtime === undefined ? undefined : { ...runtime.info };
  }

  getCachedSnapshot(runtimeId: string): RuntimeSnapshot | undefined {
    return this.#runtimes.get(runtimeId)?.lastSnapshot;
  }

  getCachedEvents(runtimeId: string): GetEventsResult | undefined {
    return this.#runtimes.get(runtimeId)?.lastEvents;
  }

  cacheResult(runtimeId: string, method: BridgeRuntimeCommandName, result: unknown): void {
    const runtime = this.#runtimes.get(runtimeId);
    if (runtime === undefined) return;

    if (method === "getSnapshot") {
      runtime.lastSnapshot = result as RuntimeSnapshot;
    } else if (method === "getEvents") {
      runtime.lastEvents = result as GetEventsResult;
    }
  }

  request(
    runtimeId: string,
    method: BridgeRuntimeCommandName,
    requestInput: Omit<BridgeRuntimeRequest, "requestId" | "method"> = {},
    timeout?: number
  ): Promise<unknown> {
    const runtime = this.#runtimes.get(runtimeId);
    if (runtime === undefined) {
      return Promise.reject(new Error(`Runtime "${runtimeId}" was not found.`));
    }

    if (runtime.stream === undefined || runtime.info.status !== "connected") {
      return Promise.reject(new Error(`Runtime "${runtimeId}" is disconnected.`));
    }

    const requestId = `request-${this.#requestId += 1}`;
    const request: BridgeRuntimeRequest = {
      requestId,
      method,
      ...requestInput
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        runtime.pending.delete(requestId);
        reject(new Error(`Timed out waiting for runtime "${runtimeId}" to respond to "${method}".`));
      }, timeout ?? this.#commandTimeout);

      runtime.pending.set(requestId, {
        resolve,
        reject,
        timer
      });
      runtime.stream?.send("request", request);
    });
  }

  resolve(runtimeId: string, requestId: string, response: BridgeRuntimeResponse): boolean {
    const runtime = this.#runtimes.get(runtimeId);
    const pending = runtime?.pending.get(requestId);
    if (runtime === undefined || pending === undefined) return false;

    clearTimeout(pending.timer);
    runtime.pending.delete(requestId);
    runtime.info = {
      ...runtime.info,
      lastSeenAt: this.#clock.now()
    };

    if (response.success) {
      pending.resolve(response.result);
    } else {
      pending.reject(new Error(response.error?.message ?? "Runtime request failed."));
    }

    return true;
  }

  #rejectPending(runtime: RuntimeRecord, error: Error): void {
    for (const pending of runtime.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    runtime.pending.clear();
  }
}

function createRuntimeDisconnectedError(message: string): BridgeHttpError {
  return new BridgeHttpError(409, "runtime_disconnected", message);
}
