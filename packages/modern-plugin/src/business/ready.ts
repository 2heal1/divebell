import type { DivebellCore } from "@divebell/core";

const businessReadyStatuses = ["pending", "ready", "error"] as const;

export interface RegisterDivebellReadyOptions {
  runtime: DivebellCore;
  id?: string;
  label?: string;
  source?: string;
  data?: unknown;
}

export function registerDivebellReady(options: RegisterDivebellReadyOptions): string {
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

export function markDivebellReady(
  runtime: DivebellCore,
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

export function markDivebellReadyError(
  runtime: DivebellCore,
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

export function unregisterDivebellReady(runtime: DivebellCore, id?: string): void {
  runtime.unregisterTarget(getBusinessReadyTargetId(id));
}

function getBusinessReadyTargetId(id = "app"): string {
  return `business:ready:${id}`;
}
