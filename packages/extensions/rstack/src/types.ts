export type ObservationStatus = "ready" | "observing" | "completed" | "stale";

export type HmrOutcome =
  | "applied"
  | "failed"
  | "aborted"
  | "reloaded"
  | "no-update"
  | "incomplete"
  | "unknown";

export type ResultVerdict = "observed" | "passed" | "failed";

export interface SourceLocation {
  line: number;
  column: number;
}

export interface RuntimeOwnerEvidence {
  status: "resolved" | "unknown" | "ambiguous";
  kind: "host" | "remote" | "unknown";
  ownerId?: string;
  confidence: "high" | "medium" | "low";
  evidence: string[];
  candidates: string[];
}

export type RuntimeKind = "rspack-hmr" | "react-refresh";

export interface RuntimeCandidate<Kind extends RuntimeKind = RuntimeKind> {
  runtimeId: string;
  kind: Kind;
  profile: string;
  connectionGeneration: number;
  sessionId: string;
  documentGeneration: number;
  executionContextId?: number;
  scriptId: string;
  scriptInstanceKey: unknown;
  url: string;
  anchor: SourceLocation;
  owner: RuntimeOwnerEvidence;
}

export type HmrRuntimeCandidate = RuntimeCandidate<"rspack-hmr">;
export type ReactRefreshRuntimeCandidate = RuntimeCandidate<"react-refresh">;

export type ProbeEventKind =
  | "hmr.status"
  | "hmr.invalidate"
  | "hmr.abort-error"
  | "hmr.apply-error"
  | "refresh.boundary-refresh"
  | "refresh.boundary-invalidate"
  | "refresh.non-boundary-invalidate"
  | "refresh.completed"
  | "reload.requested";

export interface ProbePlan {
  runtimeId: string;
  runtimeKind: RuntimeKind;
  event: ProbeEventKind;
  profile: string;
  sessionId: string;
  scriptId: string;
  url: string;
  location: SourceLocation;
  expressions: string[];
  required: boolean;
}

export interface InstalledProbe extends ProbePlan {
  probeId: string;
  actualLocation?: SourceLocation;
}

export interface HmrExpectations {
  outcome?: "applied";
  refresh: boolean;
  noReload: boolean;
}

export type ReactDomBuildKind = "development" | "production" | "unknown";

export interface ReactDomBuildEvidence {
  status: "observed" | "not-observed" | "ambiguous";
  builds: ReactDomBuildKind[];
  scripts: Array<{
    scriptId: string;
    url: string;
    build: ReactDomBuildKind;
  }>;
}

export interface ReactRefreshHookEvidence {
  status: "installed" | "missing" | "unavailable";
  supportsFiber?: boolean;
  disabled?: boolean;
  rendererCount: number;
  reason?: string;
}

export interface ReactRefreshRendererEvidence {
  status:
    | "ready"
    | "react-dom-production"
    | "hook-missing"
    | "hook-incompatible"
    | "renderer-missing"
    | "renderer-incompatible"
    | "not-observed"
    | "ambiguous";
  renderers: Array<{
    id: string;
    packageName?: string;
    version?: string;
    build: ReactDomBuildKind;
    hasScheduleRefresh: boolean;
    hasSetRefreshHandler: boolean;
  }>;
  reason: string;
}

export interface ReactRefreshPreflight {
  reactDom: ReactDomBuildEvidence;
  globalHook: ReactRefreshHookEvidence;
  refreshRenderer: ReactRefreshRendererEvidence;
}

export interface StateCheckDefinition {
  checks: StateCheckItem[];
}

export interface StateCheckItem {
  name: string;
  selector: string;
  property?: string;
  attribute?: string;
}

export interface StateCheckValue {
  name: string;
  found: boolean;
  value?: unknown;
}

export interface NormalizedEvent {
  sequence: number;
  timestamp: number;
  type: ProbeEventKind | "document.invalidated" | "document.committed" | "evidence.gap";
  runtimeId?: string;
  probeId?: string;
  status?: string;
  moduleId?: string;
  error?: string;
  location?: SourceLocation;
}

export interface HmrCycle {
  cycleId: string;
  runtimeId: string;
  startedAtSequence: number;
  endedAtSequence?: number;
  statusPath: string[];
  outcome: HmrOutcome;
}

export interface SharedProviderEvidence {
  status: "observed" | "unavailable" | "not-observed" | "ambiguous";
  package: "react" | "react-dom";
  operations: Array<{
    instanceRef: string;
    mfName: string;
    scopes: string[];
    selectedVersion?: string;
    provider?: string;
    operationId?: string;
  }>;
  reason?: string;
}

export interface MfRuntimeEvidence {
  status: "observed" | "unavailable" | "not-observed" | "ambiguous";
  instances: Array<{
    instanceRef: string;
    name: string;
    role: string;
  }>;
  remoteEntries: Array<{
    consumerInstanceRef: string;
    remote: string;
    producerInstanceRef?: string;
    remoteEntryUrl?: string;
    publicPath?: string;
  }>;
  reason?: string;
}

export interface ObservationManifest {
  schemaVersion: 1;
  observationId: string;
  status: ObservationStatus;
  createdAt: string;
  updatedAt: string;
  pageUrl: string;
  connectionGeneration: number;
  sessionId: string;
  documentGeneration: number;
  enabledDebugger: boolean;
  readyAtSequence: number;
  latestSequence: number;
  hmrRuntimes: HmrRuntimeCandidate[];
  reactRefreshRuntimes: ReactRefreshRuntimeCandidate[];
  installedProbes: InstalledProbe[];
  events: NormalizedEvent[];
  expectations: HmrExpectations;
  reactRefreshPreflight?: ReactRefreshPreflight;
  consoleBaseline: unknown[];
  stateCheck?: StateCheckDefinition;
  beforeState?: StateCheckValue[];
  result?: HmrResult;
}

export interface HmrResult {
  schemaVersion: 1;
  observationId: string;
  status: ObservationStatus;
  verdict: ResultVerdict;
  outcome: HmrOutcome;
  errorCode?: string;
  capabilities: {
    rspackHmr: "observed" | "unsupported";
    reactRefreshRuntime: "observed" | "not-observed" | "unsupported";
    refreshRenderer: ReactRefreshRendererEvidence["status"];
    compileErrors: "console-fallback";
    moduleFederation: MfRuntimeEvidence["status"];
  };
  hmrRuntimes: HmrRuntimeCandidate[];
  reactRefreshRuntimes: ReactRefreshRuntimeCandidate[];
  cycles: HmrCycle[];
  pageReload: {
    status: "not-observed" | "same-document" | "requested" | "reloaded" | "unknown";
    requested: boolean;
    documentCommitted: boolean;
    settleWindowMs: number;
  };
  reactRefreshPreflight: ReactRefreshPreflight;
  refresh: {
    boundary: "refreshed" | "queued" | "invalidated" | "non-boundary" | "not-observed";
    completed: boolean;
    moduleIds: string[];
  };
  statePreservation: {
    status: "verified-preserved" | "verified-reset" | "not-verified";
    before?: StateCheckValue[];
    after?: StateCheckValue[];
  };
  shared: {
    runtime: MfRuntimeEvidence;
    react: SharedProviderEvidence;
    reactDom: SharedProviderEvidence;
  };
  gaps: Array<{
    kind: "buffer" | "transport";
    sequence?: number;
  }>;
  warnings: string[];
  recommendedActions: string[];
}
