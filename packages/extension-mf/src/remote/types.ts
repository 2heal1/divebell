import type {
  CompatibilitySummary,
  Completeness,
  MfIssueKind,
  RuntimeRemote
} from "../types.js";

export type RemoteOperation = "trace" | "remote-check" | "preload-trace";
export type RemoteTraceKind = "load" | "preload";
export type RemoteEvidenceStatus = "success" | "error" | "pending" | "unknown";
export type RemoteTraceOutcome = RemoteEvidenceStatus | "recovered" | "unavailable";

export interface RemoteTraceSelectors {
  target?: string;
  name?: string;
  instanceRef?: string;
  traceId?: string;
}

export interface RemoteTarget {
  remote: RuntimeRemote;
  expose?: string;
  selector: string;
  matchedBy: "name" | "alias" | "unobserved";
}

export interface RemoteSelectionCandidate {
  instanceRef: string;
  instanceName: string;
  remote?: string;
  expose?: string;
  traceId?: string;
  requestId?: string;
}

export interface RemoteSelectionIssue {
  code: string;
  kind: MfIssueKind;
  message: string;
  hint: string;
  operation: RemoteOperation;
  target?: string;
  candidates: RemoteSelectionCandidate[];
}

export type RemoteSelectionResult<T> =
  | { ok: true; value: T }
  | { ok: false; issue: RemoteSelectionIssue };

export interface RemoteCapabilitySummary {
  status: Completeness;
  available: boolean;
  reason?: string;
  history: "complete" | "partial";
  capturedBeforeRuntime: boolean;
}

export interface RemoteErrorEvidence {
  code?: string;
  name?: string;
  message?: string;
}

export interface RemoteResourceEvidence {
  type: string;
  initiator: "loadRemote" | "preloadRemote";
  outcome?: "success" | "error" | "timeout" | "cached" | "recovered";
  url?: string;
  startedAt: number;
  endedAt?: number;
  duration?: number;
  httpStatus?: number;
  mimeType?: string;
  redirected?: boolean;
  cacheSource?: string;
  errorType?: string;
  error?: RemoteErrorEvidence;
}

export type RemoteLoadStageName =
  | "request"
  | "matchRemote"
  | "manifest"
  | "remoteEntry"
  | "containerInit"
  | "expose"
  | "factory"
  | "result";

export type RemotePreloadStageName =
  | "preloadTarget"
  | "manifest"
  | "resources"
  | "result";

export interface RemoteStageEvidence {
  name: RemoteLoadStageName | RemotePreloadStageName;
  label: string;
  status: RemoteEvidenceStatus;
  startedAt?: number;
  startedBy?: string;
  endedAt?: number;
  endedBy?: string;
  duration?: number;
  remote?: RuntimeRemote;
  expose?: string;
  url?: string;
  httpStatus?: number;
  mimeType?: string;
  redirected?: boolean;
  cached: boolean;
  recovered: boolean;
  timeout: boolean;
  resources: RemoteResourceEvidence[];
  error?: RemoteErrorEvidence;
}

export interface RemoteTraceSummary {
  traceId: string;
  requestId?: string;
  instanceRef: string;
  instanceName: string;
  kind: RemoteTraceKind;
  remote?: RuntimeRemote;
  expose?: string;
  outcome: Exclude<RemoteTraceOutcome, "unavailable">;
  startedAt: number;
  endedAt?: number;
  duration: number;
  cached: boolean;
  recovered: boolean;
  timeout: boolean;
  stages: RemoteStageEvidence[];
  preload?: {
    status:
      | Exclude<RemoteTraceOutcome, "unavailable">
      | "not-observed";
    traceId?: string;
    timing?: "before-load" | "overlapping";
    startedAt?: number;
    endedAt?: number;
    duration?: number;
  };
  error?: RemoteErrorEvidence;
}

export interface RemoteTraceResult {
  schemaVersion: 1;
  command: "mf trace" | "mf preload trace";
  capability: RemoteCapabilitySummary;
  compatibility: CompatibilitySummary;
  selection: {
    target?: string;
    name?: string;
    instanceRef?: string;
    traceId?: string;
  };
  outcome: RemoteTraceOutcome;
  traces: RemoteTraceSummary[];
  warnings: string[];
  recommendedActions: string[];
}

export interface RemoteCheckResourceSummary {
  manifest: RemoteStageEvidence;
  remoteEntry: RemoteStageEvidence;
  observed: RemoteResourceEvidence[];
}

export interface RemoteExposeCheck {
  name: string;
  status: RemoteEvidenceStatus;
  traceIds: string[];
}

export interface RemoteCheckResult {
  schemaVersion: 1;
  command: "mf remote check";
  capability: RemoteCapabilitySummary;
  compatibility: CompatibilitySummary;
  consumer: {
    instanceRef: string;
    name: string;
    version?: string;
  };
  remote: {
    name: string;
    alias?: string;
    declared: boolean;
    relationship: "resolved" | "ambiguous" | "unresolved" | "unknown";
    producerInstanceRef?: string;
    candidateProducerInstanceRefs?: string[];
    traceIds: string[];
    outcome: RemoteTraceOutcome;
    resources: RemoteCheckResourceSummary;
    containerInit: RemoteStageEvidence;
    exposes: RemoteExposeCheck[];
    cached: boolean;
    recovered: boolean;
    timeout: boolean;
  };
  warnings: string[];
  recommendedActions: string[];
}
