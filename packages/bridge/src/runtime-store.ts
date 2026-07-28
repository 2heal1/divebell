import type {
  BridgeRuntimeCommandName,
  BridgeServerRuntimeSyncPayload,
  BridgeRuntimeQuery,
  BridgeRuntimeRequest,
  BridgeRuntimeResponse
} from "@divebell/core";
import type {
  GetActionsQuery,
  GetEventsQuery,
  GetEventsResult,
  GetTargetsQuery,
  RuntimeEvent,
  RuntimeActionDescriptor,
  RuntimeSnapshot,
  RuntimeTargetDescriptor
} from "@divebell/core";
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
  lastTargets?: RuntimeTargetDescriptor[];
  lastActions?: RuntimeActionDescriptor[];
  serverSnapshot?: RuntimeSnapshot;
  serverEvents?: GetEventsResult;
  runtimeEvents?: GetEventsResult;
  serverTargets?: RuntimeTargetDescriptor[];
  serverActions?: RuntimeActionDescriptor[];
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

  connect(
    url: string,
    stream: RuntimeStream,
    options: {
      pageInstanceId?: string;
      connectionId?: string;
      runtimeId?: string;
      sessionId?: string;
      renderId?: string;
      source?: string;
      name?: string;
      parentRuntimeId?: string;
    } = {}
  ): BridgeRuntimeInfo {
    const now = this.#clock.now();
    const existing = options.runtimeId === undefined ? undefined : this.#runtimes.get(options.runtimeId);
    if (existing !== undefined) {
      const { disconnectedAt: _disconnectedAt, ...activeInfo } = existing.info;
      existing.info = {
        ...activeInfo,
        url,
        ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
        ...(options.renderId === undefined ? {} : { renderId: options.renderId }),
        ...(options.source === undefined ? {} : { source: options.source }),
        ...(options.name === undefined ? {} : { name: options.name }),
        ...(options.parentRuntimeId === undefined ? {} : { parentRuntimeId: options.parentRuntimeId }),
        ...(options.pageInstanceId === undefined ? {} : { pageInstanceId: options.pageInstanceId }),
        ...(options.connectionId === undefined ? {} : { connectionId: options.connectionId }),
        status: "connected",
        lastSeenAt: now
      };
      existing.stream = stream;
      return { ...existing.info };
    }

    const info: BridgeRuntimeInfo = {
      runtimeId: options.runtimeId ?? this.#idGenerator(),
      url,
      ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
      ...(options.renderId === undefined ? {} : { renderId: options.renderId }),
      ...(options.source === undefined ? {} : { source: options.source }),
      ...(options.name === undefined ? {} : { name: options.name }),
      ...(options.parentRuntimeId === undefined ? {} : { parentRuntimeId: options.parentRuntimeId }),
      ...(options.pageInstanceId === undefined ? {} : { pageInstanceId: options.pageInstanceId }),
      ...(options.connectionId === undefined ? {} : { connectionId: options.connectionId }),
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

  syncServerRuntime(input: BridgeServerRuntimeSyncPayload): BridgeRuntimeInfo {
    const now = this.#clock.now();
    const existing = this.#runtimes.get(input.runtimeId);
    const existingInfo = existing?.info;
    const { disconnectedAt: _disconnectedAt, ...activeInfo } = existingInfo ?? {
      runtimeId: input.runtimeId,
      connectedAt: now
    };
    const info: BridgeRuntimeInfo = {
      ...activeInfo,
      url: input.url,
      ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
      ...(input.renderId === undefined ? {} : { renderId: input.renderId }),
      ...(input.source === undefined ? {} : { source: input.source }),
      status: existing?.stream === undefined ? "server" : "connected",
      lastSeenAt: now
    };

    const record: RuntimeRecord = existing ?? {
      info,
      pending: new Map()
    };
    record.info = info;
    if (input.targets !== undefined) {
      record.serverTargets = input.targets;
      record.lastTargets = input.targets;
    }
    if (input.snapshot !== undefined) {
      record.serverSnapshot = input.snapshot;
      record.lastSnapshot = mergeSnapshots(input.snapshot, record.lastSnapshot) ?? input.snapshot;
    }
    if (input.events !== undefined) {
      record.serverEvents = input.events;
      record.lastEvents = mergeEvents(record.serverEvents, record.runtimeEvents) ?? input.events;
    }
    if (input.actions !== undefined) {
      record.serverActions = input.actions;
      record.lastActions = input.actions;
    }
    this.#runtimes.set(input.runtimeId, record);

    return { ...record.info };
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

  disconnectConnection(runtimeId: string, connectionId: string): boolean {
    const runtime = this.#runtimes.get(runtimeId);
    if (
      runtime?.stream === undefined ||
      runtime.info.connectionId !== connectionId
    ) {
      return false;
    }

    const stream = runtime.stream;
    this.disconnect(runtimeId, stream);
    stream.close();
    return true;
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
      .filter((runtime) => runtime.info.status !== "disconnected")
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

  getCachedEvents(runtimeId: string, query?: BridgeRuntimeQuery): GetEventsResult | undefined {
    const events = this.#runtimes.get(runtimeId)?.lastEvents;
    if (events === undefined) return undefined;
    return filterEvents(events, query as GetEventsQuery | undefined);
  }

  getCachedTargets(runtimeId: string, query?: BridgeRuntimeQuery): RuntimeTargetDescriptor[] | undefined {
    const targets = this.#runtimes.get(runtimeId)?.lastTargets;
    if (targets === undefined) return undefined;
    return filterTargets(targets, query as GetTargetsQuery | undefined);
  }

  getCachedActions(runtimeId: string, query?: BridgeRuntimeQuery): RuntimeActionDescriptor[] | undefined {
    const actions = this.#runtimes.get(runtimeId)?.lastActions;
    if (actions === undefined) return undefined;
    return filterActions(actions, query as GetActionsQuery | undefined);
  }

  hasCachedTarget(runtimeId: string, targetId: string): boolean {
    const runtime = this.#runtimes.get(runtimeId);
    return runtime?.lastSnapshot?.targets[targetId] !== undefined
      || runtime?.lastTargets?.some((target) => target.id === targetId) === true;
  }

  cacheResult(runtimeId: string, method: BridgeRuntimeCommandName, result: unknown): void {
    const runtime = this.#runtimes.get(runtimeId);
    if (runtime === undefined) return;

    if (method === "getSnapshot") {
      const snapshot = result as RuntimeSnapshot;
      runtime.lastSnapshot = mergeSnapshots(runtime.serverSnapshot, snapshot) ?? snapshot;
    } else if (method === "getEvents") {
      runtime.runtimeEvents = result as GetEventsResult;
      runtime.lastEvents = mergeEvents(runtime.serverEvents, runtime.runtimeEvents) ?? runtime.runtimeEvents;
    } else if (method === "getTargets") {
      runtime.lastTargets = mergeTargets(runtime.serverTargets, result as RuntimeTargetDescriptor[]);
    } else if (method === "getActions") {
      runtime.lastActions = mergeActions(runtime.serverActions, result as RuntimeActionDescriptor[]);
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

function mergeSnapshots(
  serverSnapshot: RuntimeSnapshot | undefined,
  runtimeSnapshot: RuntimeSnapshot | undefined
): RuntimeSnapshot | undefined {
  if (serverSnapshot === undefined) {
    return runtimeSnapshot;
  }
  if (runtimeSnapshot === undefined) {
    return serverSnapshot;
  }

  return {
    targets: {
      ...serverSnapshot.targets,
      ...runtimeSnapshot.targets
    },
    latestEventId: Math.max(serverSnapshot.latestEventId, runtimeSnapshot.latestEventId),
    capturedAt: Math.max(serverSnapshot.capturedAt, runtimeSnapshot.capturedAt)
  };
}

function mergeTargets(
  serverTargets: RuntimeTargetDescriptor[] | undefined,
  runtimeTargets: RuntimeTargetDescriptor[]
): RuntimeTargetDescriptor[] {
  if (serverTargets === undefined || serverTargets.length === 0) {
    return runtimeTargets;
  }

  const merged = new Map(serverTargets.map((target) => [target.id, target]));
  for (const target of runtimeTargets) {
    merged.set(target.id, target);
  }

  return [...merged.values()];
}

function mergeActions(
  serverActions: RuntimeActionDescriptor[] | undefined,
  runtimeActions: RuntimeActionDescriptor[]
): RuntimeActionDescriptor[] {
  if (serverActions === undefined || serverActions.length === 0) {
    return runtimeActions;
  }

  const merged = new Map(serverActions.map((action) => [action.name, action]));
  for (const action of runtimeActions) {
    merged.set(action.name, action);
  }

  return [...merged.values()];
}

function mergeEvents(
  serverEvents: GetEventsResult | undefined,
  runtimeEvents: GetEventsResult | undefined
): GetEventsResult | undefined {
  if (serverEvents === undefined) {
    return runtimeEvents;
  }
  if (runtimeEvents === undefined) {
    return serverEvents;
  }

  return {
    events: mergeEventList(serverEvents.events, runtimeEvents.events),
    latestEventId: Math.max(serverEvents.latestEventId, runtimeEvents.latestEventId),
    truncated: serverEvents.truncated || runtimeEvents.truncated
  };
}

function mergeEventList(serverEvents: RuntimeEvent[], runtimeEvents: RuntimeEvent[]): RuntimeEvent[] {
  const merged = new Map<string, RuntimeEvent>();
  for (const event of [...serverEvents, ...runtimeEvents]) {
    merged.set(getEventKey(event), event);
  }

  return [...merged.values()].sort((left, right) => {
    if (left.timestamp !== right.timestamp) return left.timestamp - right.timestamp;
    return left.id - right.id;
  });
}

function getEventKey(event: RuntimeEvent): string {
  return [
    event.source,
    event.id,
    event.timestamp,
    event.type,
    event.targetId ?? "",
    event.actionName ?? "",
    event.status ?? ""
  ].join(":");
}

function filterTargets(
  targets: RuntimeTargetDescriptor[],
  query: GetTargetsQuery | undefined
): RuntimeTargetDescriptor[] {
  if (query === undefined) return targets;

  return targets.filter((target) => {
    if (!matchesQueryValue(target.id, query.id)) return false;
    if (!matchesQueryValue(target.type, query.type)) return false;
    if (!matchesQueryValue(target.source, query.source)) return false;
    if (query.query !== undefined && !target.id.includes(query.query) && !target.type.includes(query.query)) {
      return false;
    }
    return true;
  });
}

function filterActions(
  actions: RuntimeActionDescriptor[],
  query: GetActionsQuery | undefined
): RuntimeActionDescriptor[] {
  if (query === undefined) return actions;

  return actions.filter((action) => {
    if (!matchesQueryValue(action.source, query.source)) return false;
    if (query.query !== undefined && !action.name.includes(query.query) && !action.description?.includes(query.query)) {
      return false;
    }
    return true;
  });
}

function filterEvents(
  result: GetEventsResult,
  query: GetEventsQuery | undefined
): GetEventsResult {
  if (query === undefined) return result;

  const filtered = result.events.filter((event) => matchesEvent(event, query));
  const limit = normalizeLimit(query.limit);
  const truncated = result.truncated || filtered.length > limit;
  const events = truncated ? filtered.slice(filtered.length - limit) : filtered;
  return {
    events,
    latestEventId: result.latestEventId,
    truncated
  };
}

function matchesEvent(event: RuntimeEvent, query: GetEventsQuery): boolean {
  if (query.since !== undefined && event.id <= query.since) {
    return false;
  }

  return (
    matchesQueryValue(event.targetId, query.targetId) &&
    matchesQueryValue(event.actionName, query.actionName) &&
    matchesQueryValue(event.type, query.type) &&
    matchesQueryValue(event.source, query.source) &&
    matchesQueryValue(event.status, query.status) &&
    matchesEventText(event, query.query)
  );
}

function matchesEventText(event: RuntimeEvent, query: string | undefined): boolean {
  if (query === undefined || query === "") return true;

  const normalizedQuery = query.toLowerCase();
  return [
    event.targetId,
    event.actionName,
    event.type,
    event.source,
    event.status,
    event.error?.message,
    event.error?.code,
    event.error?.stack,
    stringifySearchValue(event.error?.data),
    stringifySearchValue(event.payload)
  ].some((field) => field?.toLowerCase().includes(normalizedQuery) ?? false);
}

function stringifySearchValue(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit) || limit < 1) {
    return 100;
  }

  return Math.floor(limit);
}

function matchesQueryValue(value: string | undefined, expected: string | string[] | undefined): boolean {
  if (expected === undefined) return true;
  if (value === undefined) return false;
  return Array.isArray(expected) ? expected.includes(value) : value === expected;
}
