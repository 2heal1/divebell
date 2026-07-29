import type { CommandPresenter } from "../cli/presenter.js";
import type {
  BridgeCurrentState,
  BridgeOperationSideTrace,
  BridgeOperationTrace,
  BridgeTraceResult,
  PresentedBridgeTraceResult
} from "./types.js";

export function presentBridgeTraceResult(
  result: BridgeTraceResult,
  presenter: CommandPresenter
): PresentedBridgeTraceResult {
  return {
    ...result,
    candidates: result.candidates.map((candidate) => ({
      ...candidate,
      command: presenter.bridgeTrace({
        ...(candidate.remote === undefined ? {} : { remote: candidate.remote }),
        ...(candidate.instanceRef === undefined
          ? {}
          : { instanceRef: candidate.instanceRef }),
        bridgeId: candidate.bridgeId,
        operationId: candidate.operationId
      })
    })),
    instanceCandidates: result.instanceCandidates.map((candidate) => ({
      ...candidate,
      command: presenter.bridgeTrace({
        ...(result.selection.selectors.remote === undefined
          ? {}
          : { remote: result.selection.selectors.remote }),
        instanceRef: candidate.instanceRef,
        ...(result.selection.selectors.bridgeId === undefined
          ? {}
          : { bridgeId: result.selection.selectors.bridgeId }),
        ...(result.selection.selectors.operationId === undefined
          ? {}
          : { operationId: result.selection.selectors.operationId })
      })
    }))
  };
}

export function formatBridgeTrace(result: PresentedBridgeTraceResult): string {
  const capabilityReason = result.capability.reason === undefined
    ? ""
    : `: ${result.capability.reason}`;
  const lines = [
    "Module Federation Bridge trace",
    `Observability: ${result.compatibility.observabilityVersion} (${result.compatibility.observabilityMode})`,
    `Bridge trace: ${result.capability.completeness}${capabilityReason}`,
    `History: ${result.compatibility.completeness.history}`,
    `Selection: ${result.selection.kind}`,
    ""
  ];

  appendCurrentStates(lines, result.currentStates);
  appendOperations(lines, result.operations);
  appendCandidates(lines, result);
  appendWarnings(lines, result.warnings, result.recommendedActions);
  return `${lines.join("\n").trimEnd()}\n`;
}

function appendCurrentStates(lines: string[], states: BridgeCurrentState[]): void {
  if (states.length === 0) return;
  lines.push("Current Bridge state");
  for (const state of states) {
    lines.push(
      `  ${state.instance.name} (${state.instance.instanceRef})`,
      `    bridge: ${state.bridgeId ?? "unknown"}`,
      `    side / framework: ${state.side ?? "unknown"} / ${state.framework ?? "unknown"}`,
      `    remote / expose / module: ${state.remote ?? "unknown"} / ${state.expose ?? "unknown"} / ${state.moduleName ?? "unknown"}`,
      `    status: ${state.status ?? "unknown"}`,
      `    last operation: ${state.lastOperation ?? "unknown"} (${state.lastOperationId ?? "unknown"})`,
      `    last observed at: ${formatTime(state.lastOperationAt)}`,
      `    commit observed in current Bridge state: ${yesNo(state.commitObserved)}`,
      `    route sync observed in current Bridge state: ${yesNo(state.routeSyncObserved)}`
    );
  }
  lines.push("");
}

function appendOperations(lines: string[], operations: BridgeOperationTrace[]): void {
  if (operations.length === 0) return;
  lines.push("Bridge operations");
  for (const operation of operations) {
    lines.push(
      `  ${operation.operationId ?? "operationId unavailable"}  ${operation.instance.name} (${operation.instance.instanceRef ?? "unscoped"})`,
      `    bridge: ${operation.bridgeIds.join(", ")}`,
      `    operation: ${operation.operations.join(", ")}`,
      `    framework: ${operation.frameworks.join(", ")}`,
      `    remote / expose / module: ${operation.remote ?? "unknown"} / ${operation.expose ?? "unknown"} / ${operation.moduleName ?? "unknown"}`,
      `    association: ${operation.association}`,
      `    started: ${formatTime(operation.startedAt)}`,
      `    ended: ${formatTime(operation.endedAt)}`,
      `    duration: ${formatDuration(operation.duration)}`,
      `    outcome: ${operation.outcome}`,
      `    producer execution observed: ${yesNo(operation.producerObserved)}`,
      `    call observed: ${yesNo(operation.called)}`,
      `    return observed: ${yesNo(operation.returned)}`,
      `    commit observed for this operation: ${yesNo(operation.commitObserved)}`,
      `    route sync observed for this operation: ${yesNo(operation.routeSyncObserved)}`,
      "    application readiness: not observed by Bridge lifecycle evidence"
    );
    for (const side of operation.sides) appendSide(lines, side);
    lines.push("");
  }
}

function appendSide(lines: string[], side: BridgeOperationSideTrace): void {
  lines.push(
    `    ${side.side} / ${side.framework} / ${side.operation}`,
    `      bridge: ${side.bridgeId}`,
    `      called: ${yesNo(side.called)}`,
    `      render invoked: ${yesNo(side.renderInvoked)}`,
    `      returned: ${yesNo(side.returned)}`,
    `      commit observed: ${yesNo(side.commitObserved)}`,
    `      route sync observed: ${yesNo(side.routeSyncObserved)}`,
    `      started: ${formatTime(side.startedAt)}`,
    `      ended: ${formatTime(side.endedAt)}`,
    `      duration: ${formatDuration(side.duration)}`,
    `      outcome: ${side.outcome ?? "pending"}`
  );
  if (side.reason !== undefined) lines.push(`      reason: ${side.reason}`);
  if (side.error !== undefined) {
    lines.push(
      `      error: ${[side.error.name, side.error.message].filter(Boolean).join(": ") || "unknown"}`
    );
  }
  const routes = side.evidence
    .map((evidence) => evidence.bridge.route)
    .filter((route): route is NonNullable<typeof route> => route !== undefined);
  for (const route of uniqueJson(routes)) {
    lines.push(`      route: ${JSON.stringify(route)}`);
  }
}

function appendCandidates(
  lines: string[],
  result: PresentedBridgeTraceResult
): void {
  if (result.instanceCandidates.length > 0) {
    lines.push("MF instance candidates");
    for (const candidate of result.instanceCandidates) {
      lines.push(
        `  ${candidate.name} (${candidate.instanceRef})`,
        `    ${candidate.command}`
      );
    }
    lines.push("");
  }
  if (result.candidates.length > 0) {
    lines.push("Bridge operation candidates");
    for (const candidate of result.candidates) {
      lines.push(
        `  ${candidate.instanceName} (${candidate.instanceRef ?? "unscoped"})  ${candidate.bridgeId}  ${candidate.operationId}  ${candidate.side}  ${candidate.operation}`,
        `    ${candidate.command}`
      );
    }
    lines.push("");
  }
}

function appendWarnings(lines: string[], warnings: string[], actions: string[]): void {
  if (warnings.length > 0) {
    lines.push("Warnings", ...warnings.map((warning) => `  - ${warning}`), "");
  }
  if (actions.length > 0) {
    lines.push("Recommended actions", ...actions.map((action) => `  - ${action}`), "");
  }
}

function formatTime(value: number | undefined): string {
  return value === undefined ? "not observed" : new Date(value).toISOString();
}

function formatDuration(value: number | undefined): string {
  return value === undefined ? "not observed" : `${value} ms`;
}

function yesNo(value: boolean): "yes" | "no" {
  return value ? "yes" : "no";
}

function uniqueJson<T>(values: T[]): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = JSON.stringify(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
