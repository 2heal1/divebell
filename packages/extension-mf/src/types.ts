export type ObservabilityMode = "injected" | "application" | "unavailable";
export type InstanceRole = "consumer" | "producer" | "mixed" | "unknown";
export type RoleFilter = "consumer" | "producer";
export type Completeness = "complete" | "partial" | "unavailable";

export interface Capability {
  available: boolean;
  completeness: Completeness;
  reason?: string;
}

export interface RuntimeRemote {
  name: string;
  alias?: string;
  version?: string;
  entry?: string;
  entryGlobalName?: string;
  type?: string;
}

export interface SharedVersion {
  version: string;
  provider?: string;
  loaded?: boolean;
  singleton?: boolean;
  eager?: boolean;
  strategy?: string;
}

export interface SharedCandidate {
  scope: string;
  version: string;
  provider?: string;
  loaded: boolean;
  loading: boolean;
  singleton: boolean;
  eager: boolean;
  strategy?: string;
  compatible?: boolean;
  rejectionReason?: string;
}

export interface SharedRegistration {
  registrationId: string;
  action: "registered" | "replaced" | "reused" | "ignored";
  reason: string;
  trigger: string;
  scope: string;
  candidate: SharedCandidate;
  effective?: SharedCandidate;
}

export interface SharedConflict {
  reason: "singleton-multiple-versions";
  scope: string;
  currentVersion?: string;
  currentFrom?: string;
  versions: string[];
  existingVersions: Array<{
    version: string;
    from?: string;
    singleton?: boolean;
    loaded?: boolean;
  }>;
}

export interface RuntimeShared {
  name: string;
  shareScope?: string[];
  version?: string;
  requiredVersion?: string | false;
  selectedVersion?: string;
  availableVersions?: string[];
  provider?: string;
  useIn?: string[];
  singleton?: boolean;
  strictVersion?: boolean;
  eager?: boolean;
  strategy?: string;
  loaded?: boolean;
  loading?: boolean;
  reason?: string;
  definedBy?: "bundler-runtime";
  conflict?: SharedConflict;
  candidates?: SharedCandidate[];
  selectionReason?: string;
  failureReason?: string;
  loadType?: "sync" | "async";
  trigger?: string;
  moduleId?: string | number;
  chunkId?: string | number;
  remote?: string;
  expose?: string;
  requestId?: string;
  operationId?: string;
  fallback?: boolean;
  recovered?: boolean;
  registration?: SharedRegistration;
}

export interface BridgeRouteSummary {
  action: string;
  from?: string;
  to?: string;
  basename?: string;
  mechanism?: "popstate";
}

export interface RuntimeBridgeInfo {
  operationId: string;
  bridgeId: string;
  side: "consumer" | "producer";
  framework: "react" | "vue";
  operation: "render" | "update" | "destroy" | "route-sync";
  moduleName?: string;
  remote?: string;
  expose?: string;
  route?: BridgeRouteSummary;
  reason?: string;
  startedAt: number;
  endedAt?: number;
  duration?: number;
  outcome?: "success" | "error" | "skipped";
  error?: {
    name?: string;
    message?: string;
  };
}

export type BridgeStatus =
  | "idle"
  | "rendering"
  | "rendered"
  | "destroying"
  | "destroyed"
  | "error";

export interface RuntimeBridgeState {
  bridgeId: string;
  side: "consumer" | "producer";
  framework: "react" | "vue";
  moduleName?: string;
  remote?: string;
  expose?: string;
  status: BridgeStatus;
  lastOperation?: RuntimeBridgeInfo["operation"];
  lastOperationId?: string;
  lastOperationAt?: number;
  commitObserved: boolean;
  routeSyncObserved: boolean;
}

export interface ShareScope {
  name: string;
  sharedCount: number;
  sharedNames: string[];
  shared: Array<{
    name: string;
    versions: SharedVersion[];
  }>;
}

export interface RuntimeInstance {
  instanceRef: string;
  name?: string;
  optionsName?: string;
  optionsVersion?: string;
  runtimeVersion?: string;
  role: InstanceRole;
  roleEvidence: {
    consumer: string[];
    producer: string[];
  };
  remotes: RuntimeRemote[];
  loadedProducers: RuntimeRemote[];
  shareScopes: ShareScope[];
  bridge?: {
    available: boolean;
    lifecycleCount?: number;
    framework?: "react" | "vue";
    moduleName?: string;
    remote?: string;
    expose?: string;
    status?: BridgeStatus;
    lastOperationAt?: number;
    commitObserved?: boolean;
    routeSyncObserved?: boolean;
    states?: RuntimeBridgeState[];
  };
  active: boolean;
}

export interface RuntimeRelationship {
  consumerInstanceRef: string;
  producerInstanceRef?: string;
  candidateProducerInstanceRefs?: string[];
  remote: RuntimeRemote;
  evidence: string[];
  status: "resolved" | "ambiguous" | "unresolved";
}

export interface RuntimeModuleInfo {
  key: string;
  name?: string;
  version?: string;
  entry?: string;
  tag?: string;
  remotes?: RuntimeRemote[];
}

export type CapabilityName =
  | "instanceState"
  | "remoteTrace"
  | "sharedState"
  | "sharedTrace"
  | "bridgeTrace";

export interface RuntimeState {
  schemaVersion: 1;
  observedAt: number;
  scope: {
    name: string;
    realm: "current";
    frame?: string;
  };
  completeness: {
    currentState: "complete";
    history: "complete" | "partial";
    historyCleared: boolean;
    lateBoundInstanceRefs: string[];
    recommendation?: string;
  };
  capabilities: Record<CapabilityName, Capability>;
  instances: RuntimeInstance[];
  relationships: RuntimeRelationship[];
  moduleInfo: RuntimeModuleInfo[];
}

export interface ReportModuleInfoEntry {
  name: string;
  publicPath?: string;
  getPublicPath?: string;
  remoteEntry?: string;
  globalName?: string;
}

export interface RuntimeResource {
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
}

export interface RuntimeReportEvent {
  traceId?: string;
  instanceRef?: string;
  timestamp: number;
  phase: string;
  status: "start" | "success" | "error" | "complete";
  requestId?: string;
  requestAlias?: string;
  hostName?: string;
  runtimeVersion?: string;
  remote?: RuntimeRemote;
  resource?: RuntimeResource;
  shared?: RuntimeShared;
  expose?: string;
  sanitizedUrl?: string;
  message?: string;
  errorCode?: string;
  errorName?: string;
  errorMessage?: string;
  ownerHint?: "host" | "remote" | "shared" | "network" | "runtime" | "unknown";
  retryable?: boolean;
  duration?: number;
  lifecycle?: string;
  eventName?: string;
  source?: "runtime" | "business" | "react";
  recovered?: boolean;
  cached?: boolean;
  componentName?: string;
  bridge?: RuntimeBridgeInfo;
}

export interface RuntimeReport {
  traceId: string;
  instanceRef?: string;
  status: "pending" | "success" | "error";
  requestId?: string;
  requestAlias?: string;
  hostName?: string;
  runtimeVersion?: string;
  remote?: RuntimeRemote;
  shared?: RuntimeShared;
  expose?: string;
  sanitizedUrl?: string;
  startedAt: number;
  updatedAt: number;
  duration: number;
  failedPhase?: string;
  errorCode?: string;
  errorName?: string;
  errorMessage?: string;
  ownerHint?: RuntimeReportEvent["ownerHint"];
  retryable?: boolean;
  bridge?: RuntimeBridgeInfo;
  moduleInfo?: {
    reason: string;
    entries: ReportModuleInfoEntry[];
  };
  events: RuntimeReportEvent[];
  summary: {
    eventCount?: number;
    recovered?: boolean;
    loadCompleted?: boolean;
    runtimeLoaded?: boolean;
    sharedResolved?: boolean;
    sharedRegistered?: boolean;
    preloaded?: boolean;
    componentLoaded?: boolean;
    outcome?: string;
    lastPhase?: string;
    phases?: Record<string, {
      status: RuntimeReportEvent["status"];
      duration?: number;
      cached?: boolean;
      recovered?: boolean;
      lifecycle?: string;
    }>;
    shared?: {
      name: string;
      provider?: string;
      selectedVersion?: string;
      shareScope?: string[];
    };
    flags: {
      cached: boolean;
      fallback: boolean;
      recovered: boolean;
    };
    error?: {
      errorCode?: string;
      errorName?: string;
      errorMessage?: string;
      failedPhase?: string;
      lifecycle?: string;
      ownerHint?: RuntimeReportEvent["ownerHint"];
      retryable?: boolean;
    };
  };
  diagnosis?: {
    title?: string;
    outcome?: string;
    status?: "pending" | "success" | "error";
    ownerHint?: RuntimeReportEvent["ownerHint"];
    failedPhase?: string;
    errorCode?: string;
    errorName?: string;
    errorMessage?: string;
    warnings?: string[];
    actions: Array<{
      id?: string;
      ownerHint?: RuntimeReportEvent["ownerHint"];
      title: string;
      detail?: string;
    }>;
  };
}

export interface InjectionMarker {
  schemaVersion: 1;
  source: "openruntime/extension-mf";
  status: "installed" | "already-installed" | "error";
  scope: string;
  observabilityVersion: string;
  installedAt: number;
  timing: "before-runtime" | "late" | "unknown";
  message?: string;
}

export interface BrowserObservabilitySnapshot {
  observabilityMode: Exclude<ObservabilityMode, "unavailable">;
  observabilityVersion: string;
  selectedScope: string;
  availableScopes: string[];
  compatibleScopes: string[];
  injection?: InjectionMarker;
  state: RuntimeState;
  reports: RuntimeReport[];
}

export type BrowserReadResult =
  | {
      ok: true;
      snapshot: BrowserObservabilitySnapshot;
    }
  | {
      ok: false;
      reason: "unavailable" | "multiple-readers" | "incompatible" | "reader-error";
      message: string;
      availableScopes: string[];
      compatibleScopes: string[];
      injection?: InjectionMarker;
      details?: string[];
    };

export interface CompatibilitySummary {
  observabilityVersion: string;
  runtimeVersions: string[];
  observabilityMode: ObservabilityMode;
  scope: RuntimeState["scope"];
  capabilities: RuntimeState["capabilities"];
  completeness: RuntimeState["completeness"];
  warnings: string[];
  recommendedActions: string[];
}

export interface InstanceCandidate {
  instanceRef: string;
  name: string;
  version?: string;
  roles: InstanceRole[];
}

export interface StatusConsumer {
  instanceRef: string;
  name: string;
}

export interface StatusInstance {
  instanceRef: string;
  name: string;
  role: InstanceRole;
  consumers: StatusConsumer[];
  active: boolean;
}

export interface StatusSharedDependency {
  instanceRef: string;
  instanceName: string;
  scope: string;
  name: string;
  version: string;
  provider?: string;
  singleton?: boolean;
  eager?: boolean;
  strategy?: string;
}

export type MfIssueKind = "not_found" | "needs_input" | "runtime";

export type MfRecommendedAction =
  | {
      type: "inspect-status";
      role?: RoleFilter;
    }
  | {
      type: "select-instance";
      target: "status" | "module-info";
      instanceRef: string;
    }
  | {
      type: "select-remote";
      remote: string;
      instanceRef: string;
    }
  | {
      type: "reopen-page";
    }
  | {
      type: "configure-observability";
      capability?: CapabilityName;
    };

export interface StatusResult {
  instances: StatusInstance[];
  shared: StatusSharedDependency[];
}

export interface ModuleInfoResult {
  schemaVersion: 1;
  command: "mf module-info";
  compatibility: CompatibilitySummary;
  consumer: {
    instanceRef: string;
    name: string;
    version?: string;
  };
  remote: {
    name: string;
    alias?: string;
    status: "declared" | "loaded";
    producerInstanceRef?: string;
    candidateProducerInstanceRefs?: string[];
    manifestUrl?: string;
    snapshotSource: string;
    remoteEntryUrl?: string;
    globalName?: string;
    type?: string;
    publicPath?: string;
    getPublicPath?: string;
    exposes: string[];
    shared: ShareScope[];
    dependencyRemotes: RuntimeRemote[];
    cached: boolean | "unknown";
    firstLoadedAt?: number;
  };
  warnings: string[];
  recommendedActions: string[];
}

export interface SelectionIssue {
  code: string;
  kind: MfIssueKind;
  message: string;
  facts: Record<string, unknown>;
  candidates: InstanceCandidate[];
  recommendedActions: MfRecommendedAction[];
}
