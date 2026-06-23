import { matchesText, matchesValue } from "../shared/query.js";
import type { RuntimeClock } from "../runtime/types.js";
import type { GetEventsQuery, GetEventsResult, RuntimeEvent } from "./types.js";

export type AppendRuntimeEventInput = Omit<RuntimeEvent, "id" | "timestamp">;

const DEFAULT_EVENT_LIMIT = 100;

export class EventLog {
  readonly #clock: RuntimeClock;
  readonly #events: RuntimeEvent[] = [];
  #nextEventId = 1;

  constructor(clock: RuntimeClock) {
    this.#clock = clock;
  }

  append(input: AppendRuntimeEventInput): RuntimeEvent {
    const event = normalizeEvent(input, this.#nextEventId, this.#clock.now());
    this.#nextEventId += 1;
    this.#events.push(event);
    return cloneEvent(event);
  }

  latestEventId(): number {
    return this.#nextEventId - 1;
  }

  get(query?: GetEventsQuery): GetEventsResult {
    const filtered = this.#events.filter((event) => matchesEvent(event, query));
    const limit = normalizeLimit(query?.limit);
    const truncated = filtered.length > limit;
    const events = truncated ? filtered.slice(filtered.length - limit) : filtered;

    return {
      events: events.map(cloneEvent),
      latestEventId: this.latestEventId(),
      truncated
    };
  }
}

function normalizeEvent(
  input: AppendRuntimeEventInput,
  id: number,
  timestamp: number
): RuntimeEvent {
  const event: RuntimeEvent = {
    id,
    type: input.type,
    source: input.source,
    timestamp
  };

  if (input.targetId !== undefined) event.targetId = input.targetId;
  if (input.actionName !== undefined) event.actionName = input.actionName;
  if (input.status !== undefined) event.status = input.status;
  if ("payload" in input) event.payload = input.payload;
  if (input.error !== undefined) event.error = { ...input.error };

  return event;
}

function cloneEvent(event: RuntimeEvent): RuntimeEvent {
  const clone: RuntimeEvent = {
    id: event.id,
    type: event.type,
    source: event.source,
    timestamp: event.timestamp
  };

  if (event.targetId !== undefined) clone.targetId = event.targetId;
  if (event.actionName !== undefined) clone.actionName = event.actionName;
  if (event.status !== undefined) clone.status = event.status;
  if ("payload" in event) clone.payload = event.payload;
  if (event.error !== undefined) clone.error = { ...event.error };

  return clone;
}

function matchesEvent(event: RuntimeEvent, query: GetEventsQuery | undefined): boolean {
  if (query === undefined) {
    return true;
  }

  if (query.since !== undefined && event.id <= query.since) {
    return false;
  }

  return (
    matchesValue(event.targetId, query.targetId) &&
    matchesValue(event.actionName, query.actionName) &&
    matchesValue(event.type, query.type) &&
    matchesValue(event.source, query.source) &&
    matchesValue(event.status, query.status) &&
    matchesEventText(event, query.query)
  );
}

function matchesEventText(event: RuntimeEvent, query: string | undefined): boolean {
  return matchesText([
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
  ], query);
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
  if (limit === undefined) {
    return DEFAULT_EVENT_LIMIT;
  }

  if (!Number.isFinite(limit) || limit < 1) {
    return DEFAULT_EVENT_LIMIT;
  }

  return Math.floor(limit);
}
