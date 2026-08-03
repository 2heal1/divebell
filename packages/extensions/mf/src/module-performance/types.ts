import type { RemoteTraceOutcome } from "../remote/types.js";
import type { RuntimeRemote } from "../types.js";

export type PageLcpStatus = "provisional" | "final" | "not-observed";

export interface ModulePerformancePageSnapshot {
  timeOrigin: number;
  url: string;
  fp?: number;
  fcp?: number;
  lcp?: number;
  lcpStatus: PageLcpStatus;
}

export interface ModulePerformanceResourceSnapshot {
  url: string;
  initiatorType: string;
  start: number;
  end: number;
  duration: number;
  transferSize?: number;
  encodedBodySize?: number;
  decodedBodySize?: number;
  cache?: "cache-or-service-worker" | "network" | "unknown";
}

export interface ModulePerformanceExposeAssetsSnapshot {
  key: string;
  name?: string;
  version?: string;
  publicPath?: string;
  remoteEntry?: string;
  expose: string;
  js: {
    sync: string[];
    async: string[];
  };
}

export interface ModulePerformanceBrowserSnapshot {
  schemaVersion: 1;
  installedAt: number;
  page: ModulePerformancePageSnapshot;
  resources: ModulePerformanceResourceSnapshot[];
  exposes: ModulePerformanceExposeAssetsSnapshot[];
}

export interface ModulePerformanceInterval {
  start: number;
  end?: number;
  duration?: number;
}

export interface ModulePerformanceRemoteEntryInterval
  extends ModulePerformanceInterval {
  blockingDuration?: number;
}

export interface ModulePerformanceTiming {
  loadRemote: ModulePerformanceInterval;
  remoteEntry?: ModulePerformanceRemoteEntryInterval;
  get?: ModulePerformanceInterval;
  factory?: ModulePerformanceInterval;
}

export interface ModulePerformanceAssetTiming {
  asset: string;
  kind: "sync" | "async";
  match: "matched" | "not-loaded" | "ambiguous";
  url?: string;
  start?: number;
  end?: number;
  duration?: number;
  loadedBeforeGet?: boolean;
  transferSize?: number;
  encodedBodySize?: number;
  decodedBodySize?: number;
  cache?: Exclude<ModulePerformanceResourceSnapshot["cache"], "unknown">;
  candidates?: string[];
}

export interface ModulePerformanceManifest {
  status: "available" | "unavailable" | "ambiguous";
  key?: string;
  publicPath?: string;
  remoteEntry?: string;
  remoteEntryResource?: Omit<ModulePerformanceAssetTiming, "kind">;
  assets: ModulePerformanceAssetTiming[];
}

export interface ModulePerformancePageDelta {
  startDelta: number;
  endDelta?: number;
}

export interface ModulePerformancePageImpact {
  fp?: ModulePerformancePageDelta;
  fcp?: ModulePerformancePageDelta;
  lcp?: ModulePerformancePageDelta;
}

export type ModulePerformanceBottleneckType =
  | "remoteEntry"
  | "expose-resource"
  | "get"
  | "factory"
  | "mixed"
  | "unknown";

export interface ModulePerformanceBottleneck {
  type: ModulePerformanceBottleneckType;
  duration?: number;
  percentage?: number;
  confidence: "high" | "medium" | "low";
  evidence: string[];
}

export interface ModulePerformanceFinding {
  id: string;
  severity: "info" | "warning";
  title: string;
  evidence: string[];
}

export interface ModulePerformanceCodeUsage {
  status: "recommended" | "not-applicable" | "unavailable";
  assets: string[];
  reason: string;
  documentation: string;
}

export interface ModulePerformanceOperation {
  traceId: string;
  outcome: Exclude<RemoteTraceOutcome, "unavailable">;
  timing: ModulePerformanceTiming;
  manifest: ModulePerformanceManifest;
  pageImpact: ModulePerformancePageImpact;
  bottleneck: ModulePerformanceBottleneck;
  findings: ModulePerformanceFinding[];
  codeUsage: ModulePerformanceCodeUsage;
}

export interface ModulePerformanceModule {
  consumer: {
    instanceRef: string;
    name: string;
  };
  producer: {
    instanceRef?: string;
    name: string;
    version?: string;
  };
  remote: RuntimeRemote;
  expose?: string;
  operations: ModulePerformanceOperation[];
}

export interface ModulePerformanceUnobservedRemote {
  consumer: {
    instanceRef: string;
    name: string;
  };
  remote: RuntimeRemote;
  reason: "no-load-evidence";
}

export interface ModulePerformanceResult {
  schemaVersion: 1;
  command: "mf module-perf";
  observedAt: number;
  page: Omit<ModulePerformancePageSnapshot, "timeOrigin" | "url">;
  selection: {
    target?: string;
    name?: string;
    instanceRef?: string;
  };
  summary: {
    moduleCount: number;
    operationCount: number;
    manifestModuleCount: number;
    unobservedRemoteCount: number;
  };
  modules: ModulePerformanceModule[];
  unobservedRemotes: ModulePerformanceUnobservedRemote[];
}

export interface ModulePerformanceSelectors {
  target?: string;
  name?: string;
  instanceRef?: string;
}
