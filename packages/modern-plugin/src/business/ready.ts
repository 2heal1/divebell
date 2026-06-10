import type { OpenRuntimeCore } from "@openruntime/core";

const businessReadyStatuses = ["pending", "ready", "error"] as const;

export interface RegisterOpenRuntimeReadyOptions {
  runtime: OpenRuntimeCore;
  id?: string;
  label?: string;
  source?: string;
  data?: unknown;
}

export function registerOpenRuntimeReady(options: RegisterOpenRuntimeReadyOptions): string {
  const targetId = getBusinessReadyTargetId(options.id);
  const source = options.source ?? "business";

  options.runtime.registerTarget({
    id: targetId,
    type: "business.ready",
    source,
    label: options.label ?? targetId,
    statuses: [...businessReadyStatuses],
    ...(options.data === undefined ? {} : { data: options.data })
  });
  if (options.runtime.getSnapshot({ id: targetId }).targets[targetId] === undefined) {
    options.runtime.updateSnapshot({
      id: targetId,
      status: "pending",
      source,
      ...(options.data === undefined ? {} : { data: options.data })
    });
  }

  return targetId;
}

export function markOpenRuntimeReady(
  runtime: OpenRuntimeCore,
  id?: string,
  data?: unknown
): void {
  runtime.updateSnapshot({
    id: getBusinessReadyTargetId(id),
    status: "ready",
    source: "business",
    ...(data === undefined ? {} : { data })
  });
}

export function markOpenRuntimeReadyError(
  runtime: OpenRuntimeCore,
  error: Error | string,
  id?: string
): void {
  runtime.updateSnapshot({
    id: getBusinessReadyTargetId(id),
    status: "error",
    source: "business",
    error: {
      message: typeof error === "string" ? error : error.message,
      ...(typeof error === "string" || error.stack === undefined ? {} : { stack: error.stack })
    }
  });
}

function getBusinessReadyTargetId(id = "app"): string {
  return `business:ready:${id}`;
}
