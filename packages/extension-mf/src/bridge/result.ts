import { createCompatibilitySummary } from "../results.js";
import type { BrowserObservabilitySnapshot } from "../types.js";
import { collectBridgeOperations, listBridgeCurrentStates } from "./aggregate.js";
import { selectBridgeTrace } from "./selection.js";
import type {
  BridgeCurrentState,
  BridgeTraceResult,
  BridgeTraceSelectors
} from "./types.js";

export function createBridgeTraceResult(
  snapshot: BrowserObservabilitySnapshot,
  selectors: BridgeTraceSelectors = {}
): BridgeTraceResult {
  const capability = snapshot.state.capabilities.bridgeTrace;
  const currentStates = listBridgeCurrentStates(snapshot);
  const allOperations = collectBridgeOperations(snapshot);
  const selection = selectBridgeTrace(
    snapshot.state,
    allOperations,
    currentStates,
    selectors
  );
  const warnings = bridgeWarnings(
    snapshot,
    selection.currentStates,
    capability.available ? selection.operations : [],
    selection.kind
  );
  const recommendedActions = bridgeRecommendedActions(snapshot, selection.kind);

  return {
    schemaVersion: 1,
    command: "mf bridge trace",
    compatibility: createCompatibilitySummary(snapshot),
    capability,
    selection: {
      kind: capability.available ? selection.kind : "unsupported",
      selectors,
      matchCount: capability.available
        ? selection.operations.length || uniqueCandidateCount(selection.candidates)
        : 0
    },
    operations: capability.available ? selection.operations : [],
    currentStates: selection.currentStates,
    candidates: capability.available ? selection.candidates : [],
    instanceCandidates: selection.instanceCandidates,
    warnings,
    recommendedActions
  };
}

function bridgeWarnings(
  snapshot: BrowserObservabilitySnapshot,
  currentStates: BridgeCurrentState[],
  operations: BridgeTraceResult["operations"],
  selectionKind: BridgeTraceResult["selection"]["kind"]
): string[] {
  const capability = snapshot.state.capabilities.bridgeTrace;
  const warnings = [
    "Bridge lifecycle evidence does not establish page rendering, business-data readiness, or whether a user can interact with the application."
  ];
  if (!capability.available) {
    warnings.push(
      capability.reason ?? "Bridge lifecycle trace is unavailable from the current reader."
    );
    if (currentStates.length > 0) {
      warnings.push(
        "Current Bridge state is available, but historical lifecycle operations are unavailable."
      );
    }
  } else if (capability.completeness === "partial") {
    warnings.push(
      `Bridge lifecycle history is partial${capability.reason ? `: ${capability.reason}` : "."}`
    );
  }
  if (snapshot.state.completeness.history === "partial") {
    warnings.push("Earlier Bridge lifecycle operations may be missing from this result.");
  }
  if (snapshot.injection?.timing === "late") {
    warnings.push("The observer was installed after the MF runtime had already started.");
  }
  if (operations.some((operation) => operation.association !== "operation-id")) {
    warnings.push(
      "One or more records lack a reliable operationId association and remain independently marked as incomplete."
    );
  }
  if (
    operations.some((operation) => operation.routeSyncObserved) ||
    currentStates.some((current) => current.routeSyncObserved)
  ) {
    warnings.push(
      "Route values are already-sanitized summaries; a route-sync signal does not by itself confirm navigation completion."
    );
  }
  if (capability.available && selectionKind === "not-found") {
    warnings.push("No Bridge lifecycle operation matches the supplied selectors.");
  }
  if (selectionKind === "candidates") {
    warnings.push("More than one Bridge operation or MF instance matches the supplied selectors.");
  }
  return unique(warnings);
}

function bridgeRecommendedActions(
  snapshot: BrowserObservabilitySnapshot,
  selectionKind: BridgeTraceResult["selection"]["kind"]
): string[] {
  const actions: string[] = [];
  const capability = snapshot.state.capabilities.bridgeTrace;
  if (
    capability.completeness === "partial" ||
    snapshot.state.completeness.history === "partial" ||
    snapshot.injection?.timing === "late"
  ) {
    actions.push(
      snapshot.state.completeness.recommendation ??
      "Reopen the page with `openruntime open <url>`, reproduce the Bridge operation, and run the command again."
    );
  }
  if (!capability.available) {
    actions.push(
      "Use the capability reason above; if observation started late, reopen the page before reproducing the Bridge operation."
    );
  }
  if (selectionKind === "candidates") {
    actions.push("Choose an instanceRef and operationId from the candidates.");
  }
  return unique(actions);
}

function uniqueCandidateCount(candidates: BridgeTraceResult["candidates"]): number {
  return new Set(candidates.map((candidate) =>
    `${candidate.instanceRef ?? ""}\u0000${candidate.operationId}`
  )).size;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
