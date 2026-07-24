import { MfCoreError } from "./errors.js";
import {
  remotesMatch,
  selectConsumer,
  selectRemote,
  selectStatusInstances,
  visibleInstanceName,
  type ConsumerSelectors,
  type StatusSelectors
} from "./selection.js";
import type {
  BrowserObservabilitySnapshot,
  CompatibilitySummary,
  ModuleInfoResult,
  RuntimeInstance,
  RuntimeModuleInfo,
  RuntimeRelationship,
  RuntimeRemote,
  RuntimeReport,
  SelectionIssue,
  StatusConsumer,
  StatusResult
} from "./types.js";

export function createStatusResult(
  snapshot: BrowserObservabilitySnapshot,
  selectors: StatusSelectors,
  options: { verbose?: boolean } = {}
): StatusResult {
  assertInstanceState(snapshot);
  if (snapshot.state.instances.length === 0) {
    throw new MfCoreError({
      code: "MF_PAGE_NOT_FEDERATED",
      kind: "not_found",
      message: "The reader is available, but no Module Federation instance is present in the current page state.",
      facts: {
        observabilityMode: snapshot.observabilityMode,
        scope: snapshot.state.scope
      },
      candidates: [],
      recommendedActions: [{ type: "reopen-page" }]
    });
  }
  const selected = selectStatusInstances(snapshot.state, selectors);
  if (!selected.ok) throw selectionError(selected.issue);
  return {
    instances: selected.value.instances.map((instance) => ({
      instanceRef: instance.instanceRef,
      name: visibleInstanceName(instance),
      role: instance.role,
      consumers: consumersForInstance(
        instance.instanceRef,
        snapshot.state.instances,
        snapshot.state.relationships
      ),
      active: instance.active
    })),
    shared: filterGlobalShared(snapshot.globalShared, options.verbose === true)
  };
}

function consumersForInstance(
  producerInstanceRef: string,
  instances: readonly RuntimeInstance[],
  relationships: readonly RuntimeRelationship[]
): StatusConsumer[] {
  const byRef = new Map(
    instances.map((instance) => [instance.instanceRef, instance] as const)
  );
  const consumers = new Map<string, StatusConsumer>();
  for (const relationship of relationships) {
    if (
      relationship.status !== "resolved" ||
      relationship.producerInstanceRef !== producerInstanceRef
    ) {
      continue;
    }
    const consumer = byRef.get(relationship.consumerInstanceRef);
    consumers.set(relationship.consumerInstanceRef, {
      instanceRef: relationship.consumerInstanceRef,
      name: consumer === undefined
        ? "unknown"
        : visibleInstanceName(consumer)
    });
  }
  return Array.from(consumers.values()).sort((left, right) =>
    left.instanceRef.localeCompare(right.instanceRef)
  );
}

function filterGlobalShared(
  shared: BrowserObservabilitySnapshot["globalShared"],
  verbose: boolean
): StatusResult["shared"] {
  return Object.fromEntries(
    Object.entries(shared).sort(byKey).flatMap(([scope, packages]) => {
      const filteredPackages = Object.fromEntries(
        Object.entries(packages).sort(byKey).flatMap(([packageName, versions]) => {
          const filteredVersions = Object.fromEntries(
            Object.entries(versions)
              .sort(byKey)
              .filter(([, value]) => verbose || value.loaded)
              .map(([version, value]) => [
                version,
                verbose ? value : withoutFunctionSources(value)
              ])
          );
          return Object.keys(filteredVersions).length === 0
            ? []
            : [[packageName, filteredVersions]];
        })
      );
      return Object.keys(filteredPackages).length === 0
        ? []
        : [[scope, filteredPackages]];
    })
  );
}

function withoutFunctionSources(
  value: StatusResult["shared"][string][string][string]
): StatusResult["shared"][string][string][string] {
  const safeValue = { ...value };
  delete safeValue.lib;
  delete safeValue.get;
  const lib = withoutFunctionSource(value.lib);
  const get = withoutFunctionSource(value.get);
  if (lib !== undefined) safeValue.lib = lib;
  if (get !== undefined) safeValue.get = get;
  return safeValue;
}

function withoutFunctionSource(
  value: StatusResult["shared"][string][string][string]["lib"]
): StatusResult["shared"][string][string][string]["lib"] {
  return value?.location === undefined
    ? undefined
    : { location: { url: value.location.url } };
}

function byKey(
  left: readonly [string, unknown],
  right: readonly [string, unknown]
): number {
  return left[0].localeCompare(right[0]);
}

export function filterRelationshipsForInstances(
  relationships: readonly RuntimeRelationship[],
  instanceRefs: readonly string[]
): RuntimeRelationship[] {
  const selectedRefs = new Set(instanceRefs);
  return relationships.filter((relationship) =>
    selectedRefs.has(relationship.consumerInstanceRef) ||
    (relationship.producerInstanceRef !== undefined &&
      selectedRefs.has(relationship.producerInstanceRef)) ||
    relationship.candidateProducerInstanceRefs?.some((instanceRef) =>
      selectedRefs.has(instanceRef)
    ) === true
  );
}

export function createModuleInfoResult(
  snapshot: BrowserObservabilitySnapshot,
  consumerSelectors: ConsumerSelectors,
  remoteName?: string
): ModuleInfoResult {
  assertInstanceState(snapshot);
  const consumerSelection = selectConsumer(snapshot.state, consumerSelectors);
  if (!consumerSelection.ok) throw selectionError(consumerSelection.issue);
  const consumer = consumerSelection.value;
  const remoteSelection = selectRemote(consumer, remoteName);
  if (!remoteSelection.ok) throw selectionError(remoteSelection.issue);
  const selected = remoteSelection.value;
  const relationships = matchingRelationships(
    snapshot.state.relationships,
    consumer.instanceRef,
    selected.remote
  );
  const relationship = relationships.length === 1 ? relationships[0] : undefined;
  const reports = matchingReports(snapshot.reports, consumer, selected.remote);
  const runtimeModuleInfo = matchingRuntimeModuleInfo(
    snapshot.state.moduleInfo,
    selected.remote
  );
  const reportModuleInfo = reports.flatMap((report) => report.moduleInfo?.entries ?? []);
  const producer = relationship?.producerInstanceRef === undefined
    ? undefined
    : snapshot.state.instances.find(
        (instance) => instance.instanceRef === relationship.producerInstanceRef
      );

  const manifestUrl = firstDefined(
    selected.remote.entry && isManifestUrl(selected.remote.entry)
      ? selected.remote.entry
      : undefined,
    ...runtimeModuleInfo.map((entry) =>
      entry.entry && isManifestUrl(entry.entry) ? entry.entry : undefined
    ),
    ...reports.flatMap((report) => report.events.map((event) =>
      event.sanitizedUrl && isManifestUrl(event.sanitizedUrl)
        ? event.sanitizedUrl
        : undefined
    ))
  );
  const remoteEntryUrl = firstDefined(
    ...reportModuleInfo.map((entry) => entry.remoteEntry),
    selected.remote.entry && !isManifestUrl(selected.remote.entry)
      ? selected.remote.entry
      : undefined,
    ...reports.flatMap((report) => report.events.map((event) =>
      event.sanitizedUrl && /remoteEntry|\.m?js(?:[?#]|$)/i.test(event.sanitizedUrl)
        ? event.sanitizedUrl
        : undefined
    ))
  );
  const globalName = firstDefined(
    selected.remote.entryGlobalName,
    ...reportModuleInfo.map((entry) => entry.globalName)
  );
  const publicPath = firstDefined(...reportModuleInfo.map((entry) => entry.publicPath));
  const getPublicPath = firstDefined(...reportModuleInfo.map((entry) => entry.getPublicPath));
  const exposes = Array.from(new Set(
    reports.map((report) => report.expose).filter((value): value is string => value !== undefined)
  ));
  const warnings = createModuleWarnings({
    snapshot,
    selectedStatus: selected.status,
    relationship,
    relationshipCount: relationships.length,
    reports,
    manifestUrl,
    remoteEntryUrl,
    producer
  });
  const recommendedActions = moduleRecommendedActions(
    snapshot,
    selected.status,
    warnings
  );
  const firstLoadedAt = reports.length > 0
    ? Math.min(...reports.map((report) => report.startedAt))
    : undefined;

  return {
    schemaVersion: 1,
    command: "mf module-info",
    compatibility: createCompatibilitySummary(snapshot),
    consumer: {
      instanceRef: consumer.instanceRef,
      name: visibleInstanceName(consumer),
      ...(consumer.optionsVersion === undefined ? {} : { version: consumer.optionsVersion })
    },
    remote: {
      name: selected.remote.name,
      ...(selected.remote.alias === undefined ? {} : { alias: selected.remote.alias }),
      status: selected.status,
      ...(relationship?.producerInstanceRef === undefined
        ? {}
        : { producerInstanceRef: relationship.producerInstanceRef }),
      ...(relationship?.candidateProducerInstanceRefs === undefined
        ? {}
        : { candidateProducerInstanceRefs: relationship.candidateProducerInstanceRefs }),
      ...(manifestUrl === undefined ? {} : { manifestUrl }),
      snapshotSource: snapshotSource(reports, runtimeModuleInfo),
      ...(remoteEntryUrl === undefined ? {} : { remoteEntryUrl }),
      ...(globalName === undefined ? {} : { globalName }),
      ...(selected.remote.type === undefined ? {} : { type: selected.remote.type }),
      ...(publicPath === undefined ? {} : { publicPath }),
      ...(getPublicPath === undefined ? {} : { getPublicPath }),
      exposes,
      shared: producer?.shareScopes ?? [],
      dependencyRemotes: uniqueRemotes(runtimeModuleInfo.flatMap((entry) => entry.remotes ?? [])),
      cached: reports.length === 0
        ? "unknown"
        : reports.some((report) => report.summary.flags.cached),
      ...(firstLoadedAt === undefined ? {} : { firstLoadedAt })
    },
    warnings,
    recommendedActions
  };
}

export function createCompatibilitySummary(
  snapshot: BrowserObservabilitySnapshot
): CompatibilitySummary {
  const runtimeVersions = Array.from(new Set(
    snapshot.state.instances
      .map((instance) => instance.runtimeVersion)
      .filter((version): version is string => version !== undefined)
  ));
  const warnings: string[] = [];
  const recommendedActions: string[] = [];
  if (snapshot.observabilityVersion === "unknown") {
    warnings.push("The application reader does not expose its Observability Plugin version.");
  }
  if (snapshot.state.completeness.history === "partial") {
    warnings.push("Only current state and partial history can be confirmed.");
    recommendedActions.push(
      snapshot.state.completeness.recommendation ??
      "Run `openruntime open <url>` again before reproducing the loading path."
    );
  }
  if (snapshot.injection?.timing === "late") {
    warnings.push("The injected reader was installed after the MF runtime had already started.");
    recommendedActions.push("Reopen the page with `openruntime open <url>` to capture the full history.");
  }
  if (snapshot.state.scope.frame === "child") {
    warnings.push("This result covers only the current child frame/realm.");
  }
  for (const [name, capability] of Object.entries(snapshot.state.capabilities)) {
    if (!capability.available || capability.completeness !== "complete") {
      warnings.push(
        `${name} is ${capability.completeness}${capability.reason ? `: ${capability.reason}` : "."}`
      );
    }
  }
  return {
    observabilityVersion: snapshot.observabilityVersion,
    runtimeVersions,
    observabilityMode: snapshot.observabilityMode,
    scope: snapshot.state.scope,
    capabilities: snapshot.state.capabilities,
    completeness: snapshot.state.completeness,
    warnings: unique(warnings),
    recommendedActions: unique(recommendedActions)
  };
}

function assertInstanceState(snapshot: BrowserObservabilitySnapshot): void {
  const capability = snapshot.state.capabilities.instanceState;
  if (!capability.available) {
    throw new MfCoreError({
      code: "MF_INSTANCE_STATE_UNAVAILABLE",
      kind: "runtime",
      message: "The observability reader cannot provide safe instance state.",
      facts: {
        capability,
        observabilityMode: snapshot.observabilityMode,
        currentState: snapshot.state.completeness.currentState
      },
      candidates: [],
      recommendedActions: [
        { type: "configure-observability", capability: "instanceState" },
        { type: "reopen-page" }
      ]
    });
  }
}

function selectionError(issue: SelectionIssue): MfCoreError {
  return new MfCoreError(issue);
}

function matchingRelationships(
  relationships: RuntimeRelationship[],
  consumerInstanceRef: string,
  remote: RuntimeRemote
): RuntimeRelationship[] {
  return relationships.filter((relationship) =>
    relationship.consumerInstanceRef === consumerInstanceRef &&
    remotesMatch(relationship.remote, remote)
  );
}

function matchingReports(
  reports: RuntimeReport[],
  consumer: RuntimeInstance,
  remote: RuntimeRemote
): RuntimeReport[] {
  return reports.filter((report) =>
    report.instanceRef === consumer.instanceRef &&
    report.remote !== undefined &&
    remotesMatch(report.remote, remote)
  );
}

function matchingRuntimeModuleInfo(
  moduleInfo: RuntimeModuleInfo[],
  remote: RuntimeRemote
): RuntimeModuleInfo[] {
  return moduleInfo.filter((entry) => {
    const names = [remote.name, remote.alias].filter((name): name is string => name !== undefined);
    return names.includes(entry.name ?? "") ||
      names.includes(entry.key) ||
      (remote.entry !== undefined && entry.entry === remote.entry) ||
      names.some((name) => entry.key.includes(name));
  });
}

function snapshotSource(reports: RuntimeReport[], moduleInfo: RuntimeModuleInfo[]): string {
  const reportReason = firstDefined(...reports.map((report) => report.moduleInfo?.reason));
  if (reportReason !== undefined) return reportReason;
  const snapshotEvent = reports.flatMap((report) => report.events).find((event) =>
    /snapshot|manifest/i.test(`${event.phase} ${event.message ?? ""}`)
  );
  if (snapshotEvent !== undefined) return snapshotEvent.phase;
  const tag = firstDefined(...moduleInfo.map((entry) => entry.tag));
  return tag ?? "unknown";
}

function createModuleWarnings(options: {
  snapshot: BrowserObservabilitySnapshot;
  selectedStatus: "declared" | "loaded";
  relationship: RuntimeRelationship | undefined;
  relationshipCount: number;
  reports: RuntimeReport[];
  manifestUrl: string | undefined;
  remoteEntryUrl: string | undefined;
  producer: RuntimeInstance | undefined;
}): string[] {
  const warnings: string[] = [];
  if (options.selectedStatus === "declared") {
    warnings.push("The remote is declared but no load is confirmed; declaration data is not treated as a load result.");
  }
  if (options.relationshipCount > 1) {
    warnings.push("More than one relationship matches this consumer and remote.");
  }
  if (options.relationship?.status === "ambiguous") {
    warnings.push("The actual producer instance is ambiguous.");
  } else if (options.selectedStatus === "loaded" && options.relationship?.status === "unresolved") {
    warnings.push("The remote is loaded, but no current producer instance can be resolved.");
  }
  if (options.relationship?.producerInstanceRef !== undefined && options.producer === undefined) {
    warnings.push("The producer instance reference is no longer present in current state.");
  }
  if (options.snapshot.state.completeness.history === "partial") {
    warnings.push("Load timing and cache history may be incomplete.");
  }
  if (options.snapshot.state.capabilities.remoteTrace.available === false) {
    warnings.push(
      options.snapshot.state.capabilities.remoteTrace.reason ??
      "Remote trace capability is unavailable."
    );
  }
  if (options.selectedStatus === "loaded" && options.reports.length === 0) {
    warnings.push("Current loaded state is confirmed, but no matching public loading report is available.");
  }
  if (options.manifestUrl === undefined) warnings.push("No safe manifest URL is available.");
  if (options.remoteEntryUrl === undefined) warnings.push("No safe remoteEntry URL is available.");
  for (const report of options.reports) {
    warnings.push(...(report.diagnosis?.warnings ?? []));
  }
  return unique(warnings);
}

function moduleRecommendedActions(
  snapshot: BrowserObservabilitySnapshot,
  status: "declared" | "loaded",
  warnings: string[]
): string[] {
  const actions: string[] = [];
  if (status === "declared") {
    actions.push("Trigger the remote load, then run the same command again to inspect loaded facts.");
  }
  if (snapshot.state.completeness.history === "partial") {
    actions.push("Reopen the page with `openruntime open <url>` before reproducing the remote load.");
  }
  if (warnings.length > 0 && snapshot.state.capabilities.remoteTrace.available === false) {
    actions.push("Upgrade or configure the MF Observability Plugin so remoteTrace is available.");
  }
  return unique(actions);
}

function uniqueRemotes(remotes: RuntimeRemote[]): RuntimeRemote[] {
  const result: RuntimeRemote[] = [];
  for (const remote of remotes) {
    if (!result.some((candidate) => remotesMatch(candidate, remote))) result.push(remote);
  }
  return result;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
  return values.find((value): value is T => value !== undefined);
}

function isManifestUrl(value: string): boolean {
  return /(?:mf-manifest|manifest)\.json(?:[?#]|$)/i.test(value);
}
