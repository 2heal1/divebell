import { createCompatibilitySummary } from "../results.js";
import { remotesMatch, visibleInstanceName } from "../selection.js";
import type {
  BrowserObservabilitySnapshot,
  RuntimeRemote,
  RuntimeReport,
  RuntimeReportEvent,
  RuntimeResource
} from "../types.js";
import { RemoteCoreError } from "./errors.js";
import {
  isRemoteTraceReport,
  normalizeExpose,
  reportInstanceRef,
  selectRemoteStatus,
  selectRemoteTrace
} from "./selection.js";
import type {
  RemoteCapabilitySummary,
  RemoteErrorEvidence,
  RemoteEvidenceStatus,
  RemoteLoadStageName,
  RemotePreloadStageName,
  RemoteResourceEvidence,
  RemoteProxyStatus,
  RemoteStageEvidence,
  RemoteStatusResult,
  RemoteTraceKind,
  RemoteTraceOutcome,
  RemoteTraceResult,
  RemoteTraceSelectors,
  RemoteTraceSummary
} from "./types.js";

interface StageDefinition {
  name: RemoteLoadStageName | RemotePreloadStageName;
  label: string;
  matches(event: RuntimeReportEvent): boolean;
  useReportFallback?: boolean;
}

const loadStages: StageDefinition[] = [
  stage("request", "Request start", (event) =>
    event.phase === "loadRemote" && event.lifecycle === "beforeRequest"
  ),
  stage("matchRemote", "Remote match", (event) => event.phase === "matchRemote"),
  stage("manifest", "Manifest or snapshot", (event) => event.phase === "manifest"),
  stage("remoteEntry", "remoteEntry resource", (event) => event.phase === "remoteEntry"),
  stage("containerInit", "Container init", (event) => event.phase === "remoteEntryInit"),
  stage("expose", "Expose get", (event) => event.phase === "expose"),
  stage("factory", "Factory execution", (event) => event.phase === "moduleFactory"),
  {
    ...stage("result", "Final result", (event) =>
      event.phase === "loadRemote" && event.lifecycle !== "beforeRequest"
    ),
    useReportFallback: true
  }
];

const preloadStages: StageDefinition[] = [
  stage("preloadTarget", "Preload target", (event) =>
    event.phase === "preload" && event.lifecycle === "generatePreloadAssets"
  ),
  stage("manifest", "Manifest resolution", (event) =>
    event.phase === "manifest" && event.resource?.initiator === "preloadRemote"
  ),
  stage("resources", "Resource requests", (event) =>
    event.resource?.initiator === "preloadRemote" && event.resource.type !== "manifest"
  ),
  {
    ...stage("result", "Final result", (event) =>
      event.phase === "preload" && event.lifecycle === "afterPreloadRemote"
    ),
    useReportFallback: true
  }
];

export function createRemoteTraceResult(
  snapshot: BrowserObservabilitySnapshot,
  kind: RemoteTraceKind,
  selectors: RemoteTraceSelectors
): RemoteTraceResult {
  const compatibility = createCompatibilitySummary(snapshot);
  const capability = remoteCapability(snapshot);
  const command = "mf remote trace";
  const common = remoteMessages(snapshot, capability);
  if (!capability.available) {
    return {
      schemaVersion: 1,
      command,
      capability,
      compatibility,
      selection: compactSelection(selectors),
      outcome: "unavailable",
      traces: [],
      warnings: common.warnings,
      recommendedActions: common.actions
    };
  }

  const selected = selectRemoteTrace(snapshot, kind, selectors);
  if (!selected.ok) throw new RemoteCoreError(selected.issue);
  const traces = selected.value.reports.map((report) => {
    const trace = buildRemoteTrace(
      report,
      kind,
      selected.value.consumer === undefined
        ? undefined
        : visibleInstanceName(selected.value.consumer)
    );
    return kind === "load"
      ? { ...trace, preload: matchingPreload(snapshot, report) }
      : trace;
  });
  const outcome = traceCollectionOutcome(traces, capability);
  const warnings = [...common.warnings];
  const actions = [...common.actions];
  if (traces.length === 0) {
    warnings.push(selectors.target === undefined
      ? `No ${kind === "load" ? "remote loading" : "preload"} trace is present in the captured page history.`
      : `No ${kind === "load" ? "remote loading" : "preload"} evidence was observed for ${selectors.target}.`);
    actions.push("Reopen the page before the loading path starts, reproduce it, and run the command again.");
  }
  return {
    schemaVersion: 1,
    command,
    capability,
    compatibility,
    selection: compactSelection(selectors),
    outcome,
    traces,
    warnings: unique(warnings),
    recommendedActions: unique(actions)
  };
}

export function createRemoteStatusResult(
  snapshot: BrowserObservabilitySnapshot,
  remoteName: string,
  selectors: Omit<RemoteTraceSelectors, "target" | "traceId">
): RemoteStatusResult {
  const compatibility = createCompatibilitySummary(snapshot);
  const capability = remoteCapability(snapshot);
  const selection = selectRemoteStatus(snapshot, { ...selectors, target: remoteName });
  if (!selection.ok) throw new RemoteCoreError(selection.issue);
  const { consumer, target, reports } = selection.value;
  const declaredRemote = consumer.remotes.find((remote) => remotesMatch(remote, target.remote));
  const loadedRemote = consumer.loadedProducers.find((remote) =>
    remotesMatch(remote, target.remote)
  );
  const selectedRemote = mergeRemote(target.remote, declaredRemote, loadedRemote);
  const proxy = createRemoteProxyStatus(
    snapshot,
    declaredRemote ?? selectedRemote,
    reports
  );
  const relationships = snapshot.state.relationships.filter((relationship) =>
    relationship.consumerInstanceRef === consumer.instanceRef &&
    remotesMatch(relationship.remote, selectedRemote)
  );
  const relationship = relationships.length === 1 ? relationships[0] : undefined;
  const successfulReports = reports.filter((report) => {
    const outcome = reportOutcome(report);
    return outcome === "success" || outcome === "recovered";
  });
  const latestReport = reports.at(-1);
  const common = remoteMessages(snapshot, capability);
  const warnings = [...common.warnings];
  const actions = [...common.actions];
  if (reports.length === 0) {
    warnings.push("No loading evidence was observed for this remote; declaration alone is not treated as a successful load.");
    actions.push("Reopen or reproduce the page path that loads this remote, then run remote status again.");
  }
  if (declaredRemote === undefined) {
    warnings.push("The remote was not observed in the selected consumer declaration.");
  }
  if (relationships.length === 0) {
    warnings.push("No current consumer-to-producer loading relationship was observed.");
  } else if (relationships.length > 1) {
    warnings.push("More than one current loading relationship matches this remote.");
  }

  return {
    schemaVersion: 1,
    command: "mf remote status",
    capability,
    compatibility,
    consumer: {
      instanceRef: consumer.instanceRef,
      name: visibleInstanceName(consumer)
    },
    remote: {
      name: selectedRemote.name,
      ...(selectedRemote.alias === undefined ? {} : { alias: selectedRemote.alias }),
      declared: declaredRemote !== undefined,
      loaded: loadedRemote !== undefined ||
        relationship?.status === "resolved" ||
        successfulReports.length > 0,
      loadedExposes: Array.from(new Set(
        successfulReports
          .map((report) => report.expose)
          .filter((expose): expose is string => expose !== undefined)
          .map(normalizeExpose)
      )).sort(),
      relationship: relationships.length > 1
        ? "ambiguous"
        : relationship?.status ?? "unknown",
      ...(relationship?.producerInstanceRef === undefined
        ? {}
        : { producerInstanceRef: relationship.producerInstanceRef }),
      ...(relationship?.candidateProducerInstanceRefs === undefined
        ? {}
        : { candidateProducerInstanceRefs: relationship.candidateProducerInstanceRefs }),
      latestResult: !capability.available
        ? "unavailable"
        : latestReport === undefined
          ? "unknown"
          : reportOutcome(latestReport),
      ...(latestReport === undefined
        ? {}
        : { latestTraceId: latestReport.traceId })
    },
    ...(proxy === undefined ? {} : { proxy }),
    warnings: unique(warnings),
    recommendedActions: unique(actions)
  };
}

function createRemoteProxyStatus(
  snapshot: BrowserObservabilitySnapshot,
  remote: RuntimeRemote,
  reports: RuntimeReport[]
): RemoteProxyStatus | undefined {
  const marker = snapshot.proxy;
  if (marker === undefined) return undefined;
  const nameTarget = marker.overrides[remote.name];
  const aliasTarget = remote.alias === undefined
    ? undefined
    : marker.overrides[remote.alias];
  const matchedBy = nameTarget !== undefined
    ? "name"
    : aliasTarget !== undefined
      ? "alias"
      : undefined;
  const target = nameTarget ?? aliasTarget;
  if (matchedBy === undefined || target === undefined) return undefined;

  if (marker.status === "error") {
    return {
      target,
      matchedBy,
      applied: false,
      error: marker.message ?? "MF proxy setup failed before the page runtime started."
    };
  }

  const loadedFrom = isRemoteUrl(target)
    ? latestManifestResourceUrl(reports)
    : undefined;
  if (loadedFrom !== undefined) {
    return {
      target,
      matchedBy,
      applied: normalizeProxyTarget(loadedFrom) === normalizeProxyTarget(target),
      loadedFrom
    };
  }

  const current = isRemoteUrl(target) ? remote.entry : remote.version;
  return {
    target,
    matchedBy,
    applied: current === undefined
      ? "unknown"
      : normalizeProxyTarget(current) === normalizeProxyTarget(target)
  };
}

function latestManifestResourceUrl(
  reports: RuntimeReport[]
): string | undefined {
  for (const report of [...reports].reverse()) {
    for (const event of [...report.events].reverse()) {
      if (
        event.resource?.type === "manifest" &&
        event.resource.initiator === "loadRemote"
      ) {
        return event.resource.url ?? event.sanitizedUrl;
      }
    }
  }
  return undefined;
}

function isRemoteUrl(value: string): boolean {
  return /^(https?:)?\/\//i.test(value);
}

function normalizeProxyTarget(value: string): string {
  if (!isRemoteUrl(value)) return value;
  const queryIndex = value.indexOf("?");
  const hashIndex = value.indexOf("#");
  const end = [queryIndex, hashIndex]
    .filter((index) => index >= 0)
    .reduce((smallest, index) => Math.min(smallest, index), value.length);
  const withoutQuery = value.slice(0, end);
  try {
    const protocolRelative = withoutQuery.startsWith("//");
    const url = new URL(
      withoutQuery,
      protocolRelative ? "https://divebell.invalid" : undefined
    );
    url.username = "";
    url.password = "";
    return protocolRelative
      ? `//${url.host}${url.pathname}`
      : url.toString();
  } catch {
    return withoutQuery;
  }
}

export function buildRemoteTrace(
  report: RuntimeReport,
  kind: RemoteTraceKind,
  instanceName?: string
): RemoteTraceSummary {
  const events = kind === "load" ? loadEvents(report) : preloadEvents(report);
  const definitions = kind === "load" ? loadStages : preloadStages;
  const stages = definitions.map((definition) => {
    const matching = events.filter(definition.matches);
    const evidence = aggregateStage(
      matching,
      definition.name,
      definition.label,
      definition.useReportFallback === true ? report : undefined
    );
    if ((definition.name === "request" || definition.name === "preloadTarget") &&
        evidence.status === "pending" &&
        evidence.startedAt !== undefined && events.some((event) =>
          event.timestamp > (evidence.startedAt as number)
        )) {
      return {
        ...evidence,
        status: "success" as const,
        endedAt: evidence.startedAt,
        duration: 0
      };
    }
    return evidence;
  });
  const resources = stages.flatMap((item) => item.resources);
  const error = reportError(report);
  return {
    traceId: report.traceId,
    ...(report.requestId === undefined ? {} : { requestId: report.requestId }),
    instanceRef: reportInstanceRef(report) ?? "unknown",
    instanceName: instanceName ?? report.hostName ?? "unknown",
    kind,
    ...(report.remote === undefined ? {} : { remote: report.remote }),
    ...(report.expose === undefined ? {} : { expose: normalizeExpose(report.expose) }),
    outcome: reportOutcome(report),
    startedAt: report.startedAt,
    ...(report.status === "pending" ? {} : { endedAt: report.updatedAt }),
    duration: report.duration,
    cached: report.summary.flags.cached || resources.some((resource) =>
      resource.outcome === "cached"
    ),
    recovered: report.summary.flags.recovered || report.summary.recovered === true ||
      resources.some((resource) => resource.outcome === "recovered"),
    timeout: resources.some((resource) =>
      resource.outcome === "timeout" || /timeout/i.test(resource.errorType ?? "")
    ),
    stages,
    ...(error === undefined ? {} : { error })
  };
}

function matchingPreload(
  snapshot: BrowserObservabilitySnapshot,
  loadReport: RuntimeReport
): NonNullable<RemoteTraceSummary["preload"]> {
  const matches = snapshot.reports
    .filter((report) => isRemoteTraceReport(report, "preload"))
    .filter((report) => report.startedAt <= loadReport.startedAt)
    .filter((report) => reportsShareTarget(loadReport, report))
    .sort((left, right) =>
      right.startedAt - left.startedAt ||
      right.traceId.localeCompare(left.traceId)
    );
  const report = matches[0];
  if (report === undefined) return { status: "not-observed" };
  const trace = buildRemoteTrace(report, "preload");
  return {
    status: trace.outcome,
    traceId: trace.traceId,
    timing: trace.endedAt !== undefined &&
      trace.endedAt <= loadReport.startedAt
      ? "before-load"
      : "overlapping",
    startedAt: trace.startedAt,
    ...(trace.endedAt === undefined ? {} : { endedAt: trace.endedAt }),
    duration: trace.duration
  };
}

function reportsShareTarget(
  loadReport: RuntimeReport,
  preloadReport: RuntimeReport
): boolean {
  if (
    loadReport.remote === undefined ||
    preloadReport.remote === undefined ||
    !remotesMatch(loadReport.remote, preloadReport.remote)
  ) {
    return false;
  }
  const loadInstanceRef = reportInstanceRef(loadReport);
  const preloadInstanceRef = reportInstanceRef(preloadReport);
  if (
    loadInstanceRef !== undefined ||
    preloadInstanceRef !== undefined
  ) {
    if (loadInstanceRef !== preloadInstanceRef) return false;
  } else if (
    loadReport.hostName === undefined ||
    preloadReport.hostName === undefined ||
    loadReport.hostName !== preloadReport.hostName
  ) {
    return false;
  }
  return loadReport.expose === undefined ||
    preloadReport.expose === undefined ||
    normalizeExpose(loadReport.expose) ===
      normalizeExpose(preloadReport.expose);
}

export function remoteCapability(
  snapshot: BrowserObservabilitySnapshot
): RemoteCapabilitySummary {
  const capability = snapshot.state.capabilities.remoteTrace;
  const capturedBeforeRuntime = (snapshot.observabilityMode === "application" ||
    snapshot.injection === undefined ||
    snapshot.injection.timing === "before-runtime") &&
    snapshot.state.completeness.lateBoundInstanceRefs.length === 0;
  const unavailable = !capability.available || capability.completeness === "unavailable";
  const partial = !unavailable && (
    capability.completeness === "partial" ||
    snapshot.state.completeness.history === "partial" ||
    snapshot.state.completeness.historyCleared ||
    !capturedBeforeRuntime
  );
  return {
    status: unavailable ? "unavailable" : partial ? "partial" : "complete",
    available: !unavailable,
    ...(capability.reason === undefined ? {} : { reason: capability.reason }),
    history: snapshot.state.completeness.history,
    capturedBeforeRuntime
  };
}

function aggregateStage(
  rawEvents: RuntimeReportEvent[],
  name: RemoteStageEvidence["name"],
  label: string,
  report?: RuntimeReport
): RemoteStageEvidence {
  const events = [...rawEvents].sort((left, right) => left.timestamp - right.timestamp);
  const resources = mergeResources(events);
  const last = events.at(-1);
  const startTimes = events.flatMap((event) => [
    ...(event.status === "start" ? [event.timestamp] : []),
    ...(event.resource === undefined ? [] : [event.resource.startedAt])
  ]);
  const endTimes = events.flatMap((event) => [
    ...(event.status === "start" ? [] : [event.timestamp]),
    ...(event.resource?.endedAt === undefined ? [] : [event.resource.endedAt])
  ]);
  const startedAt = minimum(startTimes) ?? (events.length > 0 ? events[0]?.timestamp : undefined) ??
    report?.startedAt;
  const endedAt = maximum(endTimes) ?? (report?.status === "pending" ? undefined : report?.updatedAt);
  const startedBy = events.find((event) =>
    event.status === "start" && event.lifecycle !== undefined
  )?.lifecycle;
  const endedBy = [...events].reverse().find((event) =>
    event.status !== "start" && event.lifecycle !== undefined
  )?.lifecycle;
  const explicitDuration = [...events].reverse().find((event) =>
    event.duration !== undefined || event.resource?.duration !== undefined
  );
  const duration = explicitDuration?.duration ?? explicitDuration?.resource?.duration ??
    (startedAt !== undefined && endedAt !== undefined ? endedAt - startedAt : undefined);
  const status = stageStatus(last, report);
  const lastWithUrl = [...events].reverse().find((event) =>
    event.resource?.url !== undefined || event.sanitizedUrl !== undefined
  );
  const lastResource = resources.at(-1);
  const url = lastWithUrl?.resource?.url ?? lastWithUrl?.sanitizedUrl ?? lastResource?.url;
  const remote = [...events].reverse().find((event) => event.remote !== undefined)?.remote ??
    report?.remote;
  const expose = [...events].reverse().find((event) => event.expose !== undefined)?.expose ??
    report?.expose;
  const error = eventError([...events].reverse().find((event) =>
    event.status === "error" || event.errorMessage !== undefined
  )) ?? (report === undefined ? undefined : reportError(report));
  return {
    name,
    label,
    status,
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(startedBy === undefined ? {} : { startedBy }),
    ...(endedAt === undefined || status === "pending" ? {} : { endedAt }),
    ...(endedAt === undefined || status === "pending" || endedBy === undefined
      ? {}
      : { endedBy }),
    ...(duration === undefined ? {} : { duration }),
    ...(remote === undefined ? {} : { remote }),
    ...(expose === undefined ? {} : { expose: normalizeExpose(expose) }),
    ...(url === undefined ? {} : { url }),
    ...(lastResource?.httpStatus === undefined ? {} : { httpStatus: lastResource.httpStatus }),
    ...(lastResource?.mimeType === undefined ? {} : { mimeType: lastResource.mimeType }),
    ...(lastResource?.redirected === undefined ? {} : { redirected: lastResource.redirected }),
    cached: events.some((event) => event.cached === true) ||
      resources.some((resource) => resource.outcome === "cached") ||
      (report?.summary.flags.cached ?? false),
    recovered: events.some((event) => event.recovered === true) ||
      resources.some((resource) => resource.outcome === "recovered") ||
      (report?.summary.flags.recovered ?? false),
    timeout: resources.some((resource) =>
      resource.outcome === "timeout" || /timeout/i.test(resource.errorType ?? "")
    ),
    resources,
    ...(error === undefined ? {} : { error })
  };
}

function mergeResources(events: RuntimeReportEvent[]): RemoteResourceEvidence[] {
  const merged = new Map<string, RemoteResourceEvidence>();
  for (const event of events) {
    if (event.resource === undefined) continue;
    const resource = resourceEvidence(event.resource, eventError(event));
    const key = [
      resource.initiator,
      resource.type,
      resource.url ?? "",
      String(resource.startedAt)
    ].join("\u0000");
    const previous = merged.get(key);
    merged.set(key, {
      ...previous,
      ...resource,
      ...(previous?.error !== undefined && resource.error === undefined
        ? { error: previous.error }
        : {})
    });
  }
  return Array.from(merged.values()).sort((left, right) => left.startedAt - right.startedAt);
}

function resourceEvidence(
  resource: RuntimeResource,
  error: RemoteErrorEvidence | undefined
): RemoteResourceEvidence {
  return {
    type: resource.type,
    initiator: resource.initiator,
    ...(resource.outcome === undefined ? {} : { outcome: resource.outcome }),
    ...(resource.url === undefined ? {} : { url: resource.url }),
    startedAt: resource.startedAt,
    ...(resource.endedAt === undefined ? {} : { endedAt: resource.endedAt }),
    ...(resource.duration === undefined ? {} : { duration: resource.duration }),
    ...(resource.httpStatus === undefined ? {} : { httpStatus: resource.httpStatus }),
    ...(resource.mimeType === undefined ? {} : { mimeType: resource.mimeType }),
    ...(resource.redirected === undefined ? {} : { redirected: resource.redirected }),
    ...(resource.cacheSource === undefined ? {} : { cacheSource: resource.cacheSource }),
    ...(resource.errorType === undefined ? {} : { errorType: resource.errorType }),
    ...(error === undefined ? {} : { error })
  };
}

function loadEvents(report: RuntimeReport): RuntimeReportEvent[] {
  return report.events.filter((event) =>
    event.phase !== "preload" && event.resource?.initiator !== "preloadRemote"
  );
}

function preloadEvents(report: RuntimeReport): RuntimeReportEvent[] {
  return report.events.filter((event) =>
    event.resource?.initiator === "preloadRemote" ||
    (event.phase === "preload" && (
      event.lifecycle === "generatePreloadAssets" || event.lifecycle === "afterPreloadRemote"
    ))
  );
}

function stage(
  name: StageDefinition["name"],
  label: string,
  matches: StageDefinition["matches"]
): StageDefinition {
  return { name, label, matches };
}

function stageStatus(
  last: RuntimeReportEvent | undefined,
  report: RuntimeReport | undefined
): RemoteEvidenceStatus {
  if (report !== undefined) return reportOutcomeStatus(report);
  if (last !== undefined) {
    if (last.status === "start") return "pending";
    if (last.status === "error") return "error";
    return "success";
  }
  return "unknown";
}

function reportOutcomeStatus(report: RuntimeReport): RemoteEvidenceStatus {
  if (report.status === "pending") return "pending";
  if (report.status === "error") return "error";
  return "success";
}

function reportOutcome(report: RuntimeReport): Exclude<RemoteTraceOutcome, "unavailable"> {
  if (report.summary.flags.recovered || report.summary.recovered === true ||
      report.summary.outcome === "recovered") return "recovered";
  return reportOutcomeStatus(report);
}

function reportError(report: RuntimeReport): RemoteErrorEvidence | undefined {
  const summary = report.summary.error;
  const rawCode = summary?.errorCode ?? report.errorCode ?? report.diagnosis?.errorCode;
  const rawName = summary?.errorName ?? report.errorName ?? report.diagnosis?.errorName;
  const rawMessage = summary?.errorMessage ?? report.errorMessage ?? report.diagnosis?.errorMessage;
  const code = safeErrorText(rawCode);
  const name = safeErrorText(rawName);
  const message = safeErrorText(rawMessage);
  if (code === undefined && name === undefined && message === undefined) return undefined;
  return {
    ...(code === undefined ? {} : { code }),
    ...(name === undefined ? {} : { name }),
    ...(message === undefined ? {} : { message })
  };
}

function eventError(event: RuntimeReportEvent | undefined): RemoteErrorEvidence | undefined {
  if (event === undefined || (
    event.errorCode === undefined && event.errorName === undefined && event.errorMessage === undefined
  )) return undefined;
  return {
    ...(event.errorCode === undefined ? {} : { code: safeErrorText(event.errorCode) as string }),
    ...(event.errorName === undefined ? {} : { name: safeErrorText(event.errorName) as string }),
    ...(event.errorMessage === undefined ? {} : { message: safeErrorText(event.errorMessage) as string })
  };
}

const sensitivePairPattern =
  /\b(token|authorization|cookie|secret|password|session|access_token|refresh_token|api_key|apikey|key)\s*[:=]\s*([^&\s'",;<>]+)/gi;
const urlPattern = /https?:\/\/[^\s'"<>]+/g;

function safeErrorText(value: string | undefined, maxLength = 800): string | undefined {
  if (value === undefined) return undefined;
  const sanitized = value
    .replace(urlPattern, (url) => safeUrl(url))
    .replace(sensitivePairPattern, "[redacted]");
  return sanitized.length > maxLength ? `${sanitized.slice(0, maxLength)}...` : sanitized;
}

function safeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "[redacted-url]";
  }
}

function traceCollectionOutcome(
  traces: RemoteTraceSummary[],
  capability: RemoteCapabilitySummary
): RemoteTraceOutcome {
  if (!capability.available) return "unavailable";
  if (traces.length === 0) return "unknown";
  if (traces.length === 1) return (traces[0] as RemoteTraceSummary).outcome;
  if (traces.some((trace) => trace.outcome === "error")) return "error";
  if (traces.some((trace) => trace.outcome === "pending")) return "pending";
  if (traces.some((trace) => trace.outcome === "recovered")) return "recovered";
  if (traces.every((trace) => trace.outcome === "unknown")) return "unknown";
  return "success";
}

function remoteMessages(
  snapshot: BrowserObservabilitySnapshot,
  capability: RemoteCapabilitySummary
): { warnings: string[]; actions: string[] } {
  const warnings: string[] = [];
  const actions: string[] = [];
  if (!capability.available) {
    warnings.push(capability.reason ?? "Remote trace capability is unavailable for this page.");
    actions.push("Upgrade or configure the MF Observability Plugin so remoteTrace is available, then reopen the page.");
  } else if (capability.status === "partial") {
    if (capability.reason !== undefined) warnings.push(capability.reason);
    warnings.push("Remote history is partial; earlier loading stages may be missing.");
    actions.push(snapshot.state.completeness.recommendation ??
      "Reopen the page before reproducing the remote load to capture the complete history.");
  }
  if (!capability.capturedBeforeRuntime) {
    warnings.push("The reader observed one or more MF instances after they had already started.");
    actions.push("Reopen the page so observability starts before Module Federation loading.");
  }
  return { warnings: unique(warnings), actions: unique(actions) };
}

function compactSelection(selectors: RemoteTraceSelectors): RemoteTraceResult["selection"] {
  return {
    ...(selectors.target === undefined ? {} : { target: selectors.target }),
    ...(selectors.name === undefined ? {} : { name: selectors.name }),
    ...(selectors.instanceRef === undefined ? {} : { instanceRef: selectors.instanceRef }),
    ...(selectors.traceId === undefined ? {} : { traceId: selectors.traceId })
  };
}

function mergeRemote(
  target: RuntimeRemote,
  declared: RuntimeRemote | undefined,
  loaded: RuntimeRemote | undefined
): RuntimeRemote {
  return {
    ...target,
    ...declared,
    ...loaded,
    name: loaded?.name ?? declared?.name ?? target.name
  };
}

function minimum(values: number[]): number | undefined {
  return values.length === 0 ? undefined : Math.min(...values);
}

function maximum(values: number[]): number | undefined {
  return values.length === 0 ? undefined : Math.max(...values);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
