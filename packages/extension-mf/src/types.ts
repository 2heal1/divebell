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

export interface RuntimeReport {
  traceId: string;
  instanceRef?: string;
  status: "pending" | "success" | "error";
  remote?: RuntimeRemote;
  expose?: string;
  sanitizedUrl?: string;
  startedAt: number;
  updatedAt: number;
  duration: number;
  moduleInfo?: {
    reason: string;
    entries: ReportModuleInfoEntry[];
  };
  events: Array<{
    phase: string;
    status: string;
    timestamp: number;
    sanitizedUrl?: string;
    message?: string;
    cached?: boolean;
  }>;
  summary: {
    flags: {
      cached: boolean;
      fallback: boolean;
      recovered: boolean;
    };
  };
  diagnosis?: {
    warnings?: string[];
    actions: Array<{
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
  command: string;
}

export interface StatusResult {
  schemaVersion: 1;
  command: "mf status";
  compatibility: CompatibilitySummary;
  selection: {
    kind: "list" | "detail";
    name?: string;
    role?: RoleFilter;
    instanceRef?: string;
  };
  instances: RuntimeInstance[];
  relationships: RuntimeRelationship[];
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
  message: string;
  hint: string;
  candidates: InstanceCandidate[];
}
