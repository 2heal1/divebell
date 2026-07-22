import {
  remotesMatch,
  selectConsumer,
  visibleInstanceName
} from "../selection.js";
import type {
  BrowserObservabilitySnapshot,
  RuntimeInstance,
  RuntimeRemote,
  RuntimeReport,
  SelectionIssue
} from "../types.js";
import type {
  RemoteOperation,
  RemoteSelectionCandidate,
  RemoteSelectionIssue,
  RemoteSelectionResult,
  RemoteTarget,
  RemoteTraceKind,
  RemoteTraceSelectors
} from "./types.js";

export interface RemoteTraceSelection {
  consumer?: RuntimeInstance;
  target?: RemoteTarget;
  reports: RuntimeReport[];
}

export interface RemoteCheckSelection {
  consumer: RuntimeInstance;
  target: RemoteTarget;
  reports: RuntimeReport[];
}

export function selectRemoteTrace(
  snapshot: BrowserObservabilitySnapshot,
  kind: RemoteTraceKind,
  selectors: RemoteTraceSelectors
): RemoteSelectionResult<RemoteTraceSelection> {
  const operation = kind === "load" ? "trace" : "preload-trace";
  const reports = snapshot.reports.filter((report) => isRemoteTraceReport(report, kind));
  const consumerSelection = selectTraceConsumer(snapshot, reports, selectors, operation);
  if (!consumerSelection.ok) return consumerSelection;
  const consumer = consumerSelection.value;
  const consumerReports = consumer === undefined
    ? reports
    : reports.filter((report) => reportBelongsToConsumer(report, consumer));
  const targetSelection = selectors.target === undefined || consumer === undefined
    ? { ok: true as const, value: undefined }
    : resolveRemoteTarget(consumer, consumerReports, selectors.target, operation);
  if (!targetSelection.ok) return targetSelection;
  const target = targetSelection.value;
  const targetReports = target === undefined
    ? consumerReports
    : consumerReports.filter((report) => reportMatchesTarget(report, target));
  const traceReports = selectors.traceId === undefined
    ? targetReports
    : targetReports.filter((report) => report.traceId === selectors.traceId);

  if (selectors.traceId !== undefined && traceReports.length === 0) {
    return {
      ok: false,
      issue: traceNotFoundIssue(
        operation,
        selectors,
        targetReports.length > 0 ? targetReports : consumerReports,
        consumer
      )
    };
  }
  if (selectors.target !== undefined && selectors.traceId === undefined && traceReports.length > 1) {
    return {
      ok: false,
      issue: traceAmbiguousIssue(operation, selectors.target, traceReports, consumer)
    };
  }

  return {
    ok: true,
    value: {
      ...(consumer === undefined ? {} : { consumer }),
      ...(target === undefined ? {} : { target }),
      reports: sortReports(traceReports)
    }
  };
}

export function selectRemoteCheck(
  snapshot: BrowserObservabilitySnapshot,
  selectors: RemoteTraceSelectors
): RemoteSelectionResult<RemoteCheckSelection> {
  const reports = snapshot.reports.filter((report) => isRemoteTraceReport(report, "load"));
  const consumerSelection = selectTraceConsumer(
    snapshot,
    reports,
    selectors,
    "remote-check"
  );
  if (!consumerSelection.ok) return consumerSelection;
  const consumer = consumerSelection.value;
  if (consumer === undefined) {
    return {
      ok: false,
      issue: noConsumerIssue(snapshot.state.instances, selectors, "remote-check")
    };
  }
  const consumerReports = reports.filter((report) => reportBelongsToConsumer(report, consumer));
  const targetSelection = resolveRemoteTarget(
    consumer,
    consumerReports,
    selectors.target ?? "",
    "remote-check"
  );
  if (!targetSelection.ok) return targetSelection;
  const targetReports = consumerReports.filter((report) =>
    reportMatchesTarget(report, targetSelection.value)
  );
  return {
    ok: true,
    value: {
      consumer,
      target: targetSelection.value,
      reports: sortReports(targetReports)
    }
  };
}

export function isRemoteTraceReport(
  report: RuntimeReport,
  kind: RemoteTraceKind
): boolean {
  const resources = report.events
    .map((event) => event.resource)
    .filter((resource) => resource !== undefined);
  const hasPreload = resources.some((resource) => resource.initiator === "preloadRemote") ||
    report.summary.preloaded === true ||
    report.summary.outcome === "preloaded" ||
    report.events.some((event) =>
      event.phase === "preload" &&
      (event.lifecycle === "generatePreloadAssets" || event.lifecycle === "afterPreloadRemote")
    );
  const hasLoad = resources.some((resource) => resource.initiator === "loadRemote") ||
    report.events.some((event) => [
      "loadRemote",
      "matchRemote",
      "remoteEntryInit",
      "expose",
      "moduleFactory"
    ].includes(event.phase));
  if (kind === "preload") return hasPreload;
  return hasLoad || (report.remote !== undefined && !hasPreload);
}

export function reportInstanceRef(report: RuntimeReport): string | undefined {
  return report.instanceRef ?? report.events.find((event) =>
    event.instanceRef !== undefined
  )?.instanceRef;
}

export function normalizeExpose(value: string): string {
  const normalized = value.replace(/^\.\//, "").replace(/^\//, "");
  return `./${normalized}`;
}

function selectTraceConsumer(
  snapshot: BrowserObservabilitySnapshot,
  reports: RuntimeReport[],
  selectors: RemoteTraceSelectors,
  operation: RemoteOperation
): RemoteSelectionResult<RuntimeInstance | undefined> {
  if (selectors.instanceRef !== undefined || selectors.name !== undefined) {
    const selected = selectConsumer(snapshot.state, {
      ...(selectors.name === undefined ? {} : { name: selectors.name }),
      ...(selectors.instanceRef === undefined ? {} : { instanceRef: selectors.instanceRef })
    });
    return selected.ok
      ? { ok: true, value: selected.value }
      : { ok: false, issue: consumerIssue(selected.issue, selectors, operation) };
  }

  if (selectors.target === undefined && selectors.traceId === undefined) {
    return { ok: true, value: undefined };
  }

  const consumers = snapshot.state.instances.filter((instance) =>
    instance.role === "consumer" || instance.role === "mixed"
  );
  const traceRefs = selectors.traceId === undefined
    ? undefined
    : new Set(reports.filter((report) => report.traceId === selectors.traceId)
      .map(reportInstanceRef)
      .filter((value): value is string => value !== undefined));
  const matched = consumers.filter((consumer) => {
    if (traceRefs !== undefined) return traceRefs.has(consumer.instanceRef);
    if (selectors.target === undefined) return true;
    const consumerReports = reports.filter((report) => reportBelongsToConsumer(report, consumer));
    return resolveObservedRemoteTarget(consumer, consumerReports, selectors.target).length > 0;
  });

  if (matched.length === 1) return { ok: true, value: matched[0] as RuntimeInstance };
  if (matched.length === 0 && consumers.length === 1) {
    return { ok: true, value: consumers[0] as RuntimeInstance };
  }
  if (matched.length === 0) {
    return { ok: false, issue: noConsumerIssue(consumers, selectors, operation) };
  }
  return {
    ok: false,
    issue: {
      code: "MF_REMOTE_CONSUMER_AMBIGUOUS",
      kind: "needs_input",
      message: selectors.target === undefined
        ? "More than one consumer matches this trace."
        : `Remote selector ${selectors.target} is present in more than one consumer.`,
      hint: "Repeat the command with one of the candidate --instance values.",
      operation,
      ...(selectors.target === undefined ? {} : { target: selectors.target }),
      candidates: matched.map((consumer) => consumerCandidate(consumer, selectors.target))
    }
  };
}

function resolveRemoteTarget(
  consumer: RuntimeInstance,
  reports: RuntimeReport[],
  selector: string,
  operation: RemoteOperation
): RemoteSelectionResult<RemoteTarget> {
  const matches = resolveObservedRemoteTarget(consumer, reports, selector);
  if (matches.length === 1) return { ok: true, value: matches[0] as RemoteTarget };
  if (matches.length > 1) {
    return {
      ok: false,
      issue: {
        code: "MF_REMOTE_TARGET_AMBIGUOUS",
        kind: "needs_input",
        message: `Remote selector ${selector} matches more than one observed remote.`,
        hint: "Repeat the command with a full remote name or alias and --instance.",
        operation,
        target: selector,
        candidates: matches.map((match) => ({
          instanceRef: consumer.instanceRef,
          instanceName: visibleInstanceName(consumer),
          remote: match.remote.name,
          ...(match.expose === undefined ? {} : { expose: match.expose })
        }))
      }
    };
  }
  return {
    ok: true,
    value: {
      remote: { name: selector },
      selector,
      matchedBy: "unobserved"
    }
  };
}

function resolveObservedRemoteTarget(
  consumer: RuntimeInstance,
  reports: RuntimeReport[],
  selector: string
): RemoteTarget[] {
  const remotes = observedRemotes(consumer, reports);
  const exact = remotes.filter((remote) => remote.name === selector || remote.alias === selector);
  if (exact.length > 0) {
    return exact.map((remote) => ({
      remote,
      selector,
      matchedBy: remote.name === selector ? "name" : "alias"
    }));
  }

  const prefixMatches = remotes.flatMap((remote) => [
    { key: remote.name, matchedBy: "name" as const, remote },
    ...(remote.alias === undefined
      ? []
      : [{ key: remote.alias, matchedBy: "alias" as const, remote }])
  ]).filter((candidate) => selector.startsWith(`${candidate.key}/`));
  if (prefixMatches.length === 0) return [];
  const longest = Math.max(...prefixMatches.map((candidate) => candidate.key.length));
  return prefixMatches.filter((candidate) => candidate.key.length === longest).map((candidate) => ({
    remote: candidate.remote,
    expose: normalizeExpose(selector.slice(candidate.key.length + 1)),
    selector,
    matchedBy: candidate.matchedBy
  }));
}

function observedRemotes(
  consumer: RuntimeInstance,
  reports: RuntimeReport[]
): RuntimeRemote[] {
  const result: RuntimeRemote[] = [];
  for (const remote of [
    ...consumer.remotes,
    ...consumer.loadedProducers,
    ...reports.map((report) => report.remote).filter((remote) => remote !== undefined)
  ]) {
    const existingIndex = result.findIndex((candidate) => remotesMatch(candidate, remote));
    if (existingIndex === -1) {
      result.push(remote);
    } else {
      result[existingIndex] = {
        ...(result[existingIndex] as RuntimeRemote),
        ...remote
      };
    }
  }
  return result;
}

function reportMatchesTarget(report: RuntimeReport, target: RemoteTarget): boolean {
  if (report.remote === undefined || !remotesMatch(report.remote, target.remote)) return false;
  return target.expose === undefined ||
    (report.expose !== undefined && normalizeExpose(report.expose) === target.expose);
}

function reportBelongsToConsumer(
  report: RuntimeReport,
  consumer: RuntimeInstance
): boolean {
  const instanceRef = reportInstanceRef(report);
  if (instanceRef !== undefined) return instanceRef === consumer.instanceRef;
  return report.hostName !== undefined && report.hostName === visibleInstanceName(consumer);
}

function consumerIssue(
  issue: SelectionIssue,
  selectors: RemoteTraceSelectors,
  operation: RemoteOperation
): RemoteSelectionIssue {
  return {
    code: issue.code,
    kind: issue.kind,
    message: issue.message,
    hint: issue.kind === "needs_input"
      ? "Repeat the command with one of the candidate --instance values."
      : "Inspect the current consumer instances and choose an active instance reference.",
    operation,
    ...(selectors.target === undefined ? {} : { target: selectors.target }),
    candidates: issue.candidates.map((candidate) => ({
      instanceRef: candidate.instanceRef,
      instanceName: candidate.name,
      ...(selectors.target === undefined ? {} : { remote: selectors.target })
    }))
  };
}

function noConsumerIssue(
  instances: RuntimeInstance[],
  selectors: RemoteTraceSelectors,
  operation: RemoteOperation
): RemoteSelectionIssue {
  return {
    code: "MF_REMOTE_CONSUMER_NOT_FOUND",
    kind: "not_found",
    message: "No consumer can be selected from the current page evidence.",
    hint: "Inspect the current consumer instances, then reopen or reproduce the page if the consumer is missing.",
    operation,
    ...(selectors.target === undefined ? {} : { target: selectors.target }),
    candidates: instances
      .filter((instance) => instance.role === "consumer" || instance.role === "mixed")
      .map((instance) => consumerCandidate(instance, selectors.target))
  };
}

function traceNotFoundIssue(
  operation: RemoteOperation,
  selectors: RemoteTraceSelectors,
  reports: RuntimeReport[],
  consumer: RuntimeInstance | undefined
): RemoteSelectionIssue {
  return {
    code: "MF_REMOTE_TRACE_NOT_FOUND",
    kind: "not_found",
    message: `Trace ${selectors.traceId} is not present in the selected remote evidence.`,
    hint: "Choose one of the observed trace ids, or reopen the page and reproduce the loading path.",
    operation,
    ...(selectors.target === undefined ? {} : { target: selectors.target }),
    candidates: reports.map((report) => reportCandidate(report, consumer)).slice(0, 50)
  };
}

function traceAmbiguousIssue(
  operation: RemoteOperation,
  target: string,
  reports: RuntimeReport[],
  consumer: RuntimeInstance | undefined
): RemoteSelectionIssue {
  return {
    code: "MF_REMOTE_TRACE_AMBIGUOUS",
    kind: "needs_input",
    message: `More than one loading trace matches ${target}.`,
    hint: "Repeat the command with one of the candidate --trace-id values.",
    operation,
    target,
    candidates: reports.map((report) => reportCandidate(report, consumer))
  };
}

function consumerCandidate(
  consumer: RuntimeInstance,
  remote: string | undefined
): RemoteSelectionCandidate {
  return {
    instanceRef: consumer.instanceRef,
    instanceName: visibleInstanceName(consumer),
    ...(remote === undefined ? {} : { remote })
  };
}

function reportCandidate(
  report: RuntimeReport,
  consumer: RuntimeInstance | undefined
): RemoteSelectionCandidate {
  return {
    instanceRef: reportInstanceRef(report) ?? consumer?.instanceRef ?? "unknown",
    instanceName: consumer === undefined ? report.hostName ?? "unknown" : visibleInstanceName(consumer),
    ...(report.remote === undefined ? {} : { remote: report.remote.alias ?? report.remote.name }),
    ...(report.expose === undefined ? {} : { expose: normalizeExpose(report.expose) }),
    traceId: report.traceId,
    ...(report.requestId === undefined ? {} : { requestId: report.requestId })
  };
}

function sortReports(reports: RuntimeReport[]): RuntimeReport[] {
  return [...reports].sort((left, right) =>
    left.startedAt - right.startedAt || left.traceId.localeCompare(right.traceId)
  );
}
