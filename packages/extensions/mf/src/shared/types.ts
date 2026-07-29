import type {
  Capability,
  GlobalSharedState,
  RuntimeReport,
  SharedCandidate,
  SharedRegistration
} from "../types.js";

export interface SharedInstanceSelectors {
  mf?: string;
  instanceRef?: string;
}

export interface SharedStatusSelectors {
  package?: string;
  scope?: string;
  version?: string;
}

export interface SharedStatusOptions {
  verbose?: boolean;
}

export interface SharedTraceSelectors extends SharedInstanceSelectors {
  package?: string;
  scope?: string;
  operationId?: string;
  traceId?: string;
}

export interface SharedCapabilitySummary extends Capability {
  runtimeVersions: string[];
  runtimeVersionKnown: boolean;
  minimumRuntimeVersion?: string;
}

export interface SharedStatusResult {
  shared: GlobalSharedState;
}

export interface SharedTraceFinalResult {
  status: RuntimeReport["status"];
  outcome?: string;
  reason?: string;
  errorCode?: string;
  errorName?: string;
  errorMessage?: string;
}

export interface SharedTraceOperation {
  instanceRef: string;
  mfName: string;
  runtimeVersion?: string;
  package: string;
  scopes: string[];
  operationId?: string;
  traceIds: string[];
  requestIds: string[];
  startedAt: number;
  updatedAt: number;
  trigger?: string;
  requiredVersion?: string | false;
  requestedVersion?: string;
  availableVersions: string[];
  candidates: SharedCandidate[];
  selectedVersion?: string;
  provider?: string;
  selectionReason?: string;
  failureReason?: string;
  singleton?: boolean;
  strictVersion?: boolean;
  eager?: boolean;
  strategy?: string;
  registrations: SharedRegistration[];
  remote?: string;
  expose?: string;
  fallback: boolean;
  recovered: boolean;
  finalResult: SharedTraceFinalResult;
}

export interface SharedTraceCandidate {
  instanceRef: string;
  mfName: string;
  package: string;
  scope: string;
  operationId: string;
  traceId: string;
}

export interface PresentedSharedTraceCandidate extends SharedTraceCandidate {
  command: string;
}

export type SharedTraceSelectionKind =
  | "unsupported"
  | "list"
  | "detail"
  | "ambiguous"
  | "not-found";

export interface SharedTraceResult {
  schemaVersion: 1;
  command: "mf shared trace";
  supported: boolean;
  capability: SharedCapabilitySummary;
  filters: SharedTraceSelectors;
  selection: {
    kind: SharedTraceSelectionKind;
    matchCount: number;
  };
  operations: SharedTraceOperation[];
  candidates: SharedTraceCandidate[];
  warnings: string[];
  recommendedActions: string[];
}

export interface PresentedSharedTraceResult extends Omit<SharedTraceResult, "candidates"> {
  candidates: PresentedSharedTraceCandidate[];
}
