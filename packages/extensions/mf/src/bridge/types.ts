import type {
  Capability,
  CompatibilitySummary,
  RuntimeBridgeInfo,
  RuntimeBridgeState
} from "../types.js";

export interface BridgeTraceSelectors {
  remote?: string;
  name?: string;
  instanceRef?: string;
  bridgeId?: string;
  operationId?: string;
}

export type BridgeLifecycleSignal =
  | "called"
  | "render-invoked"
  | "returned"
  | "observed";

export interface BridgeLifecycleEvidence {
  traceId: string;
  instanceRef?: string;
  timestamp: number;
  phase: string;
  status: "start" | "success" | "error" | "complete";
  lifecycle?: string;
  message?: string;
  signal: BridgeLifecycleSignal;
  bridge: RuntimeBridgeInfo;
}

export interface BridgeOperationSideTrace {
  side: RuntimeBridgeInfo["side"];
  framework: RuntimeBridgeInfo["framework"];
  operation: RuntimeBridgeInfo["operation"];
  bridgeId: string;
  moduleName?: string;
  remote?: string;
  expose?: string;
  startedAt: number;
  endedAt?: number;
  duration?: number;
  outcome?: RuntimeBridgeInfo["outcome"];
  reason?: string;
  error?: RuntimeBridgeInfo["error"];
  called: boolean;
  renderInvoked: boolean;
  returned: boolean;
  routeSyncObserved: boolean;
  evidence: BridgeLifecycleEvidence[];
}

export interface BridgeOperationTrace {
  instance: {
    instanceRef?: string;
    name: string;
  };
  operationId?: string;
  bridgeId: string;
  bridgeIds: string[];
  operations: RuntimeBridgeInfo["operation"][];
  frameworks: RuntimeBridgeInfo["framework"][];
  moduleName?: string;
  remote?: string;
  expose?: string;
  startedAt: number;
  endedAt?: number;
  duration?: number;
  outcome: RuntimeBridgeInfo["outcome"] | "mixed" | "pending";
  association: "operation-id" | "fallback" | "incomplete";
  producerObserved: boolean;
  called: boolean;
  returned: boolean;
  routeSyncObserved: boolean;
  applicationReadiness: "not-observed";
  sides: BridgeOperationSideTrace[];
}

export interface BridgeCurrentState {
  instance: {
    instanceRef: string;
    name: string;
  };
  summaryOnly: boolean;
  bridgeId?: string;
  side?: RuntimeBridgeState["side"];
  framework?: RuntimeBridgeState["framework"];
  moduleName?: string;
  remote?: string;
  expose?: string;
  status?: RuntimeBridgeState["status"];
  lastOperation?: RuntimeBridgeState["lastOperation"];
  lastOperationId?: string;
  lastOperationAt?: number;
  routeSyncObserved: boolean;
}

export interface BridgeOperationCandidate {
  instanceRef?: string;
  instanceName: string;
  bridgeId: string;
  operationId: string;
  side: RuntimeBridgeInfo["side"];
  operation: RuntimeBridgeInfo["operation"];
  remote?: string;
}

export interface BridgeInstanceCandidate {
  instanceRef: string;
  name: string;
}

export type BridgeTraceSelectionKind =
  | "summary"
  | "operation"
  | "candidates"
  | "not-found"
  | "unsupported";

export interface BridgeTraceResult {
  schemaVersion: 1;
  command: "mf bridge trace";
  compatibility: CompatibilitySummary;
  capability: Capability;
  selection: {
    kind: BridgeTraceSelectionKind;
    selectors: BridgeTraceSelectors;
    matchCount: number;
  };
  operations: BridgeOperationTrace[];
  currentStates: BridgeCurrentState[];
  candidates: BridgeOperationCandidate[];
  instanceCandidates: BridgeInstanceCandidate[];
  warnings: string[];
  recommendedActions: string[];
}

export interface PresentedBridgeOperationCandidate
  extends BridgeOperationCandidate {
  command: string;
}

export interface PresentedBridgeInstanceCandidate
  extends BridgeInstanceCandidate {
  command: string;
}

export type PresentedBridgeTraceResult = Omit<
  BridgeTraceResult,
  "candidates" | "instanceCandidates"
> & {
  candidates: PresentedBridgeOperationCandidate[];
  instanceCandidates: PresentedBridgeInstanceCandidate[];
};
