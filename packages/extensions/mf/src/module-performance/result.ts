import { collectBridgeOperations } from "../bridge/aggregate.js";
import { buildRemoteTrace, remoteCapability } from "../remote/results.js";
import {
  isRemoteTraceReport,
  normalizeExpose,
  reportInstanceRef
} from "../remote/selection.js";
import { remotesMatch, visibleInstanceName } from "../selection.js";
import type { BridgeOperationTrace } from "../bridge/types.js";
import type {
  RemoteStageEvidence,
  RemoteTraceSummary
} from "../remote/types.js";
import type {
  BrowserObservabilitySnapshot,
  RuntimeInstance,
  RuntimeRemote
} from "../types.js";
import type {
  MatchedRender,
  ModulePerformanceAssetTiming,
  ModulePerformanceBottleneck,
  ModulePerformanceBrowserSnapshot,
  ModulePerformanceCodeUsage,
  ModulePerformanceExposeAssetsSnapshot,
  ModulePerformanceFinding,
  ModulePerformanceInterval,
  ModulePerformanceLoadSnapshot,
  ModulePerformanceManifest,
  ModulePerformanceModule,
  ModulePerformanceOperation,
  ModulePerformancePageImpact,
  ModulePerformanceRenderSnapshot,
  ModulePerformanceResourceSnapshot,
  ModulePerformanceResult,
  ModulePerformanceSelectors,
  ModulePerformanceTiming,
  ModulePerformanceTrigger,
  ModulePerformanceUnobservedRemote
} from "./types.js";

interface ModuleGroup {
  consumer: ModulePerformanceModule["consumer"];
  producer: ModulePerformanceModule["producer"];
  remote: RuntimeRemote;
  expose?: string;
  traces: RemoteTraceSummary[];
}

const RENDER_MATCH_WINDOW = 30_000;
const INTERACTION_WINDOW = 1_000;
const MEANINGFUL_DURATION = 50;

export function createModulePerformanceResult(
  snapshot: BrowserObservabilitySnapshot,
  performance: ModulePerformanceBrowserSnapshot | null,
  selectors: ModulePerformanceSelectors = {}
): ModulePerformanceResult {
  const groups = collectGroups(snapshot, selectors);
  const bridgeOperations = collectBridgeOperations(snapshot)
    .filter((operation) => operation.operations.includes("render"));
  const usedRenders = new Set<string>();
  const usedBridgeOperations = new Set<string>();
  const modules = groups.map((group) => createModule(
    group,
    performance,
    bridgeOperations,
    usedRenders,
    usedBridgeOperations
  )).sort(compareModules);
  const unobservedRemotes = collectUnobservedRemotes(snapshot, groups, selectors);
  const warnings = collectWarnings(snapshot, performance, modules, selectors);
  const recommendedActions = collectRecommendedActions(modules, unobservedRemotes);
  const operations = modules.flatMap((module) => module.operations);

  return {
    schemaVersion: 1,
    command: "mf module-perf",
    observedAt: snapshot.state.observedAt,
    page: performance === null
      ? { lcpStatus: "not-observed" }
      : {
          ...(performance.page.fp === undefined ? {} : { fp: round(performance.page.fp) }),
          ...(performance.page.fcp === undefined ? {} : { fcp: round(performance.page.fcp) }),
          ...(performance.page.lcp === undefined ? {} : { lcp: round(performance.page.lcp) }),
          lcpStatus: performance.page.lcpStatus
        },
    selection: {
      ...(selectors.target === undefined ? {} : { target: selectors.target }),
      ...(selectors.name === undefined ? {} : { name: selectors.name }),
      ...(selectors.instanceRef === undefined
        ? {}
        : { instanceRef: selectors.instanceRef })
    },
    summary: {
      moduleCount: modules.length,
      operationCount: operations.length,
      manifestModuleCount: modules.filter((module) =>
        module.operations.some((operation) => operation.manifest.status === "available")
      ).length,
      renderedOperationCount: operations.filter((operation) =>
        operation.pageImpact.rendering === "observed"
      ).length,
      unobservedRemoteCount: unobservedRemotes.length
    },
    modules,
    unobservedRemotes,
    warnings: unique(warnings),
    recommendedActions: unique(recommendedActions)
  };
}

function collectGroups(
  snapshot: BrowserObservabilitySnapshot,
  selectors: ModulePerformanceSelectors
): ModuleGroup[] {
  const groups: ModuleGroup[] = [];
  for (const report of snapshot.reports) {
    if (!isRemoteTraceReport(report, "load") || report.remote === undefined) continue;
    const instanceRef = reportInstanceRef(report) ?? "unknown";
    const consumerInstance = snapshot.state.instances.find((instance) =>
      instance.instanceRef === instanceRef
    );
    if (!matchesConsumer(consumerInstance, instanceRef, selectors)) continue;
    const trace = buildRemoteTrace(
      report,
      "load",
      consumerInstance === undefined
        ? report.hostName
        : visibleInstanceName(consumerInstance)
    );
    const remote = trace.remote ?? report.remote;
    if (!matchesTarget(remote, trace.expose, selectors.target)) continue;
    const consumer = {
      instanceRef,
      name: consumerInstance === undefined
        ? trace.instanceName
        : visibleInstanceName(consumerInstance)
    };
    const producer = resolveProducer(snapshot, instanceRef, remote);
    const existing = groups.find((group) =>
      group.consumer.instanceRef === instanceRef &&
      remotesMatch(group.remote, remote) &&
      sameExpose(group.expose, trace.expose)
    );
    if (existing === undefined) {
      groups.push({
        consumer,
        producer,
        remote,
        ...(trace.expose === undefined ? {} : { expose: trace.expose }),
        traces: [trace]
      });
    } else {
      existing.traces.push(trace);
      existing.remote = mergeRemote(existing.remote, remote);
      existing.producer = mergeProducer(existing.producer, producer);
    }
  }
  for (const group of groups) {
    group.traces.sort((left, right) => left.startedAt - right.startedAt);
  }
  return groups;
}

function createModule(
  group: ModuleGroup,
  performance: ModulePerformanceBrowserSnapshot | null,
  bridgeOperations: BridgeOperationTrace[],
  usedRenders: Set<string>,
  usedBridgeOperations: Set<string>
): ModulePerformanceModule {
  const warnings: string[] = [];
  const usedLoads = new Set<string>();
  const operations = group.traces.map((trace) => {
    const load = performance === null
      ? undefined
      : selectLoad(group, trace, performance, usedLoads);
    const render = performance === null
      ? selectBridgeOnly(group, trace, bridgeOperations, usedBridgeOperations)
      : selectRender(
          group,
          trace,
          performance,
          bridgeOperations,
          usedRenders,
          usedBridgeOperations
        );
    return createOperation(group, trace, performance, render, load);
  });
  if (operations.every((operation) =>
    operation.pageImpact.rendering === "not-observed"
  )) {
    warnings.push(
      "No producer Bridge render was observed; render and first-content timing are unavailable."
    );
  }
  if (operations.every((operation) =>
    operation.manifest.status !== "available"
  )) {
    warnings.push(
      "No unambiguous Manifest expose assets were found; resource-level attribution is unavailable."
    );
  }
  return {
    consumer: group.consumer,
    producer: group.producer,
    remote: group.remote,
    ...(group.expose === undefined ? {} : { expose: group.expose }),
    operations,
    warnings
  };
}

function createOperation(
  group: ModuleGroup,
  trace: RemoteTraceSummary,
  performance: ModulePerformanceBrowserSnapshot | null,
  render: MatchedRender,
  load: ModulePerformanceLoadSnapshot | undefined
): ModulePerformanceOperation {
  let timing = createTiming(trace, performance, render, load);
  const manifest = createManifest(group, timing, performance);
  timing = addRemoteEntryResourceTiming(timing, manifest);
  const pageImpact = createPageImpact(timing, performance, render);
  const bottleneck = createBottleneck(trace, timing, manifest);
  const codeUsage = createCodeUsage(bottleneck, manifest);
  return {
    traceId: trace.traceId,
    outcome: trace.outcome,
    timing,
    manifest,
    pageImpact,
    bottleneck,
    findings: createFindings(
      trace,
      timing,
      manifest,
      pageImpact,
      bottleneck,
      codeUsage,
      performance
    ),
    codeUsage
  };
}

function createTiming(
  trace: RemoteTraceSummary,
  performance: ModulePerformanceBrowserSnapshot | null,
  render: MatchedRender,
  load: ModulePerformanceLoadSnapshot | undefined
): ModulePerformanceTiming {
  const timeOrigin = performance?.page.timeOrigin ?? trace.startedAt;
  const requested = relativeTime(trace.startedAt, timeOrigin);
  const remoteEntry = stageInterval(trace, "remoteEntry", timeOrigin);
  const get = load?.get ?? stageInterval(trace, "expose", timeOrigin);
  const factory = load?.factory ?? stageInterval(trace, "factory", timeOrigin);
  const renderInterval = render.visual === undefined
    ? render.bridge === undefined
      ? undefined
      : intervalFromEpoch(
          render.bridge.startedAt,
          render.bridge.endedAt,
          render.bridge.duration,
          timeOrigin
        )
    : {
        start: round(render.visual.start),
        ...(render.visual.end === undefined
          ? {}
          : { end: round(render.visual.end) }),
        ...(render.visual.duration === undefined
          ? {}
          : { duration: round(render.visual.duration) })
      };
  const firstContent = render.visual?.firstContent;
  const getStart = get?.start;
  return {
    requested: round(requested),
    ...(remoteEntry === undefined ? {} : { remoteEntry }),
    ...(get === undefined ? {} : { get }),
    ...(factory === undefined ? {} : { factory }),
    ...(renderInterval === undefined ? {} : { render: renderInterval }),
    ...(firstContent === undefined ? {} : { firstContent: round(firstContent) }),
    ...(getStart === undefined || renderInterval?.end === undefined
      ? {}
      : { getToRender: round(Math.max(0, renderInterval.end - getStart)) }),
    ...(getStart === undefined || firstContent === undefined
      ? {}
      : { getToFirstContent: round(Math.max(0, firstContent - getStart)) })
  };
}

function createManifest(
  group: ModuleGroup,
  timing: ModulePerformanceTiming,
  performance: ModulePerformanceBrowserSnapshot | null
): ModulePerformanceManifest {
  if (performance === null || group.expose === undefined) {
    return { status: "unavailable", assets: [] };
  }
  const candidates = performance.exposes.filter((entry) =>
    sameExpose(entry.expose, group.expose) && manifestIdentityMatches(entry, group)
  );
  const versionMatches = group.producer.version === undefined
    ? candidates
    : candidates.filter((entry) => entry.version === undefined ||
      entry.version === group.producer.version
    );
  const selectedCandidates = versionMatches.length > 0 ? versionMatches : candidates;
  if (selectedCandidates.length === 0) {
    return { status: "unavailable", assets: [] };
  }
  if (selectedCandidates.length > 1) {
    return {
      status: "ambiguous",
      assets: unique(selectedCandidates.flatMap((entry) => [
        ...entry.js.sync.map((asset) => unmatchedAsset(asset, "sync", "ambiguous")),
        ...entry.js.async.map((asset) => unmatchedAsset(asset, "async", "ambiguous"))
      ]), assetKey)
    };
  }
  const selected = selectedCandidates[0] as ModulePerformanceExposeAssetsSnapshot;
  const remoteEntryMatch = selected.remoteEntry === undefined
    ? undefined
    : matchAsset(
        selected.remoteEntry,
        "sync",
        selected,
        timing,
        performance.resources
      );
  const assets = [
    ...selected.js.sync.map((asset) => matchAsset(
      asset,
      "sync",
      selected,
      timing,
      performance.resources
    )),
    ...selected.js.async.map((asset) => matchAsset(
      asset,
      "async",
      selected,
      timing,
      performance.resources
    ))
  ];
  return {
    status: "available",
    key: selected.key,
    ...(selected.publicPath === undefined ? {} : { publicPath: selected.publicPath }),
    ...(selected.remoteEntry === undefined ? {} : { remoteEntry: selected.remoteEntry }),
    ...(remoteEntryMatch === undefined
      ? {}
      : {
          remoteEntryResource: {
            asset: remoteEntryMatch.asset,
            match: remoteEntryMatch.match,
            ...(remoteEntryMatch.url === undefined
              ? {}
              : { url: remoteEntryMatch.url }),
            ...(remoteEntryMatch.start === undefined
              ? {}
              : { start: remoteEntryMatch.start }),
            ...(remoteEntryMatch.end === undefined
              ? {}
              : { end: remoteEntryMatch.end }),
            ...(remoteEntryMatch.duration === undefined
              ? {}
              : { duration: remoteEntryMatch.duration }),
            ...(remoteEntryMatch.loadedBeforeGet === undefined
              ? {}
              : { loadedBeforeGet: remoteEntryMatch.loadedBeforeGet }),
            ...(remoteEntryMatch.transferSize === undefined
              ? {}
              : { transferSize: remoteEntryMatch.transferSize }),
            ...(remoteEntryMatch.encodedBodySize === undefined
              ? {}
              : { encodedBodySize: remoteEntryMatch.encodedBodySize }),
            ...(remoteEntryMatch.decodedBodySize === undefined
              ? {}
              : { decodedBodySize: remoteEntryMatch.decodedBodySize }),
            ...(remoteEntryMatch.cache === undefined
              ? {}
              : { cache: remoteEntryMatch.cache }),
            ...(remoteEntryMatch.candidates === undefined
              ? {}
              : { candidates: remoteEntryMatch.candidates })
          }
        }),
    assets
  };
}

function addRemoteEntryResourceTiming(
  timing: ModulePerformanceTiming,
  manifest: ModulePerformanceManifest
): ModulePerformanceTiming {
  const resource = manifest.remoteEntryResource;
  if (timing.remoteEntry !== undefined || resource?.match !== "matched" ||
      resource.start === undefined) return timing;
  return {
    ...timing,
    remoteEntry: {
      start: resource.start,
      ...(resource.end === undefined ? {} : { end: resource.end }),
      ...(resource.duration === undefined ? {} : { duration: resource.duration })
    }
  };
}

function matchAsset(
  asset: string,
  kind: "sync" | "async",
  manifest: ModulePerformanceExposeAssetsSnapshot,
  timing: ModulePerformanceTiming,
  resources: ModulePerformanceResourceSnapshot[]
): ModulePerformanceAssetTiming {
  const expectedUrls = assetUrls(asset, manifest.publicPath);
  const exact = resources.filter((resource) =>
    expectedUrls.some((expected) => resource.url === expected)
  );
  const pathMatches = exact.length > 0 ? exact : resources.filter((resource) =>
    expectedUrls.some((expected) => sameResourcePath(resource.url, expected))
  );
  if (pathMatches.length === 0) return unmatchedAsset(asset, kind, "not-loaded");
  const distinctUrls = unique(pathMatches.map((resource) => resource.url));
  if (exact.length === 0 && distinctUrls.length > 1) {
    return {
      ...unmatchedAsset(asset, kind, "ambiguous"),
      candidates: distinctUrls.slice(0, 10)
    };
  }
  const getEnd = timing.get?.end ?? timing.factory?.start ?? Number.POSITIVE_INFINITY;
  const eligible = pathMatches.filter((resource) => resource.start <= getEnd + 10);
  const selected = (eligible.length > 0 ? eligible : pathMatches)
    .sort((left, right) => right.start - left.start)[0] as ModulePerformanceResourceSnapshot;
  return {
    asset,
    kind,
    match: "matched",
    url: selected.url,
    start: round(selected.start),
    end: round(selected.end),
    duration: round(selected.duration),
    ...(timing.get?.start === undefined
      ? {}
      : { loadedBeforeGet: selected.end <= timing.get.start }),
    ...(selected.transferSize === undefined
      ? {}
      : { transferSize: selected.transferSize }),
    ...(selected.encodedBodySize === undefined
      ? {}
      : { encodedBodySize: selected.encodedBodySize }),
    ...(selected.decodedBodySize === undefined
      ? {}
      : { decodedBodySize: selected.decodedBodySize }),
    cache: selected.cache
  };
}

function createPageImpact(
  timing: ModulePerformanceTiming,
  performance: ModulePerformanceBrowserSnapshot | null,
  render: MatchedRender
): ModulePerformancePageImpact {
  if (performance === null) {
    return {
      trigger: "unknown",
      rendering: render.bridge === undefined ? "not-observed" : "observed",
      visibleBeforeLcp: "unknown",
      containsLcpElement: "unknown",
      confidence: "low"
    };
  }
  const visual = render.visual;
  const trigger = classifyTrigger(timing.requested, performance);
  const visibleBeforeLcp = visual?.firstContent === undefined ||
      performance.page.lcp === undefined
    ? "unknown"
    : visual.firstContent <= performance.page.lcp;
  const containsLcpElement = visual?.containsLcpElement ?? "unknown";
  return {
    trigger,
    rendering: visual !== undefined || render.bridge !== undefined
      ? "observed"
      : "not-observed",
    visibleBeforeLcp,
    containsLcpElement,
    confidence: containsLcpElement !== "unknown" || trigger === "interaction"
      ? "high"
      : visual !== undefined
        ? "medium"
        : "low"
  };
}

function createBottleneck(
  trace: RemoteTraceSummary,
  timing: ModulePerformanceTiming,
  manifest: ModulePerformanceManifest
): ModulePerformanceBottleneck {
  const getDuration = timing.get?.duration;
  const resourceDuration = getDuration === undefined
    ? 0
    : syncResourceUnionDuringGet(manifest.assets, timing.get as ModulePerformanceInterval);
  const exposeResource = getDuration !== undefined && resourceDuration >= 20 &&
    resourceDuration >= getDuration * 0.5;
  const candidates = [
    durationCandidate("remoteEntry", timing.remoteEntry?.duration),
    durationCandidate(exposeResource ? "expose-resource" : "get", getDuration),
    durationCandidate("factory", timing.factory?.duration),
    durationCandidate("render", timing.render?.duration)
  ].filter((item): item is { type: Exclude<ModulePerformanceBottleneck["type"], "mixed" | "unknown">; duration: number } =>
    item !== undefined
  ).sort((left, right) => right.duration - left.duration);
  const top = candidates[0];
  if (top === undefined) {
    return {
      type: "unknown",
      confidence: "low",
      evidence: ["No complete lifecycle duration was observed."]
    };
  }
  const total = candidates.reduce((sum, item) => sum + item.duration, 0);
  const mixed = candidates[1] !== undefined && top.duration > 0 &&
    candidates[1].duration >= top.duration * 0.85;
  const type = mixed ? "mixed" : top.type;
  const duration = mixed
    ? top.duration + (candidates[1]?.duration ?? 0)
    : top.duration;
  const evidence = mixed
    ? [
        `${top.type} took ${round(top.duration)} ms.`,
        `${candidates[1]?.type ?? "another phase"} took ${round(candidates[1]?.duration ?? 0)} ms.`
      ]
    : [
        `${top.type} was the longest measured phase at ${round(top.duration)} ms.`,
        ...(type === "expose-resource"
          ? [`Matched synchronous expose resources occupied ${round(resourceDuration)} ms of get.`]
          : [])
      ];
  return {
    type,
    duration: round(duration),
    ...(total <= 0 ? {} : { percentage: round(duration / total * 100) }),
    confidence: type === "expose-resource"
      ? "high"
      : remoteCapabilityFromTrace(trace)
        ? "high"
        : "medium",
    evidence
  };
}

function createCodeUsage(
  bottleneck: ModulePerformanceBottleneck,
  manifest: ModulePerformanceManifest
): ModulePerformanceCodeUsage {
  const assets = manifest.assets.filter((asset) =>
    asset.kind === "sync" && asset.match === "matched" && asset.url !== undefined
  ).map((asset) => asset.url as string);
  if (manifest.status !== "available") {
    return {
      status: "unavailable",
      assets: [],
      reason: "Manifest expose assets are unavailable, so Code Usage cannot target this expose precisely."
    };
  }
  if (!["expose-resource", "get", "mixed"].includes(bottleneck.type) ||
      assets.length === 0) {
    return {
      status: "not-applicable",
      assets: [],
      reason: bottleneck.type === "remoteEntry"
        ? "Code Usage is not suitable for splitting remoteEntry; preload it when its timing justifies doing so."
        : "The measured bottleneck is not attributable to a loaded expose JavaScript asset."
    };
  }
  return {
    status: "recommended",
    assets: unique(assets),
    reason: "Run Code Usage separately for these expose assets before changing code splitting; coverage changes runtime behavior and is not mixed into this measurement."
  };
}

function createFindings(
  trace: RemoteTraceSummary,
  timing: ModulePerformanceTiming,
  manifest: ModulePerformanceManifest,
  impact: ModulePerformancePageImpact,
  bottleneck: ModulePerformanceBottleneck,
  codeUsage: ModulePerformanceCodeUsage,
  performance: ModulePerformanceBrowserSnapshot | null
): ModulePerformanceFinding[] {
  const findings: ModulePerformanceFinding[] = [];
  if (bottleneck.type === "remoteEntry" &&
      (timing.remoteEntry?.duration ?? 0) >= MEANINGFUL_DURATION) {
    const remoteEntry = manifest.remoteEntryResource?.url ?? manifest.remoteEntry;
    findings.push({
      id: "preload-remote-entry",
      severity: "warning",
      title: "remoteEntry is delaying module access",
      evidence: bottleneck.evidence,
      suggestion: remoteEntry === undefined
        ? "Preload remoteEntry before this module is requested. remoteEntry itself is not a useful Code Usage splitting target."
        : `Preload remoteEntry before this module is requested: ${remoteEntry}. remoteEntry itself is not a useful Code Usage splitting target.`
    });
  }
  if ((bottleneck.type === "expose-resource" || bottleneck.type === "mixed") &&
      manifest.status === "available") {
    const delayedSyncAssets = manifest.assets.filter((asset) =>
      asset.kind === "sync" && asset.match === "matched" &&
      asset.loadedBeforeGet === false
    );
    if (delayedSyncAssets.length > 0) {
      const assetNames = delayedSyncAssets.map((asset) => asset.url ?? asset.asset);
      const shouldPreload = impact.trigger === "initial" ||
        impact.containsLcpElement === true || impact.visibleBeforeLcp === true;
      findings.push({
        id: shouldPreload ? "preload-expose-assets" : "defer-expose-assets",
        severity: shouldPreload ? "warning" : "info",
        title: shouldPreload
          ? "Expose JavaScript starts too late for visible page work"
          : "Expose JavaScript is loaded outside the initial page path",
        evidence: [
          ...assetNames.map((asset) => `${asset} loaded after get started.`),
          `Trigger classification: ${impact.trigger}.`
        ],
        suggestion: shouldPreload
          ? `Preload the synchronous expose assets: ${assetNames.join(", ")}.`
          : "Do not promote these assets to initial priority unless this interaction is frequent and user-visible latency remains high."
      });
    }
  }
  if (bottleneck.type === "get" && (timing.get?.duration ?? 0) >= MEANINGFUL_DURATION) {
    const allSyncReady = manifest.status === "available" &&
      manifest.assets.some((asset) => asset.kind === "sync") &&
      manifest.assets.filter((asset) => asset.kind === "sync")
        .every((asset) => asset.loadedBeforeGet === true);
    findings.push({
      id: allSyncReady ? "profile-get-runtime" : "inspect-get",
      severity: "warning",
      title: "Module get is slow after remoteEntry is ready",
      evidence: [
        `get took ${round(timing.get?.duration ?? 0)} ms.`,
        allSyncReady
          ? "All matched synchronous expose assets completed before get started."
          : "Resource timing does not fully explain the get duration."
      ],
      suggestion: allSyncReady
        ? "Inspect shared dependency resolution and profile the get path; preloading more expose files will not address the measured delay."
        : "Use a performance profile to inspect shared resolution and runtime work inside get. Add a Manifest if expose asset attribution is unavailable."
    });
  }
  if ((timing.factory?.duration ?? 0) >= MEANINGFUL_DURATION &&
      (bottleneck.type === "factory" || bottleneck.type === "mixed")) {
    findings.push({
      id: "profile-factory",
      severity: "warning",
      title: "Module initialization is expensive",
      evidence: [`factory took ${round(timing.factory?.duration ?? 0)} ms.`],
      suggestion: "Profile top-level module initialization and move non-essential startup work behind the point where it is needed."
    });
  }
  if ((timing.render?.duration ?? 0) >= MEANINGFUL_DURATION &&
      (bottleneck.type === "render" || bottleneck.type === "mixed")) {
    findings.push({
      id: "profile-render",
      severity: "warning",
      title: "Producer rendering is expensive",
      evidence: [`render took ${round(timing.render?.duration ?? 0)} ms.`],
      suggestion: "Profile the producer component render, reduce synchronous work, and move data fetching or below-fold work out of the critical render."
    });
  }
  if (impact.containsLcpElement === true && performance?.page.lcp !== undefined) {
    findings.push({
      id: "module-owns-lcp",
      severity: "warning",
      title: "This module contains the page LCP element",
      evidence: [
        `The module render root contains the LCP element at ${round(performance.page.lcp)} ms.`,
        `get started at ${round(timing.get?.start ?? timing.requested)} ms.`
      ],
      suggestion: "Treat this module as page-critical: request it earlier and prioritize only the remoteEntry and synchronous expose assets shown by this report."
    });
  }
  if (codeUsage.status === "recommended") {
    findings.push({
      id: "inspect-expose-code-usage",
      severity: "info",
      title: "Expose assets are suitable for a separate Code Usage pass",
      evidence: codeUsage.assets.map((asset) => `Measured expose asset: ${asset}.`),
      suggestion: "Run Code Usage on the listed expose assets, then use the unused-code evidence to guide further code splitting."
    });
  }
  if (findings.length === 0) {
    findings.push({
      id: "no-actionable-bottleneck",
      severity: "info",
      title: "No actionable module bottleneck was detected",
      evidence: [
        `Longest measured phase: ${bottleneck.type}.`,
        `Trace outcome: ${trace.outcome}.`
      ],
      suggestion: "Keep this result as a baseline and compare it after a representative user path changes."
    });
  }
  return findings;
}

function selectRender(
  group: ModuleGroup,
  trace: RemoteTraceSummary,
  performance: ModulePerformanceBrowserSnapshot,
  bridgeOperations: BridgeOperationTrace[],
  usedRenders: Set<string>,
  usedBridgeOperations: Set<string>
): MatchedRender {
  const traceEnd = trace.stages.find((stage) => stage.name === "factory")?.endedAt ??
    trace.endedAt ?? trace.startedAt;
  const candidates = performance.renders.filter((render) =>
    !usedRenders.has(render.id) && renderMatchesGroup(render, group) &&
    performance.page.timeOrigin + render.start >= traceEnd - 100 &&
    performance.page.timeOrigin + render.start <= traceEnd + RENDER_MATCH_WINDOW
  ).sort((left, right) =>
    Math.abs(performance.page.timeOrigin + left.start - traceEnd) -
    Math.abs(performance.page.timeOrigin + right.start - traceEnd)
  );
  const visual = candidates[0];
  if (visual !== undefined) usedRenders.add(visual.id);
  const bridge = selectBridgeOperation(
    group,
    trace,
    bridgeOperations,
    usedBridgeOperations,
    visual === undefined
      ? undefined
      : performance.page.timeOrigin + visual.start
  );
  return {
    ...(bridge === undefined ? {} : { bridge }),
    ...(visual === undefined ? {} : { visual })
  };
}

function selectLoad(
  group: ModuleGroup,
  trace: RemoteTraceSummary,
  performance: ModulePerformanceBrowserSnapshot,
  used: Set<string>
): ModulePerformanceLoadSnapshot | undefined {
  const candidates = performance.loads.filter((load) =>
    !used.has(load.id) &&
    (load.remote === group.remote.name || load.remote === group.remote.alias ||
      load.alias === group.remote.name || load.alias === group.remote.alias) &&
    sameExpose(load.expose, group.expose) &&
    (load.instanceName === group.consumer.name ||
      load.instanceName === trace.instanceName)
  ).sort((left, right) => {
    const leftRequest = left.requestId === trace.requestId ? 0 : 1;
    const rightRequest = right.requestId === trace.requestId ? 0 : 1;
    return leftRequest - rightRequest ||
      Math.abs(performance.page.timeOrigin + left.get.start - trace.startedAt) -
      Math.abs(performance.page.timeOrigin + right.get.start - trace.startedAt);
  });
  const selected = candidates[0];
  if (selected !== undefined) used.add(selected.id);
  return selected;
}

function selectBridgeOnly(
  group: ModuleGroup,
  trace: RemoteTraceSummary,
  bridgeOperations: BridgeOperationTrace[],
  usedBridgeOperations: Set<string>
): MatchedRender {
  const bridge = selectBridgeOperation(
    group,
    trace,
    bridgeOperations,
    usedBridgeOperations
  );
  return bridge === undefined ? {} : { bridge };
}

function selectBridgeOperation(
  group: ModuleGroup,
  trace: RemoteTraceSummary,
  operations: BridgeOperationTrace[],
  used: Set<string>,
  preferredStart?: number
): BridgeOperationTrace | undefined {
  const traceEnd = trace.stages.find((stage) => stage.name === "factory")?.endedAt ??
    trace.endedAt ?? trace.startedAt;
  const candidates = operations.filter((operation) => {
    const key = bridgeKey(operation);
    return !used.has(key) && bridgeMatchesGroup(operation, group) &&
      operation.startedAt >= traceEnd - 100 &&
      operation.startedAt <= traceEnd + RENDER_MATCH_WINDOW;
  }).sort((left, right) => {
    const target = preferredStart ?? traceEnd;
    return Math.abs(left.startedAt - target) - Math.abs(right.startedAt - target);
  });
  const selected = candidates[0];
  if (selected !== undefined) used.add(bridgeKey(selected));
  return selected;
}

function classifyTrigger(
  requested: number,
  performance: ModulePerformanceBrowserSnapshot
): ModulePerformanceTrigger {
  const latestInteraction = performance.page.interactions
    .filter((interaction) => interaction.time <= requested)
    .sort((left, right) => right.time - left.time)[0];
  if (latestInteraction !== undefined &&
      requested - latestInteraction.time <= INTERACTION_WINDOW) {
    return "interaction";
  }
  if (performance.page.fcp !== undefined && requested <= performance.page.fcp) {
    return "initial";
  }
  if (performance.page.fcp !== undefined) return "automatic";
  return "unknown";
}

function syncResourceUnionDuringGet(
  assets: ModulePerformanceAssetTiming[],
  get: ModulePerformanceInterval
): number {
  if (get.end === undefined) return 0;
  const intervals = assets.filter((asset) =>
    asset.kind === "sync" && asset.match === "matched" &&
    asset.start !== undefined && asset.end !== undefined &&
    asset.end > get.start && asset.start < (get.end as number)
  ).map((asset) => ({
    start: Math.max(get.start, asset.start as number),
    end: Math.min(get.end as number, asset.end as number)
  })).sort((left, right) => left.start - right.start);
  let total = 0;
  let current: { start: number; end: number } | undefined;
  for (const interval of intervals) {
    if (current === undefined) {
      current = { ...interval };
      continue;
    }
    if (interval.start <= current.end) {
      current.end = Math.max(current.end, interval.end);
    } else {
      total += current.end - current.start;
      current = { ...interval };
    }
  }
  if (current !== undefined) total += current.end - current.start;
  return total;
}

function stageInterval(
  trace: RemoteTraceSummary,
  name: RemoteStageEvidence["name"],
  timeOrigin: number
): ModulePerformanceInterval | undefined {
  const stage = trace.stages.find((item) => item.name === name);
  if (stage?.startedAt === undefined) return undefined;
  return intervalFromEpoch(stage.startedAt, stage.endedAt, stage.duration, timeOrigin);
}

function intervalFromEpoch(
  start: number,
  end: number | undefined,
  duration: number | undefined,
  timeOrigin: number
): ModulePerformanceInterval {
  return {
    start: round(relativeTime(start, timeOrigin)),
    ...(end === undefined ? {} : { end: round(relativeTime(end, timeOrigin)) }),
    ...(duration === undefined ? {} : { duration: round(duration) })
  };
}

function relativeTime(epoch: number, timeOrigin: number): number {
  return Math.max(0, epoch - timeOrigin);
}

function durationCandidate(
  type: Exclude<ModulePerformanceBottleneck["type"], "mixed" | "unknown">,
  duration: number | undefined
): { type: typeof type; duration: number } | undefined {
  return duration === undefined || !Number.isFinite(duration)
    ? undefined
    : { type, duration: Math.max(0, duration) };
}

function remoteCapabilityFromTrace(trace: RemoteTraceSummary): boolean {
  return trace.stages.some((stage) =>
    stage.startedAt !== undefined && stage.endedAt !== undefined
  );
}

function manifestIdentityMatches(
  entry: ModulePerformanceExposeAssetsSnapshot,
  group: ModuleGroup
): boolean {
  const names = [
    group.remote.name,
    group.remote.alias,
    group.producer.name
  ].filter((value): value is string => value !== undefined);
  return entry.name === undefined || names.some((name) =>
    normalizeIdentity(name) === normalizeIdentity(entry.name as string)
  ) || names.some((name) => normalizeIdentity(entry.key).includes(normalizeIdentity(name)));
}

function assetUrls(asset: string, publicPath: string | undefined): string[] {
  const urls = [sanitizeUrl(asset)];
  if (publicPath !== undefined) {
    try {
      urls.push(sanitizeUrl(new URL(asset, ensureTrailingSlash(publicPath)).toString()));
    } catch {
      // The raw asset path remains available for suffix matching.
    }
  }
  return unique(urls.filter((value): value is string => value !== undefined));
}

function sameResourcePath(left: string, right: string): boolean {
  const leftPath = resourcePath(left);
  const rightPath = resourcePath(right);
  if (leftPath === undefined || rightPath === undefined) return false;
  return leftPath === rightPath || leftPath.endsWith(`/${rightPath.replace(/^\//, "")}`);
}

function resourcePath(value: string): string | undefined {
  try {
    return new URL(value, "https://divebell.invalid").pathname;
  } catch {
    return value.replace(/[?#].*$/, "");
  }
}

function sanitizeUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value.replace(/[?#].*$/, "");
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function unmatchedAsset(
  asset: string,
  kind: "sync" | "async",
  match: "not-loaded" | "ambiguous"
): ModulePerformanceAssetTiming {
  return { asset, kind, match };
}

function assetKey(asset: ModulePerformanceAssetTiming): string {
  return `${asset.kind}\u0000${asset.asset}`;
}

function resolveProducer(
  snapshot: BrowserObservabilitySnapshot,
  consumerInstanceRef: string,
  remote: RuntimeRemote
): ModulePerformanceModule["producer"] {
  const relationships = snapshot.state.relationships.filter((relationship) =>
    relationship.consumerInstanceRef === consumerInstanceRef &&
    remotesMatch(relationship.remote, remote)
  );
  const resolvedRefs = unique(relationships.map((relationship) =>
    relationship.producerInstanceRef
  ).filter((value): value is string => value !== undefined));
  const producer = resolvedRefs.length === 1
    ? snapshot.state.instances.find((instance) =>
        instance.instanceRef === resolvedRefs[0]
      )
    : undefined;
  if (producer === undefined) {
    return {
      ...(resolvedRefs[0] === undefined ? {} : { instanceRef: resolvedRefs[0] }),
      name: remote.name,
      ...(remote.version === undefined ? {} : { version: remote.version })
    };
  }
  const version = producer.optionsVersion ?? producer.runtimeVersion;
  return {
    instanceRef: producer.instanceRef,
    name: visibleInstanceName(producer),
    ...(version === undefined ? {} : { version })
  };
}

function collectUnobservedRemotes(
  snapshot: BrowserObservabilitySnapshot,
  groups: ModuleGroup[],
  selectors: ModulePerformanceSelectors
): ModulePerformanceUnobservedRemote[] {
  return snapshot.state.instances.flatMap((consumer) => {
    if ((consumer.role !== "consumer" && consumer.role !== "mixed") ||
        !matchesConsumer(consumer, consumer.instanceRef, selectors)) return [];
    return unique(consumer.remotes, remoteKey).flatMap((remote) => {
      if (!matchesTarget(remote, undefined, selectors.target)) return [];
      const observed = groups.some((group) =>
        group.consumer.instanceRef === consumer.instanceRef &&
        remotesMatch(group.remote, remote)
      );
      return observed ? [] : [{
        consumer: {
          instanceRef: consumer.instanceRef,
          name: visibleInstanceName(consumer)
        },
        remote,
        reason: "no-load-evidence" as const
      }];
    });
  }).sort((left, right) =>
    left.consumer.name.localeCompare(right.consumer.name) ||
    left.remote.name.localeCompare(right.remote.name)
  );
}

function collectWarnings(
  snapshot: BrowserObservabilitySnapshot,
  performance: ModulePerformanceBrowserSnapshot | null,
  modules: ModulePerformanceModule[],
  selectors: ModulePerformanceSelectors
): string[] {
  const warnings: string[] = [];
  const capability = remoteCapability(snapshot);
  if (capability.status === "partial") {
    warnings.push("MF history is partial; earlier module operations may be missing.");
  }
  if (performance === null) {
    warnings.push(
      "The module performance collector is unavailable; reopen the page with the current extension and --mf."
    );
  } else if (performance.page.lcpStatus === "provisional") {
    warnings.push("LCP is provisional while the page remains visible and may still change.");
  }
  if (modules.length === 0) {
    warnings.push(selectors.target === undefined
      ? "No observed module load operation is present in the captured page history."
      : `No observed module load operation matches ${selectors.target}.`);
  }
  return warnings;
}

function collectRecommendedActions(
  modules: ModulePerformanceModule[],
  unobserved: ModulePerformanceUnobservedRemote[]
): string[] {
  const actions = modules.flatMap((module) => module.operations.flatMap((operation) =>
    operation.findings.filter((finding) => finding.severity === "warning")
      .map((finding) => finding.suggestion)
  ));
  if (unobserved.length > 0) {
    actions.push(
      "Reproduce the page paths that load unobserved remotes before judging their module performance."
    );
  }
  return actions;
}

function matchesConsumer(
  instance: RuntimeInstance | undefined,
  instanceRef: string,
  selectors: ModulePerformanceSelectors
): boolean {
  if (selectors.instanceRef !== undefined && selectors.instanceRef !== instanceRef) {
    return false;
  }
  if (selectors.name === undefined) return true;
  return instance !== undefined && [
    instance.name,
    instance.optionsName,
    visibleInstanceName(instance)
  ].includes(selectors.name);
}

function matchesTarget(
  remote: RuntimeRemote,
  expose: string | undefined,
  target: string | undefined
): boolean {
  if (target === undefined) return true;
  const remoteNames = unique([remote.name, remote.alias].filter(
    (value): value is string => value !== undefined
  ));
  if (remoteNames.includes(target)) return true;
  if (expose === undefined) return false;
  const exposed = normalizeExpose(expose).slice(2);
  return remoteNames.some((name) => `${name}/${exposed}` === target);
}

function renderMatchesGroup(
  render: ModulePerformanceRenderSnapshot,
  group: ModuleGroup
): boolean {
  if (render.remote !== undefined &&
      !matchesRemoteName(group.remote, render.remote)) return false;
  if (render.expose !== undefined && !sameExpose(group.expose, render.expose)) {
    return false;
  }
  return render.remote !== undefined || render.expose !== undefined ||
    [group.producer.name, group.remote.name, group.remote.alias]
      .filter((value): value is string => value !== undefined)
      .includes(render.instanceName) ||
    render.moduleName === group.producer.name;
}

function bridgeMatchesGroup(
  operation: BridgeOperationTrace,
  group: ModuleGroup
): boolean {
  if (operation.remote !== undefined &&
      !matchesRemoteName(group.remote, operation.remote)) return false;
  if (operation.expose !== undefined &&
      !sameExpose(group.expose, operation.expose)) return false;
  return operation.remote !== undefined || operation.expose !== undefined ||
    operation.instance.instanceRef === group.consumer.instanceRef ||
    operation.instance.instanceRef === group.producer.instanceRef ||
    operation.moduleName === group.producer.name;
}

function matchesRemoteName(remote: RuntimeRemote, value: string): boolean {
  return remote.name === value || remote.alias === value;
}

function sameExpose(left: string | undefined, right: string | undefined): boolean {
  return left === undefined || right === undefined
    ? left === right
    : normalizeExpose(left) === normalizeExpose(right);
}

function mergeRemote(left: RuntimeRemote, right: RuntimeRemote): RuntimeRemote {
  return { ...left, ...right };
}

function mergeProducer(
  left: ModulePerformanceModule["producer"],
  right: ModulePerformanceModule["producer"]
): ModulePerformanceModule["producer"] {
  return { ...left, ...right };
}

function compareModules(
  left: ModulePerformanceModule,
  right: ModulePerformanceModule
): number {
  return left.consumer.name.localeCompare(right.consumer.name) ||
    left.remote.name.localeCompare(right.remote.name) ||
    (left.expose ?? "").localeCompare(right.expose ?? "");
}

function bridgeKey(operation: BridgeOperationTrace): string {
  return `${operation.instance.instanceRef ?? ""}\u0000${operation.operationId ?? ""}\u0000${operation.bridgeId}\u0000${operation.startedAt}`;
}

function remoteKey(remote: RuntimeRemote): string {
  return `${remote.name}\u0000${remote.alias ?? ""}\u0000${remote.version ?? ""}`;
}

function normalizeIdentity(value: string): string {
  return value.toLowerCase().replace(/^global:/, "").replace(/[:@/._-]/g, "");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function unique<T>(values: T[], key: (value: T) => string = String): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const identity = key(value);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
