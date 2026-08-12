import type {
  ModulePerformanceReport,
  ModulePerformanceReportModule,
  ModulePerformanceReportRecommendation,
  ModulePerformanceResult,
  ModulePerformanceTimeline,
  ModulePerformanceTimelineItem,
  ModulePerformanceTimelineLane,
  ModulePerformanceTimelineMarker
} from "./types.js";

export function createModulePerformanceReport(
  result: ModulePerformanceResult
): ModulePerformanceReport {
  const timeline = createTimeline(result);
  return {
    schemaVersion: 1,
    command: "mf module-perf --report",
    report: {
      page: result.page,
      selection: result.selection,
      summary: result.summary,
      ...(timeline === undefined
        ? {}
        : { timeline }),
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
      preloadJs: operation.preloadJs,
      bottleneck: operation.bottleneck,
      findings: operation.findings.filter((finding) =>
        finding.id !== "inspect-expose-code-usage"
      )
    }))
  };
}

function createTimeline(
  result: ModulePerformanceResult
): ModulePerformanceTimeline | undefined {
  if (result.page.clock === undefined) return undefined;
  const lanes: ModulePerformanceTimelineLane[] = [createPageLane(result)];
  const pageScripts = createPageScriptLane(result);
  if (pageScripts !== undefined) lanes.push(pageScripts);
  for (const [moduleIndex, module] of result.modules.entries()) {
    for (const [operationIndex, operation] of module.operations.entries()) {
      const prefix = `module-${moduleIndex + 1}-operation-${operationIndex + 1}`;
      lanes.push({
        id: `${prefix}-consumer`,
        kind: "mf-consumer",
        label: `${module.consumer.name} · loadRemote`,
        items: [{
          id: `${prefix}-load-remote`,
          type: "span",
          label: module.expose === undefined
            ? module.remote.alias ?? module.remote.name
            : `${module.remote.alias ?? module.remote.name}/${displayExpose(module.expose)}`,
          ...intervalFields(operation.timing.loadRemote),
          source: "module-federation",
          status: operation.outcome
        }]
      });
      const provider = createProviderLane(prefix, module, operation);
      if (provider !== undefined) lanes.push(provider);
      const preload = createPreloadLane(prefix, module, operation);
      if (preload !== undefined) lanes.push(preload);
    }
  }
  return {
    schemaVersion: 1,
    clock: result.page.clock,
    markers: createMarkers(result),
    lanes
  };
}

function createPageLane(
  result: ModulePerformanceResult
): ModulePerformanceTimelineLane {
  const items: ModulePerformanceTimelineItem[] = [{
    id: "navigation-start",
    type: "point",
    label: "Visit URL",
    at: 0,
    source: "browser"
  }];
  if (result.page.document !== undefined) {
    items.push({
      id: "main-document",
      type: "span",
      label: "Main HTML response",
      start: result.page.document.start,
      end: result.page.document.end,
      duration: result.page.document.duration,
      source: "browser"
    });
  }
  return {
    id: "page",
    kind: "page",
    label: "Page",
    items
  };
}

function createPageScriptLane(
  result: ModulePerformanceResult
): ModulePerformanceTimelineLane | undefined {
  const mfAssets = result.modules.flatMap((module) =>
    module.operations.flatMap((operation) => [
      operation.manifest.remoteEntryResource?.url ?? operation.manifest.remoteEntry,
      ...operation.manifest.assets.map((asset) => asset.url ?? asset.asset)
    ])
  ).filter((value): value is string => value !== undefined);
  const scripts = (result.page.scripts ?? []).filter((script) =>
    !mfAssets.some((asset) => sameResource(script.url, asset))
  );
  if (scripts.length === 0) return undefined;
  return {
    id: "page-scripts",
    kind: "page-script",
    label: "Page scripts",
    items: scripts.map((script, index) => ({
      id: `page-script-${index + 1}`,
      type: "span",
      label: resourceLabel(script.url),
      start: script.start,
      end: script.end,
      duration: script.duration,
      source: "browser"
    }))
  };
}

function createProviderLane(
  prefix: string,
  module: ModulePerformanceResult["modules"][number],
  operation: ModulePerformanceResult["modules"][number]["operations"][number]
): ModulePerformanceTimelineLane | undefined {
  const phases: Array<[
    string,
    string,
    typeof operation.timing.manifest
  ]> = [
    ["manifest", "Manifest", operation.timing.manifest],
    ["remote-entry", "remoteEntry", operation.timing.remoteEntry],
    ["container-init", "Provider container init", operation.timing.containerInit],
    ["get", "Expose get / sync chunks", operation.timing.get],
    ["factory", "Module factory", operation.timing.factory]
  ];
  const items: ModulePerformanceTimelineItem[] = phases.flatMap(([
    id,
    label,
    interval
  ]) => interval === undefined ? [] : [{
    id: `${prefix}-${id}`,
    type: "span" as const,
    label,
    ...intervalFields(interval),
    source: "module-federation" as const
  }]);
  const completedAt = operation.timing.loadRemote.end;
  if (completedAt !== undefined && operation.outcome !== "pending") {
    items.push({
      id: `${prefix}-result`,
      type: "point",
      label: operation.outcome === "success" || operation.outcome === "recovered"
        ? "Provider module loaded"
        : `MF load ${operation.outcome}`,
      at: completedAt,
      source: "module-federation",
      status: operation.outcome
    });
  }
  if (items.length === 0) return undefined;
  return {
    id: `${prefix}-provider`,
    kind: "mf-provider",
    label: module.producer.version === undefined
      ? module.producer.name
      : `${module.producer.name}@${module.producer.version}`,
    items
  };
}

function createPreloadLane(
  prefix: string,
  module: ModulePerformanceResult["modules"][number],
  operation: ModulePerformanceResult["modules"][number]["operations"][number]
): ModulePerformanceTimelineLane | undefined {
  if (operation.preloadJs.length === 0) return undefined;
  return {
    id: `${prefix}-preload`,
    kind: "mf-preload",
    label: `${module.remote.alias ?? module.remote.name} · MF preload JS`,
    items: operation.preloadJs.map((preload, index) => ({
      id: `${prefix}-preload-${index + 1}`,
      type: "span",
      label: `${resourceLabel(preload.asset)} (${preload.role})`,
      start: preload.start,
      ...(preload.end === undefined ? {} : { end: preload.end }),
      ...(preload.duration === undefined ? {} : { duration: preload.duration }),
      source: preload.initiators.includes("preloadRemote")
        ? "module-federation"
        : "browser",
      ...(preload.outcome === undefined ? {} : { status: preload.outcome })
    }))
  };
}

function createMarkers(
  result: ModulePerformanceResult
): ModulePerformanceTimelineMarker[] {
  return [
    ...(result.page.fp === undefined
      ? []
      : [{ id: "fp" as const, label: "FP" as const, at: result.page.fp }]),
    ...(result.page.fcp === undefined
      ? []
      : [{ id: "fcp" as const, label: "FCP" as const, at: result.page.fcp }]),
    ...(result.page.lcp === undefined
      ? []
      : [{
          id: "lcp" as const,
          label: "LCP" as const,
          at: result.page.lcp,
          status: result.page.lcpStatus
        }])
  ].sort((left, right) => left.at - right.at);
}

function intervalFields(interval: {
  start: number;
  end?: number;
  duration?: number;
}): { start: number; end?: number; duration?: number } {
  return {
    start: interval.start,
    ...(interval.end === undefined ? {} : { end: interval.end }),
    ...(interval.duration === undefined ? {} : { duration: interval.duration })
  };
}

function displayExpose(value: string): string {
  return value.replace(/^\.\//, "");
}

function resourceLabel(value: string): string {
  try {
    const pathname = new URL(value, "https://divebell.invalid").pathname;
    return pathname.split("/").filter(Boolean).at(-1) ?? value;
  } catch {
    return value.split("/").filter(Boolean).at(-1) ?? value;
  }
}

function sameResource(left: string, right: string): boolean {
  if (left === right) return true;
  try {
    const leftUrl = new URL(left, "https://divebell.invalid");
    const rightUrl = new URL(right, "https://divebell.invalid");
    const bothAbsolute = /^(?:https?:)?\/\//i.test(left) &&
      /^(?:https?:)?\/\//i.test(right);
    return leftUrl.pathname === rightUrl.pathname &&
      (!bothAbsolute || leftUrl.host === rightUrl.host);
  } catch {
    return false;
  }
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
