import type { DebugEvent, DebugEventsResult } from "./debug-client.js";
import type {
  HmrCycle,
  HmrOutcome,
  HmrResult,
  NormalizedEvent,
  ObservationManifest,
  ProbeEventKind,
  SourceLocation
} from "./types.js";

const HMR_STATUSES = new Set([
  "idle",
  "check",
  "prepare",
  "ready",
  "dispose",
  "apply",
  "abort",
  "fail"
]);

export function appendDebugEvents(
  observation: ObservationManifest,
  batch: DebugEventsResult
): ObservationManifest {
  const next = batch.events.flatMap((event) =>
    normalizeDebugEvent(observation, event)
  );
  if (batch.bufferGap) {
    next.push({
      sequence: batch.latestSequence,
      timestamp: Date.now(),
      type: "evidence.gap",
      error: "buffer"
    });
  }
  if (batch.transportGap) {
    next.push({
      sequence: batch.latestSequence,
      timestamp: Date.now(),
      type: "evidence.gap",
      error: "transport"
    });
  }
  const events = uniqueBy(
    [...observation.events, ...next].sort((left, right) =>
      left.sequence - right.sequence
    ),
    (event) => `${event.sequence}\u0000${event.type}\u0000${event.probeId ?? ""}\u0000${event.error ?? ""}`
  );
  return {
    ...observation,
    status: next.length === 0 || observation.status === "completed"
      ? observation.status
      : "observing",
    updatedAt: new Date().toISOString(),
    latestSequence: Math.max(observation.latestSequence, batch.latestSequence),
    events
  };
}

export function normalizeDebugEvent(
  observation: ObservationManifest,
  event: DebugEvent
): NormalizedEvent[] {
  if (
    event.connectionGeneration !== observation.connectionGeneration
    || event.sessionId !== observation.sessionId
  ) {
    return [];
  }
  if (event.type === "document-invalidated") {
    return [{
      sequence: event.sequence,
      timestamp: event.timestamp,
      type: "document.invalidated"
    }];
  }
  if (event.type === "document-committed") {
    return [{
      sequence: event.sequence,
      timestamp: event.timestamp,
      type: "document.committed"
    }];
  }
  if (event.type !== "logpoint-hit" || !isRecord(event.data)) return [];
  const tags = isRecord(event.data.tags) ? event.data.tags : {};
  if (tags.observation !== observation.observationId) return [];
  const type = typeof tags.event === "string" && isProbeEvent(tags.event)
    ? tags.event
    : undefined;
  if (type === undefined) return [];
  const values = expressionValues(event.data.values);
  const statusValue = firstString(values);
  const moduleId = valueText(values.get("moduleId"));
  const error = Array.from(values.entries())
    .find(([expression]) => expression.includes("error") || expression.includes("errors"));
  const location = parseLocation(event.data.location);
  return [{
    sequence: event.sequence,
    timestamp: event.timestamp,
    type,
    ...(typeof tags.runtime === "string" ? { runtimeId: tags.runtime } : {}),
    ...(typeof event.data.probeId === "string" ? { probeId: event.data.probeId } : {}),
    ...(type === "hmr.status" && statusValue !== undefined && HMR_STATUSES.has(statusValue)
      ? { status: statusValue }
      : {}),
    ...(moduleId === undefined ? {} : { moduleId }),
    ...(error === undefined ? {} : { error: valueText(error[1]) ?? "unknown error" }),
    ...(location === undefined ? {} : { location })
  }];
}

export function reduceCycles(events: readonly NormalizedEvent[]): HmrCycle[] {
  const cycles: HmrCycle[] = [];
  const active = new Map<string, HmrCycle>();
  for (const event of events) {
    if (event.type !== "hmr.status" || event.runtimeId === undefined || event.status === undefined) {
      continue;
    }
    let cycle = active.get(event.runtimeId);
    if (event.status === "check") {
      if (cycle !== undefined && cycle.endedAtSequence === undefined) {
        cycle.endedAtSequence = event.sequence - 1;
        cycle.outcome = "incomplete";
      }
      cycle = {
        cycleId: `${event.runtimeId}:${event.sequence}`,
        runtimeId: event.runtimeId,
        startedAtSequence: event.sequence,
        statusPath: [],
        outcome: "incomplete"
      };
      cycles.push(cycle);
      active.set(event.runtimeId, cycle);
    } else if (cycle === undefined || cycle.endedAtSequence !== undefined) {
      cycle = {
        cycleId: `${event.runtimeId}:${event.sequence}:partial`,
        runtimeId: event.runtimeId,
        startedAtSequence: event.sequence,
        statusPath: [],
        outcome: "incomplete"
      };
      cycles.push(cycle);
      active.set(event.runtimeId, cycle);
    }
    cycle.statusPath.push(event.status);
    if (event.status === "abort") {
      cycle.outcome = "aborted";
      cycle.endedAtSequence = event.sequence;
    } else if (event.status === "fail") {
      cycle.outcome = "failed";
      cycle.endedAtSequence = event.sequence;
    } else if (event.status === "idle") {
      cycle.outcome = cycle.statusPath.includes("apply")
        ? "applied"
        : cycle.statusPath.includes("check")
          ? "no-update"
          : "incomplete";
      cycle.endedAtSequence = event.sequence;
    }
  }
  if (events.some((event) => event.type === "evidence.gap")) {
    for (const cycle of cycles) cycle.outcome = "unknown";
  }
  return cycles;
}

export function currentOutcome(
  events: readonly NormalizedEvent[],
  cycles = reduceCycles(events)
): HmrOutcome {
  if (events.some((event) => event.type === "evidence.gap")) return "unknown";
  if (events.some((event) => event.type === "document.committed")) return "reloaded";
  const outcomes = cycles.map((cycle) => cycle.outcome);
  if (outcomes.includes("failed")) return "failed";
  if (outcomes.includes("aborted")) return "aborted";
  if (outcomes.includes("incomplete")) return "incomplete";
  if (outcomes.includes("applied")) return "applied";
  if (outcomes.includes("no-update")) return "no-update";
  return "incomplete";
}

export function refreshSummary(events: readonly NormalizedEvent[]): HmrResult["refresh"] {
  const boundaryRefresh = events.some((event) =>
    event.type === "refresh.boundary-refresh"
  );
  const boundaryInvalidated = events.some((event) =>
    event.type === "refresh.boundary-invalidate"
  );
  const nonBoundary = events.some((event) =>
    event.type === "refresh.non-boundary-invalidate"
  );
  const completed = events.some((event) => event.type === "refresh.completed");
  return {
    boundary: boundaryInvalidated
      ? "invalidated"
      : nonBoundary
        ? "non-boundary"
        : boundaryRefresh && completed
          ? "refreshed"
          : boundaryRefresh
            ? "queued"
            : "not-observed",
    completed,
    moduleIds: Array.from(new Set(events
      .filter((event) => event.type.startsWith("refresh.") && event.moduleId !== undefined)
      .map((event) => event.moduleId as string)))
  };
}

function expressionValues(value: unknown): Map<string, unknown> {
  const result = new Map<string, unknown>();
  if (!Array.isArray(value)) return result;
  for (const item of value) {
    if (!isRecord(item) || typeof item.expression !== "string") continue;
    if ("value" in item) result.set(item.expression, item.value);
    else if (typeof item.evaluationError === "string") {
      result.set(item.expression, { evaluationError: item.evaluationError });
    }
  }
  return result;
}

function firstString(values: Map<string, unknown>): string | undefined {
  for (const value of values.values()) {
    if (typeof value === "string") return value;
  }
  return undefined;
}

function valueText(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseLocation(value: unknown): SourceLocation | undefined {
  if (!isRecord(value) || typeof value.line !== "number" || typeof value.column !== "number") {
    return undefined;
  }
  return { line: value.line, column: value.column };
}

function isProbeEvent(value: string): value is ProbeEventKind {
  return [
    "hmr.status",
    "hmr.invalidate",
    "hmr.abort-error",
    "hmr.apply-error",
    "refresh.boundary-refresh",
    "refresh.boundary-invalidate",
    "refresh.non-boundary-invalidate",
    "refresh.completed",
    "reload.requested"
  ].includes(value);
}

function uniqueBy<Value>(values: Value[], key: (value: Value) => string): Value[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const current = key(value);
    if (seen.has(current)) return false;
    seen.add(current);
    return true;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
