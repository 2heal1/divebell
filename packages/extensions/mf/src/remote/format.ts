import type {
  RemoteErrorEvidence,
  RemoteResourceEvidence,
  RemoteStageEvidence,
  RemoteStatusResult,
  RemoteTraceResult
} from "./types.js";

export function formatRemoteTrace(result: RemoteTraceResult): string {
  const lines = [
    "Module Federation remote trace",
    `Capability: ${result.capability.status}`,
    `History: ${result.capability.history}`,
    `Outcome: ${result.outcome}`,
    ""
  ];
  if (result.traces.length === 0) {
    lines.push(result.outcome === "unavailable"
      ? "Remote trace is not supported by the current page reader."
      : "No matching trace was observed (unknown).", "");
  }
  for (const trace of result.traces) {
    lines.push(
      `Trace ${trace.traceId}`,
      `  Instance: ${trace.instanceName} (${trace.instanceRef})`,
      `  Target: ${formatTarget(trace.remote, trace.expose)}`,
      `  Request: ${trace.requestId ?? "unknown"}`,
      `  Outcome: ${trace.outcome}`,
      `  Timing: ${formatTime(trace.startedAt)} -> ${formatTime(trace.endedAt)} (${formatDuration(trace.duration)})`,
      `  Flags: cached=${trace.cached} recovered=${trace.recovered} timeout=${trace.timeout}`,
      "  Stages"
    );
    for (const item of trace.stages) appendStage(lines, item, "    ");
    if (trace.error !== undefined) lines.push(`  Error: ${formatError(trace.error)}`);
    lines.push("");
  }
  appendMessages(lines, result.warnings, result.recommendedActions);
  return `${lines.join("\n").trimEnd()}\n`;
}

export function formatRemoteStatus(result: RemoteStatusResult): string {
  const remote = result.remote;
  const lines = [
    "Module Federation remote status",
    `Consumer: ${result.consumer.name} (${result.consumer.instanceRef})`,
    `Remote: ${remote.name}${remote.alias === undefined ? "" : ` (alias: ${remote.alias})`}`,
    `Capability: ${result.capability.status}`,
    `Declared: ${remote.declared}`,
    `Loaded: ${remote.loaded}`,
    `Loaded exposes: ${remote.loadedExposes.join(", ") || "none"}`,
    `Relationship: ${remote.relationship}`,
    `Producer: ${remote.producerInstanceRef ?? remote.candidateProducerInstanceRefs?.join(", ") ?? "unknown"}`,
    `Latest result: ${remote.latestResult}`,
    `Latest trace: ${remote.latestTraceId ?? "none"}`,
    ...(result.proxy === undefined
      ? []
      : [
          `Proxy target: ${result.proxy.target}`,
          `Proxy matched by: ${result.proxy.matchedBy}`,
          `Proxy applied: ${result.proxy.applied}`,
          ...(result.proxy.loadedFrom === undefined
            ? []
            : [`Proxy loaded from: ${result.proxy.loadedFrom}`]),
          ...(result.proxy.error === undefined
            ? []
            : [`Proxy error: ${result.proxy.error}`])
        ]),
    ""
  ];
  appendMessages(lines, result.warnings, result.recommendedActions);
  return `${lines.join("\n").trimEnd()}\n`;
}

function appendStage(
  lines: string[],
  item: RemoteStageEvidence,
  indent: string
): void {
  const timing = item.startedAt === undefined
    ? "timing=unknown"
    : `${formatTime(item.startedAt)} -> ${formatTime(item.endedAt)} (${formatDuration(item.duration)})`;
  lines.push(
    `${indent}${item.label}: ${item.status}`,
    `${indent}  ${timing}`,
    `${indent}  url=${item.url ?? "unknown"} http=${item.httpStatus ?? "unknown"} mime=${item.mimeType ?? "unknown"}`,
    `${indent}  cached=${item.cached} recovered=${item.recovered} timeout=${item.timeout}`
  );
  for (const resource of item.resources) {
    lines.push(`${indent}  resource: ${formatResource(resource)}`);
  }
  if (item.error !== undefined) lines.push(`${indent}  error: ${formatError(item.error)}`);
}

function formatResource(resource: RemoteResourceEvidence): string {
  const response = [
    resource.httpStatus === undefined ? undefined : `HTTP ${resource.httpStatus}`,
    resource.mimeType,
    resource.redirected === undefined ? undefined : `redirected=${resource.redirected}`
  ].filter((value): value is string => value !== undefined).join(" ");
  return [
    resource.type,
    resource.outcome ?? "pending",
    resource.url ?? "unknown",
    response || undefined,
    resource.duration === undefined ? undefined : formatDuration(resource.duration),
    resource.error === undefined ? undefined : `error=${formatError(resource.error)}`
  ].filter((value): value is string => value !== undefined).join(" | ");
}

function formatTarget(
  remote: { name: string; alias?: string } | undefined,
  expose: string | undefined
): string {
  if (remote === undefined) return expose ?? "unknown";
  const name = remote.alias === undefined ? remote.name : `${remote.alias} (${remote.name})`;
  return expose === undefined ? name : `${name}/${expose.replace(/^\.\//, "")}`;
}

function formatError(error: RemoteErrorEvidence): string {
  return [error.code, error.name, error.message].filter(Boolean).join(" | ") || "unknown";
}

function formatTime(value: number | undefined): string {
  return value === undefined ? "unknown" : new Date(value).toISOString();
}

function formatDuration(value: number | undefined): string {
  return value === undefined ? "unknown" : `${value}ms`;
}

function appendMessages(lines: string[], warnings: string[], actions: string[]): void {
  if (warnings.length > 0) {
    lines.push("Warnings", ...warnings.map((warning) => `  - ${warning}`), "");
  }
  if (actions.length > 0) {
    lines.push("Recommended actions", ...actions.map((action) => `  - ${action}`), "");
  }
}
