import type { RemoteTraceOutcome } from "../remote/types.js";
import type { RuntimeRemote } from "../types.js";

export type PageLcpStatus = "provisional" | "final" | "not-observed";

export interface ModulePerformancePageSnapshot {
  timeOrigin: number;
  url: string;
  document?: ModulePerformanceDocumentTiming;
  fp?: number;
  fcp?: number;
  lcp?: number;
  lcpStatus: PageLcpStatus;
}

export interface ModulePerformanceDocumentTiming {
  start: number;
  responseStart?: number;
  end: number;
  duration: number;
}

export type ModulePerformanceResourceDeclaration =
  | "script"
  | "preload"
  | "modulepreload";

export interface ModulePerformanceResourceSnapshot {
  url: string;
  initiatorType: string;
  declarations?: ModulePerformanceResourceDeclaration[];
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
  manifest?: ModulePerformanceInterval;
  remoteEntry?: ModulePerformanceRemoteEntryInterval;
  containerInit?: ModulePerformanceInterval;
  get?: ModulePerformanceInterval;
  factory?: ModulePerformanceInterval;
}

export type ModulePerformancePreloadInitiator =
  | "preloadRemote"
  | "link-preload"
  | "modulepreload";

export type ModulePerformancePreloadAssetRole =
  | "remoteEntry"
  | "expose-sync"
  | "expose-async"
  | "remote-js";

export interface ModulePerformancePreloadTiming {
  asset: string;
  role: ModulePerformancePreloadAssetRole;
  initiators: ModulePerformancePreloadInitiator[];
  start: number;
  end?: number;
  duration?: number;
  outcome?: "success" | "error" | "timeout" | "cached" | "recovered";
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
  preloadJs: ModulePerformancePreloadTiming[];
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
  page: Omit<ModulePerformancePageSnapshot, "timeOrigin" | "url"> & {
    clock?: {
      origin: "navigationStart";
      unit: "ms";
    };
    scripts?: ModulePerformanceResourceSnapshot[];
  };
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

export interface ModulePerformanceReportOperation {
  status: ModulePerformanceOperation["outcome"];
  timing: ModulePerformanceTiming;
  pageImpact: ModulePerformancePageImpact;
  remoteEntry?: ModulePerformanceManifest["remoteEntryResource"];
  exposeAssets: ModulePerformanceAssetTiming[];
  preloadJs: ModulePerformancePreloadTiming[];
  bottleneck: ModulePerformanceBottleneck;
  findings: ModulePerformanceFinding[];
}

export interface ModulePerformanceTimelineMarker {
  id: "fp" | "fcp" | "lcp";
  label: "FP" | "FCP" | "LCP";
  at: number;
  status?: PageLcpStatus;
}

export type ModulePerformanceTimelineStatus =
  | ModulePerformanceOperation["outcome"]
  | NonNullable<ModulePerformancePreloadTiming["outcome"]>;

export interface ModulePerformanceTimelinePoint {
  id: string;
  type: "point";
  label: string;
  at: number;
  source: "browser" | "module-federation";
  status?: ModulePerformanceTimelineStatus;
}

export interface ModulePerformanceTimelineSpan {
  id: string;
  type: "span";
  label: string;
  start: number;
  end?: number;
  duration?: number;
  source: "browser" | "module-federation";
  status?: ModulePerformanceTimelineStatus;
}

export type ModulePerformanceTimelineItem =
  | ModulePerformanceTimelinePoint
  | ModulePerformanceTimelineSpan;

export interface ModulePerformanceTimelineLane {
  id: string;
  kind: "page" | "page-script" | "mf-consumer" | "mf-provider" | "mf-preload";
  label: string;
  items: ModulePerformanceTimelineItem[];
}

export interface ModulePerformanceTimeline {
  schemaVersion: 1;
  clock: {
    origin: "navigationStart";
    unit: "ms";
  };
  markers: ModulePerformanceTimelineMarker[];
  lanes: ModulePerformanceTimelineLane[];
}

export interface ModulePerformanceReportRecommendation {
  id:
    | "preload-remote-entry"
    | "inspect-remote-entry-delivery"
    | "preload-expose-assets"
    | "inspect-get-runtime"
    | "profile-factory"
    | "code-usage";
  severity: ModulePerformanceFinding["severity"];
  title: string;
  target: {
    consumer: ModulePerformanceModule["consumer"];
    remote: ModulePerformanceModule["remote"];
    producer: ModulePerformanceModule["producer"];
    expose?: string;
  };
  evidence: string[];
  assets?: string[];
  reason: string;
  documentation?: string;
}

export interface ModulePerformanceReportModule {
  consumer: ModulePerformanceModule["consumer"];
  remote: ModulePerformanceModule["remote"];
  producer: ModulePerformanceModule["producer"];
  expose?: string;
  operations: ModulePerformanceReportOperation[];
}

export interface ModulePerformanceReport {
  schemaVersion: 1;
  command: "mf module-perf --report";
  report: {
    page: ModulePerformanceResult["page"];
    selection: ModulePerformanceResult["selection"];
    summary: ModulePerformanceResult["summary"];
    timeline?: ModulePerformanceTimeline;
    modules: ModulePerformanceReportModule[];
    unobservedRemotes: ModulePerformanceUnobservedRemote[];
    recommendations: ModulePerformanceReportRecommendation[];
  };
}

export interface ModulePerformanceSelectors {
  target?: string;
  name?: string;
  instanceRef?: string;
}
