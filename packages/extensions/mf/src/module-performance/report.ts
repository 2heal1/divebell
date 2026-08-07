import type {
  ModulePerformanceReport,
  ModulePerformanceReportModule,
  ModulePerformanceReportRecommendation,
  ModulePerformanceResult
} from "./types.js";

export function createModulePerformanceReport(
  result: ModulePerformanceResult
): ModulePerformanceReport {
  return {
    schemaVersion: 1,
    command: "mf module-perf --report",
    report: {
      page: result.page,
      selection: result.selection,
      summary: result.summary,
      modules: result.modules.map(createReportModule),
      unobservedRemotes: result.unobservedRemotes,
      recommendations: createRecommendations(result)
    }
  };
}

function createReportModule(
  module: ModulePerformanceResult["modules"][number]
): ModulePerformanceReportModule {
  return {
    consumer: module.consumer,
    remote: module.remote,
    producer: module.producer,
    ...(module.expose === undefined ? {} : { expose: module.expose }),
    operations: module.operations.map((operation) => ({
      status: operation.outcome,
      timing: operation.timing,
      pageImpact: operation.pageImpact,
      ...(operation.manifest.remoteEntryResource === undefined
        ? {}
        : { remoteEntry: operation.manifest.remoteEntryResource }),
      exposeAssets: operation.manifest.assets,
      bottleneck: operation.bottleneck,
      findings: operation.findings.filter((finding) =>
        finding.id !== "inspect-expose-code-usage"
      )
    }))
  };
}

function createRecommendations(
  result: ModulePerformanceResult
): ModulePerformanceReportRecommendation[] {
  return result.modules.flatMap((module) => module.operations.flatMap((operation) => [
    ...operation.findings.flatMap((finding) =>
      recommendationForFinding(module, finding)
    ),
    ...codeUsageRecommendation(module, operation)
  ]));
}

function recommendationForFinding(
  module: ModulePerformanceResult["modules"][number],
  finding: ModulePerformanceResult["modules"][number]["operations"][number]["findings"][number]
): ModulePerformanceReportRecommendation[] {
  const reasons: Partial<Record<ModulePerformanceReportRecommendation["id"], string>> = {
    "preload-remote-entry": "If this module is needed for the initial view or a predictable journey, use preloadRemote so the late remoteEntry request does not remain on the module path.",
    "inspect-remote-entry-delivery": "The remoteEntry request began promptly, so investigate delivery, cache, CDN, and server timing before adding preload.",
    "preload-expose-assets": "If this expose is needed for the initial view or a predictable journey, preload the exact delayed synchronous assets.",
    "inspect-get-runtime": "Inspect Shared resolution and runtime work; more preload does not explain the measured get delay.",
    "profile-factory": "Profile and reduce top-level module initialization work."
  };
  if (!(finding.id in reasons)) return [];
  const id = finding.id as keyof typeof reasons;
  const reason = reasons[id];
  if (reason === undefined) return [];
  return [{
    id,
    severity: finding.severity,
    title: finding.title,
    target: recommendationTarget(module),
    evidence: finding.evidence,
    reason,
    ...((id === "preload-expose-assets")
      ? { assets: exposeAssetsFromEvidence(module, finding.evidence) }
      : {})
  }];
}

function codeUsageRecommendation(
  module: ModulePerformanceResult["modules"][number],
  operation: ModulePerformanceResult["modules"][number]["operations"][number]
): ModulePerformanceReportRecommendation[] {
  if (operation.codeUsage.status !== "recommended") return [];
  return [{
    id: "code-usage",
    severity: "info",
    title: "Analyze matched expose assets with Code Usage",
    target: recommendationTarget(module),
    evidence: operation.codeUsage.assets.map((asset) => `Matched expose asset: ${asset}.`),
    assets: unique(operation.codeUsage.assets),
    reason: "Use Code Usage executed and unused-code evidence before changing code splitting; this is not proof that asset size caused the current bottleneck.",
    documentation: operation.codeUsage.documentation
  }];
}

function recommendationTarget(
  module: ModulePerformanceResult["modules"][number]
): ModulePerformanceReportRecommendation["target"] {
  return {
    consumer: module.consumer,
    remote: module.remote,
    producer: module.producer,
    ...(module.expose === undefined ? {} : { expose: module.expose })
  };
}

function exposeAssetsFromEvidence(
  module: ModulePerformanceResult["modules"][number],
  evidence: string[]
): string[] {
  const urls = module.operations.flatMap((operation) => operation.manifest.assets)
    .filter((asset) =>
      asset.kind === "sync" && asset.match === "matched" &&
      asset.url !== undefined && evidence.some((item) =>
        item.includes(asset.url as string)
      )
    )
    .map((asset) => asset.url as string);
  return unique(urls);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
