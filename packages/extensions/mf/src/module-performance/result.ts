import { buildRemoteTrace } from "../remote/results.js";
import {
  isRemoteTraceReport,
  normalizeExpose,
  reportInstanceRef
} from "../remote/selection.js";
import { remotesMatch, visibleInstanceName } from "../selection.js";
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
  ModulePerformanceAssetTiming,
  ModulePerformanceBottleneck,
  ModulePerformanceBrowserSnapshot,
  ModulePerformanceCodeUsage,
  ModulePerformanceExposeAssetsSnapshot,
  ModulePerformanceFinding,
  ModulePerformanceInterval,
  ModulePerformanceManifest,
  ModulePerformanceModule,
  ModulePerformanceOperation,
  ModulePerformancePageImpact,
  ModulePerformancePreloadAssetRole,
  ModulePerformancePreloadTiming,
  ModulePerformanceResourceSnapshot,
  ModulePerformanceResult,
  ModulePerformanceSelectors,
  ModulePerformanceTiming,
  ModulePerformanceUnobservedRemote
} from "./types.js";

interface ModuleGroup {
  consumer: ModulePerformanceModule["consumer"];
  producer: ModulePerformanceModule["producer"];
  remote: RuntimeRemote;
  expose?: string;
  traces: RemoteTraceSummary[];
  preloadTraces: RemoteTraceSummary[];
}

const MEANINGFUL_DURATION = 50;

export function createModulePerformanceResult(
  snapshot: BrowserObservabilitySnapshot,
  performance: ModulePerformanceBrowserSnapshot | null,
  selectors: ModulePerformanceSelectors = {}
): ModulePerformanceResult {
  const groups = collectGroups(snapshot, selectors);
  const modules = groups.map((group) => createModule(group, performance))
    .sort(compareModules);
  const unobservedRemotes = collectUnobservedRemotes(snapshot, groups, selectors);
  const operations = modules.flatMap((module) => module.operations);

  return {
    schemaVersion: 1,
    command: "mf module-perf",
    observedAt: snapshot.state.observedAt,
    page: createPageResult(performance),
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
      unobservedRemoteCount: unobservedRemotes.length
    },
    modules,
    unobservedRemotes
  };
}

function createPageResult(
  performance: ModulePerformanceBrowserSnapshot | null
): ModulePerformanceResult["page"] {
  if (performance === null) return { lcpStatus: "not-observed" };
  const scripts = performance.resources.filter((resource) =>
    resource.declarations?.includes("script")
  ).map(roundResource);
  const document = performance.page.document;
  return {
    clock: { origin: "navigationStart", unit: "ms" },
    ...(document === undefined
      ? {}
      : {
          document: {
            start: round(document.start),
            ...(document.responseStart === undefined
              ? {}
              : { responseStart: round(document.responseStart) }),
            end: round(document.end),
            duration: round(document.duration)
          }
        }),
    ...(performance.page.fp === undefined ? {} : { fp: round(performance.page.fp) }),
    ...(performance.page.fcp === undefined ? {} : { fcp: round(performance.page.fcp) }),
    ...(performance.page.lcp === undefined ? {} : { lcp: round(performance.page.lcp) }),
    lcpStatus: performance.page.lcpStatus,
    ...(scripts.length === 0 ? {} : { scripts })
  };
}

function roundResource(
  resource: ModulePerformanceResourceSnapshot
): ModulePerformanceResourceSnapshot {
  return {
    ...resource,
    start: round(resource.start),
    end: round(resource.end),
    duration: round(resource.duration)
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
        traces: [trace],
        preloadTraces: []
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
  for (const report of snapshot.reports) {
    if (!isRemoteTraceReport(report, "preload") || report.remote === undefined) {
      continue;
    }
    const trace = buildRemoteTrace(report, "preload");
    for (const group of groups) {
      if (preloadMatchesGroup(trace, group)) group.preloadTraces.push(trace);
    }
  }
  for (const group of groups) {
    group.preloadTraces.sort((left, right) => left.startedAt - right.startedAt);
  }
  return groups;
}

function preloadMatchesGroup(
  trace: RemoteTraceSummary,
  group: ModuleGroup
): boolean {
  if (trace.remote === undefined || trace.instanceRef !== group.consumer.instanceRef ||
      !remotesMatch(trace.remote, group.remote)) return false;
  return trace.expose === undefined || group.expose === undefined ||
    sameExpose(trace.expose, group.expose);
}

function createModule(
  group: ModuleGroup,
  performance: ModulePerformanceBrowserSnapshot | null
): ModulePerformanceModule {
  const operations = group.traces.map((trace) =>
    createOperation(group, trace, performance)
  );
  return {
    consumer: group.consumer,
    producer: group.producer,
    remote: group.remote,
    ...(group.expose === undefined ? {} : { expose: group.expose }),
    operations
  };
}

function createOperation(
  group: ModuleGroup,
  trace: RemoteTraceSummary,
  performance: ModulePerformanceBrowserSnapshot | null
): ModulePerformanceOperation {
  let timing = createTiming(trace, performance);
  const manifest = createManifest(group, timing, performance);
  const preloadJs = createPreloadJs(
    group.preloadTraces,
    trace,
    manifest,
    performance
  );
  timing = addRemoteEntryResourceTiming(timing, manifest);
  timing = addRemoteEntryBlockingTiming(timing);
  const pageImpact = createPageImpact(timing, performance);
  const bottleneck = createBottleneck(trace, timing, manifest);
  const codeUsage = createCodeUsage(bottleneck, manifest);
  return {
    traceId: trace.traceId,
    outcome: trace.outcome,
    timing,
    manifest,
    preloadJs,
    pageImpact,
    bottleneck,
    findings: createFindings(
      trace,
      timing,
      manifest,
      pageImpact,
      bottleneck,
      codeUsage
    ),
    codeUsage
  };
}

function createTiming(
  trace: RemoteTraceSummary,
  performance: ModulePerformanceBrowserSnapshot | null
): ModulePerformanceTiming {
  const timeOrigin = performance?.page.timeOrigin ?? trace.startedAt;
  const loadRemote = intervalFromEpoch(
    trace.startedAt,
    trace.endedAt,
    trace.duration,
    timeOrigin
  );
  const manifest = stageInterval(trace, "manifest", timeOrigin);
  const remoteEntry = stageInterval(trace, "remoteEntry", timeOrigin);
  const containerInit = stageInterval(trace, "containerInit", timeOrigin);
  const get = stageInterval(trace, "expose", timeOrigin);
  const factory = stageInterval(trace, "factory", timeOrigin);
  return {
    loadRemote,
    ...(manifest === undefined ? {} : { manifest }),
    ...(remoteEntry === undefined ? {} : { remoteEntry }),
    ...(containerInit === undefined ? {} : { containerInit }),
    ...(get === undefined ? {} : { get }),
    ...(factory === undefined ? {} : { factory })
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

function createPreloadJs(
  preloadTraces: RemoteTraceSummary[],
  loadTrace: RemoteTraceSummary,
  manifest: ModulePerformanceManifest,
  performance: ModulePerformanceBrowserSnapshot | null
): ModulePerformancePreloadTiming[] {
  if (performance === null) return [];
  const timeOrigin = performance.page.timeOrigin;
  const official = preloadTraces.filter((trace) =>
    trace.startedAt <= loadTrace.startedAt
  ).flatMap((preloadTrace) => {
    const exactExpose = loadTrace.expose === undefined ||
      (preloadTrace.expose !== undefined &&
        sameExpose(preloadTrace.expose, loadTrace.expose));
    return preloadTrace.stages.flatMap((stage) =>
      stage.resources.flatMap((resource): ModulePerformancePreloadTiming[] => {
        if (resource.initiator !== "preloadRemote" ||
            !/^(?:js|script)$/i.test(resource.type) ||
            resource.url === undefined) return [];
        const role = preloadAssetRole(resource.url, manifest);
        if (role === undefined && !exactExpose) return [];
        return [{
          asset: sanitizeUrl(resource.url) ?? resource.url,
          role: role ?? "remote-js",
          initiators: ["preloadRemote"],
          start: round(relativeTime(resource.startedAt, timeOrigin)),
          ...(resource.endedAt === undefined
            ? {}
            : { end: round(relativeTime(resource.endedAt, timeOrigin)) }),
          ...(resource.duration === undefined
            ? {}
            : { duration: round(resource.duration) }),
          ...(resource.outcome === undefined ? {} : { outcome: resource.outcome })
        }];
      })
    );
  });
  const declared = performance.resources.flatMap((resource) => {
    const preloadDeclarations = resource.declarations?.filter((declaration) =>
      declaration === "preload" || declaration === "modulepreload"
    ) ?? [];
    if (preloadDeclarations.length === 0) return [];
    const role = preloadAssetRole(resource.url, manifest);
    if (role === undefined) return [];
    return [{
      asset: resource.url,
      role,
      initiators: preloadDeclarations.map((declaration) =>
        declaration === "modulepreload" ? "modulepreload" : "link-preload"
      ),
      start: round(resource.start),
      end: round(resource.end),
      duration: round(resource.duration)
    } satisfies ModulePerformancePreloadTiming];
  });
  return mergePreloadTimings([...official, ...declared]);
}

function preloadAssetRole(
  resourceUrl: string,
  manifest: ModulePerformanceManifest
): ModulePerformancePreloadAssetRole | undefined {
  if (manifest.status !== "available") return undefined;
  const remoteEntryUrls = [
    manifest.remoteEntryResource?.url,
    ...assetUrls(manifest.remoteEntry ?? "", manifest.publicPath)
  ].filter((value): value is string => value !== undefined && value.length > 0);
  if (remoteEntryUrls.some((candidate) =>
    resourcesMatch(resourceUrl, candidate)
  )) return "remoteEntry";
  for (const asset of manifest.assets) {
    const candidates = [
      asset.url,
      ...assetUrls(asset.asset, manifest.publicPath)
    ].filter((value): value is string => value !== undefined && value.length > 0);
    if (candidates.some((candidate) => resourcesMatch(resourceUrl, candidate))) {
      return asset.kind === "sync" ? "expose-sync" : "expose-async";
    }
  }
  return undefined;
}

function resourcesMatch(left: string, right: string): boolean {
  const sanitizedLeft = sanitizeUrl(left);
  const sanitizedRight = sanitizeUrl(right);
  return sanitizedLeft !== undefined && sanitizedRight !== undefined &&
    (sanitizedLeft === sanitizedRight || sameResourcePath(sanitizedLeft, sanitizedRight));
}

function mergePreloadTimings(
  values: ModulePerformancePreloadTiming[]
): ModulePerformancePreloadTiming[] {
  const merged: ModulePerformancePreloadTiming[] = [];
  for (const value of values.sort((left, right) =>
    left.start - right.start || left.asset.localeCompare(right.asset)
  )) {
    const existing = merged.find((candidate) =>
      resourcesMatch(candidate.asset, value.asset) &&
      Math.abs(candidate.start - value.start) <= 10
    );
    if (existing === undefined) {
      merged.push(value);
      continue;
    }
    existing.initiators = unique([
      ...existing.initiators,
      ...value.initiators
    ]) as ModulePerformancePreloadTiming["initiators"];
    if (existing.end === undefined && value.end !== undefined) existing.end = value.end;
    if (existing.duration === undefined && value.duration !== undefined) {
      existing.duration = value.duration;
    }
    if (existing.outcome === undefined && value.outcome !== undefined) {
      existing.outcome = value.outcome;
    }
    if (existing.role === "remote-js" && value.role !== "remote-js") {
      existing.role = value.role;
    }
  }
  return merged;
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

function addRemoteEntryBlockingTiming(
  timing: ModulePerformanceTiming
): ModulePerformanceTiming {
  const remoteEntry = timing.remoteEntry;
  if (remoteEntry?.end === undefined) return timing;
  const waitEnds = [timing.get?.start, timing.loadRemote.end]
    .filter((value): value is number => value !== undefined);
  if (waitEnds.length === 0) return timing;
  const waitEnd = Math.min(...waitEnds);
  const blockingDuration = Math.max(
    0,
    Math.min(remoteEntry.end, waitEnd) -
      Math.max(remoteEntry.start, timing.loadRemote.start)
  );
  return {
    ...timing,
    remoteEntry: {
      ...remoteEntry,
      blockingDuration: round(blockingDuration)
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
  const hasBodySize = (selected.encodedBodySize ?? 0) > 0 ||
    (selected.decodedBodySize ?? 0) > 0;
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
    ...(selected.transferSize === undefined ||
      (selected.transferSize === 0 && !hasBodySize)
      ? {}
      : { transferSize: selected.transferSize }),
    ...(selected.encodedBodySize === undefined || selected.encodedBodySize === 0
      ? {}
      : { encodedBodySize: selected.encodedBodySize }),
    ...(selected.decodedBodySize === undefined || selected.decodedBodySize === 0
      ? {}
      : { decodedBodySize: selected.decodedBodySize }),
    ...(selected.cache === undefined || selected.cache === "unknown"
      ? {}
      : { cache: selected.cache })
  };
}

function createPageImpact(
  timing: ModulePerformanceTiming,
  performance: ModulePerformanceBrowserSnapshot | null
): ModulePerformancePageImpact {
  if (performance === null) return {};
  return {
    ...(performance.page.fp === undefined
      ? {}
      : { fp: pageDelta(timing.loadRemote, performance.page.fp) }),
    ...(performance.page.fcp === undefined
      ? {}
      : { fcp: pageDelta(timing.loadRemote, performance.page.fcp) }),
    ...(performance.page.lcp === undefined
      ? {}
      : { lcp: pageDelta(timing.loadRemote, performance.page.lcp) })
  };
}

function pageDelta(
  loadRemote: ModulePerformanceInterval,
  milestone: number
): { startDelta: number; endDelta?: number } {
  return {
    startDelta: signedDelta(loadRemote.start, milestone),
    ...(loadRemote.end === undefined
      ? {}
      : { endDelta: signedDelta(loadRemote.end, milestone) })
  };
}

function signedDelta(boundary: number, milestone: number): number {
  const delta = round(boundary - milestone);
  return delta === 0 ? 0 : delta;
}

function createBottleneck(
  trace: RemoteTraceSummary,
  timing: ModulePerformanceTiming,
  manifest: ModulePerformanceManifest
): ModulePerformanceBottleneck {
  if (trace.outcome !== "success" && trace.outcome !== "recovered") {
    return {
      type: "unknown",
      confidence: "low",
      evidence: [
        `loadRemote outcome is ${trace.outcome}; performance bottlenecks are diagnosed only after a successful result.`
      ]
    };
  }
  const getDuration = timing.get?.duration;
  const resourceDuration = getDuration === undefined
    ? 0
    : syncResourceUnionDuringGet(manifest.assets, timing.get as ModulePerformanceInterval);
  const exposeResource = getDuration !== undefined && resourceDuration >= 20 &&
    resourceDuration >= getDuration * 0.5;
  const candidates = [
    durationCandidate("remoteEntry", timing.remoteEntry?.blockingDuration),
    durationCandidate(exposeResource ? "expose-resource" : "get", getDuration),
    durationCandidate("factory", timing.factory?.duration)
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
  const second = candidates[1];
  const mixed = second !== undefined && top.duration > 0 &&
    second.duration >= top.duration * 0.85;
  const type = mixed ? "mixed" : top.type;
  const duration = mixed
    ? top.duration + (second?.duration ?? 0)
    : top.duration;
  const evidence = mixed && second !== undefined
    ? [
        candidateEvidence(top, timing),
        candidateEvidence(second, timing)
      ]
    : type === "remoteEntry"
      ? remoteEntryEvidence(timing, top.duration)
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
  const documentation = "https://github.com/2heal1/divebell/blob/main/docs/code-usage-analysis.md";
  const assets = manifest.assets.filter((asset) =>
    asset.kind === "sync" && asset.match === "matched" && asset.url !== undefined
  ).map((asset) => asset.url as string);
  if (manifest.status !== "available") {
    return {
      status: "unavailable",
      assets: [],
      reason: "Manifest expose assets are unavailable, so Code Usage cannot target this expose precisely.",
      documentation
    };
  }
  if (!["expose-resource", "get", "mixed"].includes(bottleneck.type) ||
      assets.length === 0) {
    return {
      status: "not-applicable",
      assets: [],
      reason: bottleneck.type === "remoteEntry"
        ? "Code Usage is not suitable for splitting remoteEntry; use its blocking and request-lifecycle timing to decide between earlier loading and delivery investigation."
        : "The measured bottleneck is not attributable to a loaded expose JavaScript asset.",
      documentation
    };
  }
  return {
    status: "recommended",
    assets: unique(assets),
    reason: "Run Code Usage separately for these expose assets before changing code splitting; coverage changes runtime behavior and is not mixed into this measurement.",
    documentation
  };
}

function createFindings(
  trace: RemoteTraceSummary,
  timing: ModulePerformanceTiming,
  manifest: ModulePerformanceManifest,
  impact: ModulePerformancePageImpact,
  bottleneck: ModulePerformanceBottleneck,
  codeUsage: ModulePerformanceCodeUsage
): ModulePerformanceFinding[] {
  const findings: ModulePerformanceFinding[] = [];
  if (trace.outcome !== "success" && trace.outcome !== "recovered") {
    const failed = trace.outcome === "error";
    return [{
      id: failed ? "resolve-load-failure" : "complete-load-observation",
      severity: failed ? "warning" : "info",
      title: failed
        ? "Module loading failed before performance could be diagnosed"
        : `Module loading outcome is ${trace.outcome}`,
      evidence: [
        `loadRemote outcome: ${trace.outcome}.`,
        `Trace: ${trace.traceId}.`
      ]
    }];
  }
  const remoteEntryBlocking = timing.remoteEntry?.blockingDuration ?? 0;
  if (bottleneck.type === "remoteEntry" &&
      remoteEntryBlocking >= MEANINGFUL_DURATION) {
    const remoteEntry = manifest.remoteEntryResource?.url ?? manifest.remoteEntry;
    const requestDelay = Math.max(
      0,
      (timing.remoteEntry?.start ?? timing.loadRemote.start) -
        timing.loadRemote.start
    );
    const preloadCandidate = startedNoLaterThanFcp(impact) &&
      requestDelay >= MEANINGFUL_DURATION;
    findings.push({
      id: preloadCandidate
        ? "preload-remote-entry"
        : "inspect-remote-entry-delivery",
      severity: "warning",
      title: preloadCandidate
        ? "remoteEntry starts after the initial module load needs it"
        : "remoteEntry request lifecycle is delaying module access",
      evidence: [
        ...bottleneck.evidence,
        ...(requestDelay <= 0
          ? ["The remoteEntry request started no later than loadRemote."]
          : [`The remoteEntry request started ${round(requestDelay)} ms after loadRemote began.`]),
        ...fcpStartEvidence(impact),
        ...(remoteEntry === undefined ? [] : [`remoteEntry: ${remoteEntry}.`])
      ]
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
      const shouldPreload = startedNoLaterThanFcp(impact);
      findings.push({
        id: shouldPreload ? "preload-expose-assets" : "defer-expose-assets",
        severity: shouldPreload ? "warning" : "info",
        title: shouldPreload
          ? "Expose JavaScript starts too late for the initial page load"
          : "Expose JavaScript is loaded after FCP",
        evidence: [
          ...assetNames.map((asset) => `${asset} loaded after get started.`),
          ...fcpStartEvidence(impact)
        ]
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
      ]
    });
  }
  if ((timing.factory?.duration ?? 0) >= MEANINGFUL_DURATION &&
      (bottleneck.type === "factory" || bottleneck.type === "mixed")) {
    findings.push({
      id: "profile-factory",
      severity: "warning",
      title: "Module initialization is expensive",
      evidence: [`factory took ${round(timing.factory?.duration ?? 0)} ms.`]
    });
  }
  if (codeUsage.status === "recommended") {
    findings.push({
      id: "inspect-expose-code-usage",
      severity: "info",
      title: "Expose assets are suitable for a separate Code Usage pass",
      evidence: codeUsage.assets.map((asset) => `Measured expose asset: ${asset}.`)
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
      ]
    });
  }
  return findings;
}

function startedNoLaterThanFcp(impact: ModulePerformancePageImpact): boolean {
  return impact.fcp !== undefined && impact.fcp.startDelta <= 0;
}

function fcpStartEvidence(impact: ModulePerformancePageImpact): string[] {
  const delta = impact.fcp?.startDelta;
  if (delta === undefined) return [];
  if (delta === 0) return ["loadRemote started at FCP."];
  return [
    `loadRemote started ${round(Math.abs(delta))} ms ${delta < 0 ? "before" : "after"} FCP.`
  ];
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
  return duration === undefined || !Number.isFinite(duration) || duration <= 0
    ? undefined
    : { type, duration };
}

function candidateEvidence(
  candidate: {
    type: Exclude<ModulePerformanceBottleneck["type"], "mixed" | "unknown">;
    duration: number;
  },
  timing: ModulePerformanceTiming
): string {
  return candidate.type === "remoteEntry"
    ? remoteEntryEvidence(timing, candidate.duration)[0] as string
    : `${candidate.type} took ${round(candidate.duration)} ms.`;
}

function remoteEntryEvidence(
  timing: ModulePerformanceTiming,
  blockingDuration: number
): string[] {
  const lifecycleDuration = timing.remoteEntry?.duration;
  return [
    `remoteEntry blocked module loading for ${round(blockingDuration)} ms.`,
    ...(lifecycleDuration === undefined ||
      Math.abs(lifecycleDuration - blockingDuration) < 0.1
      ? []
      : [`Its observed request lifecycle was ${round(lifecycleDuration)} ms.`])
  ];
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
