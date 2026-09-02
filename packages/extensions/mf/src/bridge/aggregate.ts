import { visibleInstanceName } from "../selection.js";
import type {
  BrowserObservabilitySnapshot,
  RuntimeBridgeInfo,
  RuntimeReport,
  RuntimeReportEvent
} from "../types.js";
import type {
  BridgeCurrentState,
  BridgeLifecycleEvidence,
  BridgeLifecycleSignal,
  BridgeOperationSideTrace,
  BridgeOperationTrace
} from "./types.js";

interface BridgeEvidenceGroup {
  operationId?: string;
  association: BridgeOperationTrace["association"];
  instanceRef?: string;
  instanceName: string;
  evidence: BridgeLifecycleEvidence[];
}

export function collectBridgeOperations(
  snapshot: BrowserObservabilitySnapshot
): BridgeOperationTrace[] {
  const instanceNames = new Map(
    snapshot.state.instances.map((instance) => [
      instance.instanceRef,
      visibleInstanceName(instance)
    ])
  );
  const groups = new Map<string, BridgeEvidenceGroup>();
  const seen = new Set<string>();

  for (const report of snapshot.reports) {
    for (const event of report.events) {
      if (event.bridge === undefined) continue;
      const evidence = eventEvidence(report, event);
      const fingerprint = evidenceFingerprint(evidence);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      addEvidence(groups, evidence, report, instanceNames);
    }
    if (
      report.bridge !== undefined &&
      !report.events.some((event) =>
        event.bridge !== undefined && sameBridgeRecord(event.bridge, report.bridge as RuntimeBridgeInfo)
      )
    ) {
      const evidence = reportEvidence(report);
      const fingerprint = evidenceFingerprint(evidence);
      if (!seen.has(fingerprint)) {
        seen.add(fingerprint);
        addEvidence(groups, evidence, report, instanceNames);
      }
    }
  }

  return Array.from(groups.values())
    .map(createOperationTrace)
    .sort((left, right) =>
      right.startedAt - left.startedAt ||
      (left.instance.instanceRef ?? "").localeCompare(right.instance.instanceRef ?? "") ||
      (left.operationId ?? left.bridgeId).localeCompare(right.operationId ?? right.bridgeId)
    );
}

export function listBridgeCurrentStates(
  snapshot: BrowserObservabilitySnapshot
): BridgeCurrentState[] {
  return snapshot.state.instances.flatMap((instance) => {
    const bridge = instance.bridge;
    if (bridge?.available !== true) return [];
    const instanceSummary = {
      instanceRef: instance.instanceRef,
      name: visibleInstanceName(instance)
    };
    if (bridge.states !== undefined && bridge.states.length > 0) {
      return bridge.states.map((state): BridgeCurrentState => ({
        instance: instanceSummary,
        summaryOnly: false,
        bridgeId: state.bridgeId,
        side: state.side,
        framework: state.framework,
        ...(state.moduleName === undefined ? {} : { moduleName: state.moduleName }),
        ...(state.remote === undefined ? {} : { remote: state.remote }),
        ...(state.expose === undefined ? {} : { expose: state.expose }),
        status: state.status,
        ...(state.lastOperation === undefined
          ? {}
          : { lastOperation: state.lastOperation }),
        ...(state.lastOperationId === undefined
          ? {}
          : { lastOperationId: state.lastOperationId }),
        ...(state.lastOperationAt === undefined
          ? {}
          : { lastOperationAt: state.lastOperationAt }),
        routeSyncObserved: state.routeSyncObserved
      }));
    }
    return [{
      instance: instanceSummary,
      summaryOnly: true,
      ...(bridge.framework === undefined ? {} : { framework: bridge.framework }),
      ...(bridge.moduleName === undefined ? {} : { moduleName: bridge.moduleName }),
      ...(bridge.remote === undefined ? {} : { remote: bridge.remote }),
      ...(bridge.expose === undefined ? {} : { expose: bridge.expose }),
      ...(bridge.status === undefined ? {} : { status: bridge.status }),
      ...(bridge.lastOperationAt === undefined
        ? {}
        : { lastOperationAt: bridge.lastOperationAt }),
      routeSyncObserved: bridge.routeSyncObserved === true
    }];
  });
}

function eventEvidence(
  report: RuntimeReport,
  event: RuntimeReportEvent
): BridgeLifecycleEvidence {
  const bridge = event.bridge as RuntimeBridgeInfo;
  const instanceRef = event.instanceRef ?? report.instanceRef;
  return {
    traceId: event.traceId ?? report.traceId,
    ...(instanceRef === undefined ? {} : { instanceRef }),
    timestamp: event.timestamp,
    phase: event.phase,
    status: event.status,
    ...(event.lifecycle === undefined ? {} : { lifecycle: event.lifecycle }),
    ...(event.message === undefined ? {} : { message: event.message }),
    signal: lifecycleSignal(event, bridge),
    bridge
  } as BridgeLifecycleEvidence;
}

function reportEvidence(report: RuntimeReport): BridgeLifecycleEvidence {
  const bridge = report.bridge as RuntimeBridgeInfo;
  return {
    traceId: report.traceId,
    ...(report.instanceRef === undefined ? {} : { instanceRef: report.instanceRef }),
    timestamp: bridge.endedAt ?? report.updatedAt,
    phase: "bridge-report",
    status: bridge.outcome === "error"
      ? "error"
      : bridge.outcome === "skipped"
        ? "complete"
        : "success",
    signal: bridge.endedAt !== undefined || bridge.outcome !== undefined
      ? "returned"
      : "observed",
    bridge
  };
}

function lifecycleSignal(
  event: RuntimeReportEvent,
  bridge: RuntimeBridgeInfo
): BridgeLifecycleSignal {
  if (event.lifecycle === "beforeBridgeOperation" || event.status === "start") {
    return "called";
  }
  if (event.lifecycle === "bridgeRenderInvoked") return "render-invoked";
  if (
    event.lifecycle === "afterBridgeOperation" ||
    bridge.endedAt !== undefined ||
    bridge.outcome !== undefined
  ) {
    return "returned";
  }
  return "observed";
}

function addEvidence(
  groups: Map<string, BridgeEvidenceGroup>,
  evidence: BridgeLifecycleEvidence,
  report: RuntimeReport,
  instanceNames: Map<string, string>
): void {
  const bridge = evidence.bridge;
  const instanceRef = evidence.instanceRef;
  const operationId = optionalOperationId(bridge);
  const association = instanceRef === undefined
    ? "incomplete"
    : operationId !== undefined
      ? "operation-id"
      : hasFallbackIdentity(bridge)
        ? "fallback"
        : "incomplete";
  const scope = instanceRef ?? `trace:${report.traceId}`;
  const key = operationId !== undefined
    ? `${scope}\u0000operation\u0000${operationId}`
    : hasFallbackIdentity(bridge)
      ? `${scope}\u0000fallback\u0000${report.traceId}\u0000${bridge.bridgeId}\u0000${bridge.side}\u0000${bridge.operation}\u0000${bridge.startedAt}`
      : `${scope}\u0000record\u0000${evidence.traceId}\u0000${evidence.timestamp}\u0000${groups.size}`;
  let group = groups.get(key);
  if (group === undefined) {
    group = {
      ...(operationId === undefined ? {} : { operationId }),
      association,
      ...(instanceRef === undefined ? {} : { instanceRef }),
      instanceName: instanceRef === undefined
        ? report.hostName ?? "unknown"
        : instanceNames.get(instanceRef) ?? report.hostName ?? "unknown",
      evidence: []
    };
    groups.set(key, group);
  }
  group.evidence.push(evidence);
}

function createOperationTrace(group: BridgeEvidenceGroup): BridgeOperationTrace {
  const evidence = [...group.evidence].sort((left, right) =>
    left.timestamp - right.timestamp || signalOrder(left.signal) - signalOrder(right.signal)
  );
  const sideGroups = new Map<string, BridgeLifecycleEvidence[]>();
  for (const item of evidence) {
    const bridge = item.bridge;
    const key = `${bridge.bridgeId}\u0000${bridge.side}\u0000${bridge.operation}`;
    const current = sideGroups.get(key) ?? [];
    current.push(item);
    sideGroups.set(key, current);
  }
  const sides = Array.from(sideGroups.values())
    .map(createSideTrace)
    .sort((left, right) =>
      sideOrder(left.side) - sideOrder(right.side) ||
      left.operation.localeCompare(right.operation) ||
      left.bridgeId.localeCompare(right.bridgeId)
    );
  const startedAt = Math.min(...sides.map((side) => side.startedAt));
  const allEnded = sides.every((side) => side.endedAt !== undefined);
  const endedAt = allEnded
    ? Math.max(...sides.map((side) => side.endedAt as number))
    : undefined;
  const outcomes = unique(sides.map((side) => side.outcome).filter(
    (outcome): outcome is NonNullable<BridgeOperationSideTrace["outcome"]> =>
      outcome !== undefined
  ));
  const outcome = !sides.every((side) =>
    side.returned && side.outcome !== undefined
  )
    ? "pending"
    : outcomes.length === 1
      ? outcomes[0] as NonNullable<BridgeOperationSideTrace["outcome"]>
      : "mixed";
  const bridgeIds = unique(sides.map((side) => side.bridgeId));
  const moduleName = lastDefined(evidence.map((item) => item.bridge.moduleName));
  const remote = lastDefined(evidence.map((item) => item.bridge.remote));
  const expose = lastDefined(evidence.map((item) => item.bridge.expose));
  return {
    instance: {
      ...(group.instanceRef === undefined ? {} : { instanceRef: group.instanceRef }),
      name: group.instanceName
    },
    ...(group.operationId === undefined ? {} : { operationId: group.operationId }),
    bridgeId: bridgeIds[0] ?? "unknown",
    bridgeIds,
    operations: unique(sides.map((side) => side.operation)),
    frameworks: unique(sides.map((side) => side.framework)),
    ...(moduleName === undefined ? {} : { moduleName }),
    ...(remote === undefined ? {} : { remote }),
    ...(expose === undefined ? {} : { expose }),
    startedAt,
    ...(endedAt === undefined ? {} : { endedAt, duration: Math.max(0, endedAt - startedAt) }),
    outcome,
    association: group.association,
    producerObserved: sides.some((side) => side.side === "producer"),
    called: sides.some((side) => side.called),
    returned: sides.some((side) => side.returned),
    routeSyncObserved: sides.some((side) => side.routeSyncObserved),
    applicationReadiness: "not-observed",
    sides
  };
}

function createSideTrace(evidence: BridgeLifecycleEvidence[]): BridgeOperationSideTrace {
  const bridges = evidence.map((item) => item.bridge);
  const first = bridges[0] as RuntimeBridgeInfo;
  const result = bridges.findLast((bridge) =>
    bridge.endedAt !== undefined || bridge.outcome !== undefined
  );
  const moduleName = lastDefined(bridges.map((bridge) => bridge.moduleName));
  const remote = lastDefined(bridges.map((bridge) => bridge.remote));
  const expose = lastDefined(bridges.map((bridge) => bridge.expose));
  const reason = lastDefined(bridges.map((bridge) => bridge.reason));
  const startedAt = Math.min(...bridges.map((bridge) => bridge.startedAt));
  const endedAt = result?.endedAt;
  return {
    side: first.side,
    framework: first.framework,
    operation: first.operation,
    bridgeId: first.bridgeId,
    ...(moduleName === undefined ? {} : { moduleName }),
    ...(remote === undefined ? {} : { remote }),
    ...(expose === undefined ? {} : { expose }),
    startedAt,
    ...(endedAt === undefined ? {} : { endedAt }),
    ...(result?.duration === undefined ? {} : { duration: result.duration }),
    ...(result?.outcome === undefined ? {} : { outcome: result.outcome }),
    ...(reason === undefined ? {} : { reason }),
    ...(result?.error === undefined ? {} : { error: result.error }),
    called: evidence.some((item) => item.signal === "called"),
    renderInvoked: evidence.some((item) => item.signal === "render-invoked"),
    returned: evidence.some((item) =>
      item.signal === "returned" ||
      item.bridge.endedAt !== undefined ||
      item.bridge.outcome !== undefined
    ),
    routeSyncObserved: first.operation === "route-sync",
    evidence
  };
}

function sameBridgeRecord(left: RuntimeBridgeInfo, right: RuntimeBridgeInfo): boolean {
  return optionalOperationId(left) === optionalOperationId(right) &&
    left.bridgeId === right.bridgeId &&
    left.side === right.side &&
    left.operation === right.operation &&
    left.startedAt === right.startedAt &&
    left.endedAt === right.endedAt &&
    left.outcome === right.outcome;
}

function optionalOperationId(bridge: RuntimeBridgeInfo): string | undefined {
  const value = (bridge as unknown as Record<string, unknown>).operationId;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function hasFallbackIdentity(bridge: RuntimeBridgeInfo): boolean {
  return bridge.bridgeId.length > 0 &&
    bridge.operation.length > 0 &&
    Number.isFinite(bridge.startedAt);
}

function evidenceFingerprint(evidence: BridgeLifecycleEvidence): string {
  const bridge = evidence.bridge;
  return [
    evidence.traceId,
    evidence.instanceRef ?? "",
    evidence.timestamp,
    evidence.phase,
    evidence.lifecycle ?? "",
    evidence.status,
    optionalOperationId(bridge) ?? "",
    bridge.bridgeId,
    bridge.side,
    bridge.operation,
    evidence.message ?? ""
  ].join("\u0000");
}

function signalOrder(signal: BridgeLifecycleSignal): number {
  return ["called", "render-invoked", "returned", "observed"].indexOf(signal);
}

function sideOrder(side: RuntimeBridgeInfo["side"]): number {
  return side === "consumer" ? 0 : 1;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function lastDefined<T>(values: Array<T | undefined>): T | undefined {
  return values.findLast((value): value is T => value !== undefined);
}
