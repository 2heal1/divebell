import type {
  BrowserObservabilitySnapshot,
  RuntimeInstance,
  RuntimeReport,
  RuntimeShared,
  SharedRegistration
} from "../types.js";
import {
  capabilityActions,
  capabilityWarnings,
  createSharedCapabilitySummary
} from "./capability.js";
import {
  matchingSharedInstances,
  selectSharedInstances,
  visibleMfName
} from "./selection.js";
import type {
  SharedTraceCandidate,
  SharedTraceOperation,
  SharedTraceResult,
  SharedTraceSelectors
} from "./types.js";

interface SharedSample {
  shared: RuntimeShared;
  timestamp: number;
  requestId?: string;
}

interface SharedOperationDraft {
  instanceRef: string;
  package: string;
  operationId?: string;
  reports: Map<string, RuntimeReport>;
  samples: SharedSample[];
}

export function createSharedTraceResult(
  snapshot: BrowserObservabilitySnapshot,
  selectors: SharedTraceSelectors
): SharedTraceResult {
  const capabilityInstances = matchingSharedInstances(snapshot.state.instances, selectors);
  const capability = createSharedCapabilitySummary(
    snapshot,
    "sharedTrace",
    capabilityInstances
  );
  const warnings = capabilityWarnings("shared trace", capability);
  const recommendedActions = capabilityActions("sharedTrace", capability);

  appendHistoryWarnings(snapshot, warnings, recommendedActions);
  if (!capability.available) {
    return {
      schemaVersion: 1,
      command: "mf shared trace",
      supported: false,
      capability,
      filters: { ...selectors },
      selection: { kind: "unsupported", matchCount: 0 },
      operations: [],
      candidates: [],
      warnings: unique(warnings),
      recommendedActions: unique(recommendedActions)
    };
  }

  const selectedInstances = selectSharedInstances(
    snapshot.state.instances,
    selectors,
    "mf shared trace",
    snapshot.state.relationships
  );

  const operations = groupSharedTraceOperations(snapshot, selectedInstances)
    .filter((operation) => selectors.package === undefined || operation.package === selectors.package)
    .filter((operation) => selectors.scope === undefined || operation.scopes.includes(selectors.scope))
    .filter((operation) => selectors.operationId === undefined || operation.operationId === selectors.operationId)
    .filter((operation) => selectors.traceId === undefined || operation.traceIds.includes(selectors.traceId));
  const kind = selectors.package === undefined
    ? "list"
    : operations.length === 0
      ? "not-found"
      : operations.length === 1
        ? "detail"
        : "ambiguous";
  const candidates = kind === "ambiguous"
    ? operations.map(sharedTraceCandidate)
    : [];
  if (kind === "not-found") {
    warnings.push("No shared registration, selection, or loading operation matches the supplied filters.");
  } else if (kind === "ambiguous") {
    warnings.push("More than one shared operation matches. Select one operation before interpreting a complete chain.");
  }

  return {
    schemaVersion: 1,
    command: "mf shared trace",
    supported: true,
    capability,
    filters: { ...selectors },
    selection: { kind, matchCount: operations.length },
    operations,
    candidates,
    warnings: unique(warnings),
    recommendedActions: unique(recommendedActions)
  };
}

export function groupSharedTraceOperations(
  snapshot: BrowserObservabilitySnapshot,
  instances: readonly RuntimeInstance[] = snapshot.state.instances
): SharedTraceOperation[] {
  const instanceByRef = new Map(instances.map((instance) => [instance.instanceRef, instance]));
  const allowedRefs = new Set(instanceByRef.keys());
  const drafts = new Map<string, SharedOperationDraft>();

  for (const report of snapshot.reports) {
    const eventSamples = report.events.flatMap((event) => event.shared === undefined
      ? []
      : [{
          shared: event.shared,
          timestamp: event.timestamp,
          requestId: event.requestId,
          instanceRef: event.instanceRef ?? report.instanceRef
        }]
    );
    const reportSamples = report.shared === undefined
      ? []
      : [{
          shared: report.shared,
          timestamp: report.updatedAt + 0.001,
          requestId: report.requestId,
          instanceRef: report.instanceRef
        }];
    for (const sample of [...eventSamples, ...reportSamples]) {
      const instanceRef = sample.instanceRef ?? "unknown";
      if (instanceRef !== "unknown" && !allowedRefs.has(instanceRef)) continue;
      if (instanceRef === "unknown" && instances.length !== snapshot.state.instances.length) continue;
      const operationId = sample.shared.operationId;
      const correlation = operationId === undefined
        ? `trace:${report.traceId || sample.requestId || "unknown"}`
        : `operation:${operationId}`;
      const key = `${instanceRef}\u0000${sample.shared.name}\u0000${correlation}`;
      const draft = drafts.get(key) ?? {
        instanceRef,
        package: sample.shared.name,
        ...(operationId === undefined ? {} : { operationId }),
        reports: new Map<string, RuntimeReport>(),
        samples: []
      };
      draft.reports.set(report.traceId, report);
      draft.samples.push({
        shared: sample.shared,
        timestamp: sample.timestamp,
        ...(sample.requestId === undefined ? {} : { requestId: sample.requestId })
      });
      drafts.set(key, draft);
    }
  }

  return Array.from(drafts.values())
    .map((draft) => finalizeOperation(draft, instanceByRef.get(draft.instanceRef)))
    .sort((left, right) =>
      left.startedAt - right.startedAt ||
      left.instanceRef.localeCompare(right.instanceRef) ||
      (left.operationId ?? left.traceIds[0] ?? "").localeCompare(
        right.operationId ?? right.traceIds[0] ?? ""
      )
    );
}

function finalizeOperation(
  draft: SharedOperationDraft,
  instance: RuntimeInstance | undefined
): SharedTraceOperation {
  const samples = [...draft.samples].sort((left, right) => left.timestamp - right.timestamp);
  const reports = Array.from(draft.reports.values()).sort(
    (left, right) => left.updatedAt - right.updatedAt
  );
  const finalReport = reports.at(-1) as RuntimeReport;
  const candidates = lastDefined(samples, (sample) => sample.shared.candidates) ?? [];
  const registrations = uniqueBy(
    samples.flatMap((sample) => sample.shared.registration === undefined
      ? []
      : [sample.shared.registration]
    ),
    registrationKey
  );
  const scopes = unique(samples.flatMap((sample) => [
    ...(sample.shared.shareScope ?? []),
    ...(sample.shared.candidates ?? []).map((candidate) => candidate.scope),
    ...(sample.shared.registration === undefined ? [] : [sample.shared.registration.scope])
  ]));
  const requestIds = unique([
    ...reports.flatMap((report) => report.requestId === undefined ? [] : [report.requestId]),
    ...samples.flatMap((sample) => [
      ...(sample.requestId === undefined ? [] : [sample.requestId]),
      ...(sample.shared.requestId === undefined ? [] : [sample.shared.requestId])
    ])
  ]);

  return {
    instanceRef: draft.instanceRef,
    mfName: instance === undefined ? finalReport.hostName ?? "unknown" : visibleMfName(instance),
    ...(instance?.runtimeVersion === undefined && finalReport.runtimeVersion === undefined
      ? {}
      : { runtimeVersion: instance?.runtimeVersion ?? finalReport.runtimeVersion }),
    package: draft.package,
    scopes: scopes.length === 0 ? ["unknown"] : scopes,
    ...(draft.operationId === undefined ? {} : { operationId: draft.operationId }),
    traceIds: reports.map((report) => report.traceId),
    requestIds,
    startedAt: Math.min(...reports.map((report) => report.startedAt)),
    updatedAt: Math.max(...reports.map((report) => report.updatedAt)),
    ...optionalValue("trigger", lastDefined(samples, (sample) => sample.shared.trigger)),
    ...optionalValue("requiredVersion", lastDefined(samples, (sample) => sample.shared.requiredVersion)),
    ...optionalValue("requestedVersion", lastDefined(samples, (sample) => sample.shared.version)),
    availableVersions: unique(samples.flatMap((sample) => [
      ...(sample.shared.availableVersions ?? []),
      ...(sample.shared.candidates ?? []).map((candidate) => candidate.version)
    ])),
    candidates: candidates.map((candidate) => ({ ...candidate })),
    ...optionalValue("selectedVersion", lastDefined(samples, (sample) => sample.shared.selectedVersion)),
    ...optionalValue("provider", lastDefined(samples, (sample) => sample.shared.provider)),
    ...optionalValue("selectionReason", lastDefined(samples, (sample) => sample.shared.selectionReason)),
    ...optionalValue("failureReason", lastDefined(samples, (sample) => sample.shared.failureReason)),
    ...optionalValue("singleton", lastDefined(samples, (sample) => sample.shared.singleton)),
    ...optionalValue("strictVersion", lastDefined(samples, (sample) => sample.shared.strictVersion)),
    ...optionalValue("eager", lastDefined(samples, (sample) => sample.shared.eager)),
    ...optionalValue("strategy", lastDefined(samples, (sample) => sample.shared.strategy)),
    registrations,
    ...optionalValue("remote", lastDefined(samples, (sample) => sample.shared.remote)),
    ...optionalValue("expose", lastDefined(samples, (sample) => sample.shared.expose)),
    fallback: samples.some((sample) => sample.shared.fallback === true) ||
      reports.some((report) => report.summary.flags.fallback),
    recovered: samples.some((sample) => sample.shared.recovered === true) ||
      reports.some((report) => report.summary.flags.recovered || report.summary.recovered === true),
    finalResult: {
      status: finalReport.status,
      ...optionalValue("outcome", finalReport.summary.outcome),
      ...optionalValue("reason", lastDefined(samples, (sample) => sample.shared.reason)),
      ...optionalValue("errorCode", finalReport.errorCode ?? finalReport.summary.error?.errorCode),
      ...optionalValue("errorName", finalReport.errorName ?? finalReport.summary.error?.errorName),
      ...optionalValue("errorMessage", finalReport.errorMessage ?? finalReport.summary.error?.errorMessage)
    }
  };
}

function sharedTraceCandidate(operation: SharedTraceOperation): SharedTraceCandidate {
  return {
    instanceRef: operation.instanceRef,
    mfName: operation.mfName,
    package: operation.package,
    scope: operation.scopes[0] ?? "unknown",
    operationId: operation.operationId ?? "unknown",
    traceId: operation.traceIds[0] ?? "unknown"
  };
}

function appendHistoryWarnings(
  snapshot: BrowserObservabilitySnapshot,
  warnings: string[],
  actions: string[]
): void {
  if (snapshot.state.completeness.history === "partial") {
    warnings.push(
      snapshot.state.completeness.recommendation === undefined
        ? "Shared history is partial, so the returned chains may be incomplete."
        : `Shared history is partial, so the returned chains may be incomplete: ${snapshot.state.completeness.recommendation}`
    );
    actions.push("Reopen the page before reproducing the shared load, then retry the command.");
  }
  if (snapshot.injection?.timing === "late") {
    warnings.push("The observability reader was injected after the MF runtime started, so earlier shared operations may be missing.");
    actions.push("Reopen the page, reproduce the operation, and retry.");
  }
}

function lastDefined<T>(
  samples: readonly SharedSample[],
  select: (sample: SharedSample) => T | undefined
): T | undefined {
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const value = select(samples[index] as SharedSample);
    if (value !== undefined) return value;
  }
  return undefined;
}

function optionalValue<Key extends string, Value>(
  key: Key,
  value: Value | undefined
): { [Property in Key]?: Value } {
  return value === undefined ? {} : { [key]: value } as { [Property in Key]?: Value };
}

function registrationKey(registration: SharedRegistration): string {
  return `${registration.registrationId}\u0000${registration.action}\u0000${registration.scope}`;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const valueKey = key(value);
    if (seen.has(valueKey)) return false;
    seen.add(valueKey);
    return true;
  });
}
