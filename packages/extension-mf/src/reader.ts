import type {
  BrowserObservabilitySnapshot,
  BrowserReadResult,
  BridgeRouteSummary,
  Capability,
  CapabilityName,
  GlobalSharedState,
  GlobalSharedVersion,
  InjectionMarker,
  RuntimeBridgeInfo,
  RuntimeBridgeState,
  RuntimeInstance,
  RuntimeModuleInfo,
  RuntimeReportEvent,
  RuntimeResource,
  RuntimeRelationship,
  RuntimeRemote,
  RuntimeReport,
  RuntimeShared,
  RuntimeState,
  ShareScope,
  SharedCandidate,
  SharedConflict,
  SharedRegistration,
  SharedVersion
} from "./types.js";

const capabilityNames: CapabilityName[] = [
  "instanceState",
  "remoteTrace",
  "sharedState",
  "sharedTrace",
  "bridgeTrace"
];

const MF_BROWSER_READ_SCRIPT_TEMPLATE = `(() => {
  const includeFunctionSource = __OPENRUNTIME_MF_INCLUDE_FUNCTION_SOURCE__;
  const marker = globalThis.__MF_OBSERVABILITY_INJECTION__;
  const readers = globalThis.__FEDERATION__?.__OBSERVABILITY__;
  const availableScopes = readers && typeof readers === "object"
    ? Object.keys(readers)
    : [];
  const compatibleScopes = availableScopes.filter((scope) => {
    const reader = readers[scope];
    return reader && typeof reader === "object" &&
      typeof reader.getRuntimeState === "function";
  });
  const applicationScopes = compatibleScopes.filter((scope) => scope !== "chrome_extension");
  const isRecord = (value) =>
    typeof value === "object" && value !== null && !Array.isArray(value);
  const safeText = (value, limit = 240) =>
    typeof value === "string" && value.length > 0
      ? value.slice(0, limit)
      : undefined;
  const safeKey = (value, limit) => {
    const key = safeText(value, limit);
    return key === undefined ||
        key === "__proto__" ||
        key === "prototype" ||
        key === "constructor"
      ? undefined
      : key;
  };
  const safeStringArray = (value) =>
    Array.isArray(value)
      ? Array.from(new Set(value
          .map((item) => safeText(item, 160))
          .filter((item) => item !== undefined)))
          .slice(0, 100)
          .sort()
      : [];
  const functionSource = (value) => {
    if (!includeFunctionSource || typeof value !== "function") return undefined;
    try {
      return {
        source: Function.prototype.toString.call(value).slice(0, 1000)
      };
    } catch {
      return { source: "[function source unavailable]" };
    }
  };
  const safeShareConfig = (value) => {
    if (!isRecord(value)) return undefined;
    const requiredVersion = value.requiredVersion === false
      ? false
      : safeText(value.requiredVersion, 160);
    const config = {
      ...(requiredVersion === undefined ? {} : { requiredVersion }),
      ...(typeof value.singleton === "boolean" ? { singleton: value.singleton } : {}),
      ...(typeof value.eager === "boolean" ? { eager: value.eager } : {}),
      ...(typeof value.strictVersion === "boolean"
        ? { strictVersion: value.strictVersion }
        : {}),
      ...(typeof value.layer === "string" || value.layer === null
        ? { layer: value.layer }
        : {})
    };
    return Object.keys(config).length === 0 ? undefined : config;
  };
  const safeSharedValue = (value) => {
    if (!isRecord(value)) return undefined;
    const from = safeText(value.from, 160);
    const scope = safeStringArray(value.scope);
    const deps = safeStringArray(value.deps);
    const strategy = safeText(value.strategy, 80);
    const shareConfig = safeShareConfig(value.shareConfig);
    const lib = functionSource(value.lib);
    const get = functionSource(value.get);
    return {
      ...(from === undefined ? {} : { from }),
      useIn: safeStringArray(value.useIn),
      loaded: value.loaded === true || typeof value.lib === "function",
      ...(value.loading === undefined ? {} : { loading: value.loading != null }),
      ...(scope.length === 0 ? {} : { scope }),
      ...(deps.length === 0 ? {} : { deps }),
      ...(typeof value.eager === "boolean" ? { eager: value.eager } : {}),
      ...(strategy === undefined ? {} : { strategy }),
      ...(shareConfig === undefined ? {} : { shareConfig }),
      ...(lib === undefined ? {} : { lib }),
      ...(get === undefined ? {} : { get })
    };
  };
  const readGlobalShared = () => {
    const root = globalThis.__FEDERATION__?.__SHARE__;
    if (!isRecord(root)) return {};
    const result = Object.create(null);
    const seenInstanceMaps = new Set();
    for (const instanceMap of Object.values(root).slice(0, 100)) {
      if (!isRecord(instanceMap) || seenInstanceMaps.has(instanceMap)) continue;
      seenInstanceMaps.add(instanceMap);
      for (const [rawScope, packages] of Object.entries(instanceMap).slice(0, 100)) {
        const scope = safeKey(rawScope, 120);
        if (scope === undefined || !isRecord(packages)) continue;
        const scopeResult = result[scope] || (result[scope] = Object.create(null));
        for (const [rawPackage, versions] of Object.entries(packages).slice(0, 200)) {
          const packageName = safeKey(rawPackage, 240);
          if (packageName === undefined || !isRecord(versions)) continue;
          const packageResult =
            scopeResult[packageName] ||
            (scopeResult[packageName] = Object.create(null));
          for (const [rawVersion, rawShared] of Object.entries(versions).slice(0, 50)) {
            const version = safeKey(rawVersion, 120);
            const shared = safeSharedValue(rawShared);
            if (version === undefined || shared === undefined) continue;
            const existing = packageResult[version];
            if (existing === undefined) {
              packageResult[version] = shared;
              continue;
            }
            const preferExisting = existing.loaded && !shared.loaded;
            packageResult[version] = {
              ...(preferExisting ? shared : existing),
              ...(preferExisting ? existing : shared),
              useIn: Array.from(new Set([
                ...existing.useIn,
                ...shared.useIn
              ])).sort(),
              loaded: existing.loaded || shared.loaded
            };
          }
        }
      }
    }
    return result;
  };

  if (applicationScopes.length > 1) {
    return {
      ok: false,
      reason: "multiple-readers",
      message: "Multiple application observability readers are available.",
      availableScopes,
      compatibleScopes,
      marker
    };
  }

  const selectedScope = applicationScopes[0] ??
    (compatibleScopes.includes("chrome_extension") ? "chrome_extension" : undefined);
  if (selectedScope === undefined) {
    return {
      ok: false,
      reason: availableScopes.length > 0 ? "incompatible" : "unavailable",
      message: availableScopes.length > 0
        ? "No reader exposes the MF-Obs-00 getRuntimeState interface."
        : "No Module Federation observability reader is available.",
      availableScopes,
      compatibleScopes,
      marker
    };
  }

  try {
    const reader = readers[selectedScope];
    const state = reader.getRuntimeState();
    if (!state || state.schemaVersion !== 1) {
      return {
        ok: false,
        reason: "incompatible",
        message: "The observability runtime-state schema is incompatible.",
        availableScopes,
        compatibleScopes,
        marker
      };
    }
    const reports = typeof reader.getReports === "function"
      ? reader.getReports({ limit: 200 })
      : [];
    return {
      ok: true,
      selectedScope,
      mode: selectedScope === "chrome_extension" ? "injected" : "application",
      observabilityVersion:
        selectedScope === "chrome_extension" && typeof marker?.observabilityVersion === "string"
          ? marker.observabilityVersion
          : "unknown",
      availableScopes,
      compatibleScopes,
      marker,
      state,
      reports,
      globalShared: readGlobalShared()
    };
  } catch (error) {
    return {
      ok: false,
      reason: "reader-error",
      message: error instanceof Error ? error.message : String(error),
      availableScopes,
      compatibleScopes,
      marker
    };
  }
})()`;

export const MF_BROWSER_READ_SCRIPT = createBrowserReadScript(false);

function createBrowserReadScript(includeFunctionSource: boolean): string {
  return MF_BROWSER_READ_SCRIPT_TEMPLATE.replace(
    "__OPENRUNTIME_MF_INCLUDE_FUNCTION_SOURCE__",
    includeFunctionSource ? "true" : "false"
  );
}

export async function readMfObservability(browser: {
  eval<T = unknown>(script: string): Promise<T>;
}, options: { verbose?: boolean } = {}): Promise<BrowserReadResult> {
  const value = await browser.eval<unknown>(
    createBrowserReadScript(options.verbose === true)
  );
  return parseBrowserReadResult(value);
}

export function parseBrowserReadResult(value: unknown): BrowserReadResult {
  const record = asRecord(value, "browser response");
  if (record.ok === true) {
    return {
      ok: true,
      snapshot: parseSnapshot(record)
    };
  }
  if (record.ok !== false) {
    throw new Error("MF observability browser response is missing an ok flag.");
  }
  const reason = requiredString(record.reason, "browser response reason");
  if (!["unavailable", "multiple-readers", "incompatible", "reader-error"].includes(reason)) {
    throw new Error(`Unsupported MF observability browser response reason: ${reason}`);
  }
  const injection = optionalInjection(record.marker);
  return {
    ok: false,
    reason: reason as Exclude<BrowserReadResult, { ok: true }>["reason"],
    message: requiredString(record.message, "browser response message"),
    availableScopes: stringArray(record.availableScopes, "available scopes"),
    compatibleScopes: stringArray(record.compatibleScopes, "compatible scopes"),
    ...(injection === undefined ? {} : { injection })
  };
}

function parseSnapshot(record: Record<string, unknown>): BrowserObservabilitySnapshot {
  const mode = requiredString(record.mode, "observability mode");
  if (mode !== "injected" && mode !== "application") {
    throw new Error(`Unsupported observability mode: ${mode}`);
  }
  const injection = optionalInjection(record.marker);
  return {
    observabilityMode: mode,
    observabilityVersion: requiredString(record.observabilityVersion, "observability version"),
    selectedScope: requiredString(record.selectedScope, "selected scope"),
    availableScopes: stringArray(record.availableScopes, "available scopes"),
    compatibleScopes: stringArray(record.compatibleScopes, "compatible scopes"),
    ...(injection === undefined ? {} : { injection }),
    state: parseRuntimeState(record.state),
    reports: array(record.reports, "reports").map(parseReport),
    globalShared: parseGlobalShared(record.globalShared)
  };
}

function parseGlobalShared(value: unknown): GlobalSharedState {
  if (value === undefined) return {};
  return Object.fromEntries(
    Object.entries(asRecord(value, "global shared state")).map(
      ([scope, rawPackages]) => [
        scope,
        Object.fromEntries(
          Object.entries(asRecord(rawPackages, `shared scope ${scope}`)).map(
            ([packageName, rawVersions]) => [
              packageName,
              Object.fromEntries(
                Object.entries(
                  asRecord(rawVersions, `shared package ${packageName}`)
                ).map(([version, rawShared]) => [
                  version,
                  parseGlobalSharedVersion(rawShared)
                ])
              )
            ]
          )
        )
      ]
    )
  );
}

function parseGlobalSharedVersion(value: unknown): GlobalSharedVersion {
  const record = asRecord(value, "global shared version");
  const shareConfigRecord = record.shareConfig === undefined
    ? undefined
    : asRecord(record.shareConfig, "global shared shareConfig");
  const requiredVersion = shareConfigRecord?.requiredVersion === false
    ? false
    : optionalString(
        shareConfigRecord?.requiredVersion,
        "global shared requiredVersion"
      );
  const layer = shareConfigRecord?.layer;
  if (layer !== undefined && layer !== null && typeof layer !== "string") {
    throw new Error("global shared layer must be a string or null.");
  }
  const shareConfig = shareConfigRecord === undefined
    ? undefined
    : compact({
        requiredVersion,
        singleton: optionalBoolean(
          shareConfigRecord.singleton,
          "global shared singleton"
        ),
        eager: optionalBoolean(shareConfigRecord.eager, "global shared eager"),
        strictVersion: optionalBoolean(
          shareConfigRecord.strictVersion,
          "global shared strictVersion"
        ),
        layer: layer as string | null | undefined
      });
  return compact({
    from: optionalString(record.from, "global shared provider"),
    useIn: stringArray(record.useIn, "global shared useIn"),
    loaded: requiredBoolean(record.loaded, "global shared loaded"),
    loading: optionalBoolean(record.loading, "global shared loading"),
    scope: record.scope === undefined
      ? undefined
      : stringArray(record.scope, "global shared scope"),
    deps: record.deps === undefined
      ? undefined
      : stringArray(record.deps, "global shared deps"),
    eager: optionalBoolean(record.eager, "global shared eager"),
    strategy: optionalString(record.strategy, "global shared strategy"),
    shareConfig,
    lib: parseFunctionSource(record.lib, "global shared lib"),
    get: parseFunctionSource(record.get, "global shared get")
  }) as GlobalSharedVersion;
}

function parseFunctionSource(
  value: unknown,
  label: string
): { source: string } | undefined {
  if (value === undefined) return undefined;
  const record = asRecord(value, label);
  return { source: requiredString(record.source, `${label} source`) };
}

export function parseRuntimeState(value: unknown): RuntimeState {
  const record = asRecord(value, "runtime state");
  if (record.schemaVersion !== 1) {
    throw new Error("MF runtime state schemaVersion must be 1.");
  }
  const scope = asRecord(record.scope, "runtime state scope");
  const completeness = asRecord(record.completeness, "runtime state completeness");
  if (completeness.currentState !== "complete") {
    throw new Error("MF runtime current state must be marked complete.");
  }
  if (completeness.history !== "complete" && completeness.history !== "partial") {
    throw new Error("MF runtime history completeness is invalid.");
  }
  const rawCapabilities = asRecord(record.capabilities, "runtime state capabilities");
  const capabilities = Object.fromEntries(capabilityNames.map((name) => [
    name,
    parseCapability(rawCapabilities[name], name)
  ])) as Record<CapabilityName, Capability>;
  const frame = optionalString(scope.frame);
  const recommendation = optionalString(completeness.recommendation);
  return {
    schemaVersion: 1,
    observedAt: requiredNumber(record.observedAt, "observedAt"),
    scope: {
      name: requiredString(scope.name, "scope name"),
      realm: requiredLiteral(scope.realm, "current", "scope realm"),
      ...(frame === undefined ? {} : { frame })
    },
    completeness: {
      currentState: "complete",
      history: completeness.history,
      historyCleared: requiredBoolean(completeness.historyCleared, "historyCleared"),
      lateBoundInstanceRefs: stringArray(
        completeness.lateBoundInstanceRefs,
        "lateBoundInstanceRefs"
      ),
      ...(recommendation === undefined ? {} : { recommendation })
    },
    capabilities,
    instances: array(record.instances, "instances").map(parseInstance),
    relationships: array(record.relationships, "relationships").map(parseRelationship),
    moduleInfo: array(record.moduleInfo, "moduleInfo").map(parseModuleInfo)
  };
}

function parseCapability(value: unknown, name: string): Capability {
  const record = asRecord(value, `capability ${name}`);
  const completeness = requiredString(record.completeness, `${name} completeness`);
  if (!["complete", "partial", "unavailable"].includes(completeness)) {
    throw new Error(`Capability ${name} has invalid completeness.`);
  }
  const reason = optionalString(record.reason);
  return {
    available: requiredBoolean(record.available, `${name} available`),
    completeness: completeness as Capability["completeness"],
    ...(reason === undefined ? {} : { reason })
  };
}

function parseRemote(value: unknown, label = "remote"): RuntimeRemote {
  const record = asRecord(value, label);
  return compact({
    name: requiredString(record.name, `${label} name`),
    alias: optionalString(record.alias),
    version: optionalString(record.version),
    entry: optionalSafeUrl(record.entry, `${label} entry`),
    entryGlobalName: optionalString(record.entryGlobalName),
    type: optionalString(record.type)
  }) as RuntimeRemote;
}

function parseInstance(value: unknown): RuntimeInstance {
  const record = asRecord(value, "instance");
  const role = requiredString(record.role, "instance role");
  if (!["consumer", "producer", "mixed", "unknown"].includes(role)) {
    throw new Error(`Unsupported MF instance role: ${role}`);
  }
  const evidence = asRecord(record.roleEvidence, "role evidence");
  const bridgeRecord = record.bridge === undefined
    ? undefined
    : asRecord(record.bridge, "bridge summary");
  const bridge = bridgeRecord === undefined
    ? undefined
    : compact({
        available: requiredBoolean(bridgeRecord.available, "bridge available"),
        lifecycleCount: optionalNumber(bridgeRecord.lifecycleCount, "bridge lifecycleCount"),
        framework: optionalEnum(bridgeRecord.framework, ["react", "vue"], "bridge framework"),
        moduleName: optionalString(bridgeRecord.moduleName, "bridge moduleName"),
        remote: optionalString(bridgeRecord.remote, "bridge remote"),
        expose: optionalString(bridgeRecord.expose, "bridge expose"),
        status: optionalEnum(
          bridgeRecord.status,
          ["idle", "rendering", "rendered", "destroying", "destroyed", "error"],
          "bridge status"
        ),
        lastOperationAt: optionalNumber(bridgeRecord.lastOperationAt, "bridge lastOperationAt"),
        commitObserved: optionalBoolean(bridgeRecord.commitObserved, "bridge commitObserved"),
        routeSyncObserved: optionalBoolean(
          bridgeRecord.routeSyncObserved,
          "bridge routeSyncObserved"
        ),
        states: bridgeRecord.states === undefined
          ? undefined
          : array(bridgeRecord.states, "bridge states").map(parseBridgeState)
      });
  return compact({
    instanceRef: requiredString(record.instanceRef, "instanceRef"),
    name: optionalString(record.name),
    optionsName: optionalString(record.optionsName),
    optionsVersion: optionalString(record.optionsVersion),
    runtimeVersion: optionalString(record.runtimeVersion),
    role: role as RuntimeInstance["role"],
    roleEvidence: {
      consumer: stringArray(evidence.consumer, "consumer role evidence"),
      producer: stringArray(evidence.producer, "producer role evidence")
    },
    remotes: array(record.remotes, "instance remotes").map((item) => parseRemote(item)),
    loadedProducers: array(record.loadedProducers, "loaded producers").map((item) => parseRemote(item)),
    shareScopes: array(record.shareScopes, "share scopes").map(parseShareScope),
    bridge,
    active: requiredBoolean(record.active, "instance active")
  }) as RuntimeInstance;
}

function parseShareScope(value: unknown): ShareScope {
  const record = asRecord(value, "share scope");
  return {
    name: requiredString(record.name, "share scope name"),
    sharedCount: requiredNumber(record.sharedCount, "shared count"),
    sharedNames: stringArray(record.sharedNames, "shared names"),
    shared: array(record.shared, "shared entries").map((entry) => {
      const shared = asRecord(entry, "shared entry");
      return {
        name: requiredString(shared.name, "shared name"),
        versions: array(shared.versions, "shared versions").map((version) => {
          const item = asRecord(version, "shared version");
          return compact({
            version: requiredString(item.version, "shared version"),
            provider: optionalString(item.provider),
            loaded: optionalBoolean(item.loaded),
            singleton: optionalBoolean(item.singleton),
            eager: optionalBoolean(item.eager),
            strategy: optionalString(item.strategy, "shared strategy")
          }) as SharedVersion;
        })
      };
    })
  };
}

function parseRelationship(value: unknown): RuntimeRelationship {
  const record = asRecord(value, "relationship");
  const status = requiredString(record.status, "relationship status");
  if (!["resolved", "ambiguous", "unresolved"].includes(status)) {
    throw new Error(`Unsupported relationship status: ${status}`);
  }
  return compact({
    consumerInstanceRef: requiredString(record.consumerInstanceRef, "consumerInstanceRef"),
    producerInstanceRef: optionalString(record.producerInstanceRef),
    candidateProducerInstanceRefs: optionalStringArray(record.candidateProducerInstanceRefs),
    remote: parseRemote(record.remote),
    evidence: stringArray(record.evidence, "relationship evidence"),
    status: status as RuntimeRelationship["status"]
  }) as RuntimeRelationship;
}

function parseModuleInfo(value: unknown): RuntimeModuleInfo {
  const record = asRecord(value, "moduleInfo entry");
  const remotes = record.remotes === undefined
    ? undefined
    : array(record.remotes, "moduleInfo remotes").map((item) => parseRemote(item));
  return compact({
    key: requiredString(record.key, "moduleInfo key"),
    name: optionalString(record.name),
    version: optionalString(record.version),
    entry: optionalSafeUrl(record.entry, "moduleInfo entry"),
    tag: optionalString(record.tag),
    remotes
  }) as RuntimeModuleInfo;
}

function parseReport(value: unknown): RuntimeReport {
  const record = asRecord(value, "report");
  const status = requiredEnum(record.status, ["pending", "success", "error"], "report status");
  const summary = asRecord(record.summary, "report summary");
  const flags = asRecord(summary.flags, "report flags");
  const moduleInfoRecord = optionalRecord(record.moduleInfo, "report moduleInfo");
  const diagnosisRecord = optionalRecord(record.diagnosis, "report diagnosis");
  const summaryShared = optionalRecord(summary.shared, "report summary shared");
  const summaryError = optionalRecord(summary.error, "report summary error");
  return compact({
    traceId: requiredString(record.traceId, "traceId"),
    instanceRef: optionalString(record.instanceRef, "report instanceRef"),
    status,
    requestId: optionalString(record.requestId, "report requestId"),
    requestAlias: optionalString(record.requestAlias, "report requestAlias"),
    hostName: optionalString(record.hostName, "report hostName"),
    runtimeVersion: optionalString(record.runtimeVersion, "report runtimeVersion"),
    remote: record.remote === undefined ? undefined : parseRemote(record.remote),
    shared: record.shared === undefined ? undefined : parseShared(record.shared),
    expose: optionalString(record.expose, "report expose"),
    sanitizedUrl: optionalSafeUrl(record.sanitizedUrl, "report sanitizedUrl"),
    startedAt: requiredNumber(record.startedAt, "report startedAt"),
    updatedAt: requiredNumber(record.updatedAt, "report updatedAt"),
    duration: requiredNumber(record.duration, "report duration"),
    failedPhase: optionalString(record.failedPhase, "report failedPhase"),
    errorCode: optionalString(record.errorCode, "report errorCode"),
    errorName: optionalString(record.errorName, "report errorName"),
    errorMessage: optionalString(record.errorMessage, "report errorMessage"),
    ownerHint: optionalOwnerHint(record.ownerHint, "report ownerHint"),
    retryable: optionalBoolean(record.retryable, "report retryable"),
    bridge: record.bridge === undefined ? undefined : parseBridgeInfo(record.bridge),
    moduleInfo: moduleInfoRecord === undefined
      ? undefined
      : {
          reason: requiredString(moduleInfoRecord.reason, "moduleInfo reason"),
          entries: array(moduleInfoRecord.entries, "moduleInfo report entries").map((entry) => {
            const item = asRecord(entry, "moduleInfo report entry");
            return compact({
              name: requiredString(item.name, "moduleInfo report name"),
              publicPath: optionalSafeUrl(item.publicPath, "moduleInfo publicPath"),
              getPublicPath: optionalSafeUrl(item.getPublicPath, "moduleInfo getPublicPath"),
              remoteEntry: optionalSafeUrl(item.remoteEntry, "moduleInfo remoteEntry"),
              globalName: optionalString(item.globalName, "moduleInfo globalName")
            });
          })
        },
    events: array(record.events, "report events").map(parseReportEvent),
    summary: compact({
      eventCount: optionalNumber(summary.eventCount, "report summary eventCount"),
      recovered: optionalBoolean(summary.recovered, "report summary recovered"),
      loadCompleted: optionalBoolean(summary.loadCompleted, "report summary loadCompleted"),
      runtimeLoaded: optionalBoolean(summary.runtimeLoaded, "report summary runtimeLoaded"),
      sharedResolved: optionalBoolean(summary.sharedResolved, "report summary sharedResolved"),
      sharedRegistered: optionalBoolean(
        summary.sharedRegistered,
        "report summary sharedRegistered"
      ),
      preloaded: optionalBoolean(summary.preloaded, "report summary preloaded"),
      componentLoaded: optionalBoolean(
        summary.componentLoaded,
        "report summary componentLoaded"
      ),
      outcome: optionalString(summary.outcome, "report summary outcome"),
      lastPhase: optionalString(summary.lastPhase, "report summary lastPhase"),
      phases: summary.phases === undefined ? undefined : parsePhases(summary.phases),
      shared: summaryShared === undefined
        ? undefined
        : compact({
            name: requiredString(summaryShared.name, "report summary shared name"),
            provider: optionalString(summaryShared.provider, "report summary shared provider"),
            selectedVersion: optionalString(
              summaryShared.selectedVersion,
              "report summary shared selectedVersion"
            ),
            shareScope: optionalStringArrayStrict(
              summaryShared.shareScope,
              "report summary shared shareScope"
            )
          }),
      flags: {
        cached: requiredBoolean(flags.cached, "report cached flag"),
        fallback: requiredBoolean(flags.fallback, "report fallback flag"),
        recovered: requiredBoolean(flags.recovered, "report recovered flag")
      },
      error: summaryError === undefined ? undefined : parseErrorSummary(summaryError)
    }),
    diagnosis: diagnosisRecord === undefined
      ? undefined
      : compact({
          title: optionalString(diagnosisRecord.title, "diagnosis title"),
          outcome: optionalString(diagnosisRecord.outcome, "diagnosis outcome"),
          status: optionalEnum(
            diagnosisRecord.status,
            ["pending", "success", "error"],
            "diagnosis status"
          ),
          ownerHint: optionalOwnerHint(diagnosisRecord.ownerHint, "diagnosis ownerHint"),
          failedPhase: optionalString(diagnosisRecord.failedPhase, "diagnosis failedPhase"),
          errorCode: optionalString(diagnosisRecord.errorCode, "diagnosis errorCode"),
          errorName: optionalString(diagnosisRecord.errorName, "diagnosis errorName"),
          errorMessage: optionalString(
            diagnosisRecord.errorMessage,
            "diagnosis errorMessage"
          ),
          warnings: diagnosisRecord.warnings === undefined
            ? undefined
            : stringArray(diagnosisRecord.warnings, "diagnosis warnings"),
          actions: array(diagnosisRecord.actions, "diagnosis actions").map((action) => {
            const item = asRecord(action, "diagnosis action");
            return compact({
              id: optionalString(item.id, "diagnosis action id"),
              ownerHint: optionalOwnerHint(item.ownerHint, "diagnosis action ownerHint"),
              title: requiredString(item.title, "diagnosis action title"),
              detail: optionalString(item.detail, "diagnosis action detail")
            });
          })
        })
  }) as RuntimeReport;
}

function parseReportEvent(value: unknown): RuntimeReportEvent {
  const record = asRecord(value, "report event");
  return compact({
    traceId: optionalString(record.traceId, "event traceId"),
    instanceRef: optionalString(record.instanceRef, "event instanceRef"),
    phase: requiredString(record.phase, "event phase"),
    status: requiredEnum(
      record.status,
      ["start", "success", "error", "complete"],
      "event status"
    ),
    timestamp: requiredNumber(record.timestamp, "event timestamp"),
    requestId: optionalString(record.requestId, "event requestId"),
    requestAlias: optionalString(record.requestAlias, "event requestAlias"),
    hostName: optionalString(record.hostName, "event hostName"),
    runtimeVersion: optionalString(record.runtimeVersion, "event runtimeVersion"),
    remote: record.remote === undefined ? undefined : parseRemote(record.remote, "event remote"),
    resource: record.resource === undefined ? undefined : parseResource(record.resource),
    shared: record.shared === undefined ? undefined : parseShared(record.shared),
    expose: optionalString(record.expose, "event expose"),
    sanitizedUrl: optionalSafeUrl(record.sanitizedUrl, "event sanitizedUrl"),
    message: optionalString(record.message, "event message"),
    errorCode: optionalString(record.errorCode, "event errorCode"),
    errorName: optionalString(record.errorName, "event errorName"),
    errorMessage: optionalString(record.errorMessage, "event errorMessage"),
    ownerHint: optionalOwnerHint(record.ownerHint, "event ownerHint"),
    retryable: optionalBoolean(record.retryable, "event retryable"),
    duration: optionalNumber(record.duration, "event duration"),
    lifecycle: optionalString(record.lifecycle, "event lifecycle"),
    eventName: optionalString(record.eventName, "event eventName"),
    source: optionalEnum(record.source, ["runtime", "business", "react"], "event source"),
    recovered: optionalBoolean(record.recovered, "event recovered"),
    cached: optionalBoolean(record.cached, "event cached"),
    componentName: optionalString(record.componentName, "event componentName"),
    bridge: record.bridge === undefined ? undefined : parseBridgeInfo(record.bridge)
  }) as RuntimeReportEvent;
}

function parseResource(value: unknown): RuntimeResource {
  const record = asRecord(value, "resource");
  return compact({
    type: requiredString(record.type, "resource type"),
    initiator: requiredEnum(
      record.initiator,
      ["loadRemote", "preloadRemote"],
      "resource initiator"
    ),
    outcome: optionalEnum(
      record.outcome,
      ["success", "error", "timeout", "cached", "recovered"],
      "resource outcome"
    ),
    url: optionalSafeUrl(record.url, "resource url"),
    startedAt: requiredNumber(record.startedAt, "resource startedAt"),
    endedAt: optionalNumber(record.endedAt, "resource endedAt"),
    duration: optionalNumber(record.duration, "resource duration"),
    httpStatus: optionalNumber(record.httpStatus, "resource httpStatus"),
    mimeType: optionalString(record.mimeType, "resource mimeType"),
    redirected: optionalBoolean(record.redirected, "resource redirected"),
    cacheSource: optionalString(record.cacheSource, "resource cacheSource"),
    errorType: optionalString(record.errorType, "resource errorType")
  }) as RuntimeResource;
}

function parseShared(value: unknown): RuntimeShared {
  const record = asRecord(value, "shared report");
  const requiredVersion = record.requiredVersion === undefined
    ? undefined
    : record.requiredVersion === false
      ? false
      : requiredString(record.requiredVersion, "shared requiredVersion");
  const moduleId = optionalStringOrNumber(record.moduleId, "shared moduleId");
  const chunkId = optionalStringOrNumber(record.chunkId, "shared chunkId");
  return compact({
    name: requiredString(record.name, "shared name"),
    shareScope: optionalStringArrayStrict(record.shareScope, "shared shareScope"),
    version: optionalString(record.version, "shared version"),
    requiredVersion,
    selectedVersion: optionalString(record.selectedVersion, "shared selectedVersion"),
    availableVersions: optionalStringArrayStrict(
      record.availableVersions,
      "shared availableVersions"
    ),
    provider: optionalString(record.provider, "shared provider"),
    useIn: optionalStringArrayStrict(record.useIn, "shared useIn"),
    singleton: optionalBoolean(record.singleton, "shared singleton"),
    strictVersion: optionalBoolean(record.strictVersion, "shared strictVersion"),
    eager: optionalBoolean(record.eager, "shared eager"),
    strategy: optionalString(record.strategy, "shared strategy"),
    loaded: optionalBoolean(record.loaded, "shared loaded"),
    loading: optionalBoolean(record.loading, "shared loading"),
    reason: optionalString(record.reason, "shared reason"),
    definedBy: optionalEnum(record.definedBy, ["bundler-runtime"], "shared definedBy"),
    conflict: record.conflict === undefined ? undefined : parseSharedConflict(record.conflict),
    candidates: record.candidates === undefined
      ? undefined
      : array(record.candidates, "shared candidates").map(parseSharedCandidate),
    selectionReason: optionalString(record.selectionReason, "shared selectionReason"),
    failureReason: optionalString(record.failureReason, "shared failureReason"),
    loadType: optionalEnum(record.loadType, ["sync", "async"], "shared loadType"),
    trigger: optionalString(record.trigger, "shared trigger"),
    moduleId,
    chunkId,
    remote: optionalString(record.remote, "shared remote"),
    expose: optionalString(record.expose, "shared expose"),
    requestId: optionalString(record.requestId, "shared requestId"),
    operationId: optionalString(record.operationId, "shared operationId"),
    fallback: optionalBoolean(record.fallback, "shared fallback"),
    recovered: optionalBoolean(record.recovered, "shared recovered"),
    registration: record.registration === undefined
      ? undefined
      : parseSharedRegistration(record.registration)
  }) as RuntimeShared;
}

function parseSharedCandidate(value: unknown): SharedCandidate {
  const record = asRecord(value, "shared candidate");
  return compact({
    scope: requiredString(record.scope, "shared candidate scope"),
    version: requiredString(record.version, "shared candidate version"),
    provider: optionalString(record.provider, "shared candidate provider"),
    loaded: requiredBoolean(record.loaded, "shared candidate loaded"),
    loading: requiredBoolean(record.loading, "shared candidate loading"),
    singleton: requiredBoolean(record.singleton, "shared candidate singleton"),
    eager: requiredBoolean(record.eager, "shared candidate eager"),
    strategy: optionalString(record.strategy, "shared candidate strategy"),
    compatible: optionalBoolean(record.compatible, "shared candidate compatible"),
    rejectionReason: optionalString(
      record.rejectionReason,
      "shared candidate rejectionReason"
    )
  }) as SharedCandidate;
}

function parseSharedRegistration(value: unknown): SharedRegistration {
  const record = asRecord(value, "shared registration");
  return compact({
    registrationId: requiredString(record.registrationId, "shared registration id"),
    action: requiredEnum(
      record.action,
      ["registered", "replaced", "reused", "ignored"],
      "shared registration action"
    ),
    reason: requiredString(record.reason, "shared registration reason"),
    trigger: requiredString(record.trigger, "shared registration trigger"),
    scope: requiredString(record.scope, "shared registration scope"),
    candidate: parseSharedCandidate(record.candidate),
    effective: record.effective === undefined
      ? undefined
      : parseSharedCandidate(record.effective)
  }) as SharedRegistration;
}

function parseSharedConflict(value: unknown): SharedConflict {
  const record = asRecord(value, "shared conflict");
  return compact({
    reason: requiredEnum(
      record.reason,
      ["singleton-multiple-versions"],
      "shared conflict reason"
    ),
    scope: requiredString(record.scope, "shared conflict scope"),
    currentVersion: optionalString(record.currentVersion, "shared conflict currentVersion"),
    currentFrom: optionalString(record.currentFrom, "shared conflict currentFrom"),
    versions: stringArray(record.versions, "shared conflict versions"),
    existingVersions: array(
      record.existingVersions,
      "shared conflict existingVersions"
    ).map((value) => {
      const item = asRecord(value, "shared conflict version");
      return compact({
        version: requiredString(item.version, "shared conflict version"),
        from: optionalString(item.from, "shared conflict provider"),
        singleton: optionalBoolean(item.singleton, "shared conflict singleton"),
        loaded: optionalBoolean(item.loaded, "shared conflict loaded")
      });
    })
  }) as SharedConflict;
}

function parseBridgeInfo(value: unknown): RuntimeBridgeInfo {
  const record = asRecord(value, "bridge report");
  const error = optionalRecord(record.error, "bridge error");
  return compact({
    operationId: requiredString(record.operationId, "bridge operationId"),
    bridgeId: requiredString(record.bridgeId, "bridge bridgeId"),
    side: requiredEnum(record.side, ["consumer", "producer"], "bridge side"),
    framework: requiredEnum(record.framework, ["react", "vue"], "bridge framework"),
    operation: requiredEnum(
      record.operation,
      ["render", "update", "destroy", "route-sync"],
      "bridge operation"
    ),
    moduleName: optionalString(record.moduleName, "bridge moduleName"),
    remote: optionalString(record.remote, "bridge remote"),
    expose: optionalString(record.expose, "bridge expose"),
    route: record.route === undefined ? undefined : parseBridgeRoute(record.route),
    reason: optionalString(record.reason, "bridge reason"),
    startedAt: requiredNumber(record.startedAt, "bridge startedAt"),
    endedAt: optionalNumber(record.endedAt, "bridge endedAt"),
    duration: optionalNumber(record.duration, "bridge duration"),
    outcome: optionalEnum(
      record.outcome,
      ["success", "error", "skipped"],
      "bridge outcome"
    ),
    error: error === undefined
      ? undefined
      : compact({
          name: optionalString(error.name, "bridge error name"),
          message: optionalString(error.message, "bridge error message")
        })
  }) as RuntimeBridgeInfo;
}

function parseBridgeRoute(value: unknown): BridgeRouteSummary {
  const record = asRecord(value, "bridge route");
  return compact({
    action: requiredString(record.action, "bridge route action"),
    from: optionalSafeUrl(record.from, "bridge route origin"),
    to: optionalSafeUrl(record.to, "bridge route to"),
    basename: optionalSafeUrl(record.basename, "bridge route basename"),
    mechanism: optionalEnum(record.mechanism, ["popstate"], "bridge route mechanism")
  }) as BridgeRouteSummary;
}

function parseBridgeState(value: unknown): RuntimeBridgeState {
  const record = asRecord(value, "bridge state");
  return compact({
    bridgeId: requiredString(record.bridgeId, "bridge state bridgeId"),
    side: requiredEnum(record.side, ["consumer", "producer"], "bridge state side"),
    framework: requiredEnum(
      record.framework,
      ["react", "vue"],
      "bridge state framework"
    ),
    moduleName: optionalString(record.moduleName, "bridge state moduleName"),
    remote: optionalString(record.remote, "bridge state remote"),
    expose: optionalString(record.expose, "bridge state expose"),
    status: requiredEnum(
      record.status,
      ["idle", "rendering", "rendered", "destroying", "destroyed", "error"],
      "bridge state status"
    ),
    lastOperation: optionalEnum(
      record.lastOperation,
      ["render", "update", "destroy", "route-sync"],
      "bridge state lastOperation"
    ),
    lastOperationId: optionalString(record.lastOperationId, "bridge state lastOperationId"),
    lastOperationAt: optionalNumber(record.lastOperationAt, "bridge state lastOperationAt"),
    commitObserved: requiredBoolean(record.commitObserved, "bridge state commitObserved"),
    routeSyncObserved: requiredBoolean(
      record.routeSyncObserved,
      "bridge state routeSyncObserved"
    )
  }) as RuntimeBridgeState;
}

function parsePhases(value: unknown): RuntimeReport["summary"]["phases"] {
  const record = asRecord(value, "report summary phases");
  return Object.fromEntries(Object.entries(record).map(([phase, rawValue]) => {
    const item = asRecord(rawValue, `report phase ${phase}`);
    return [phase, compact({
      status: requiredEnum(
        item.status,
        ["start", "success", "error", "complete"],
        `report phase ${phase} status`
      ),
      duration: optionalNumber(item.duration, `report phase ${phase} duration`),
      cached: optionalBoolean(item.cached, `report phase ${phase} cached`),
      recovered: optionalBoolean(item.recovered, `report phase ${phase} recovered`),
      lifecycle: optionalString(item.lifecycle, `report phase ${phase} lifecycle`)
    })];
  })) as NonNullable<RuntimeReport["summary"]["phases"]>;
}

function parseErrorSummary(record: Record<string, unknown>) {
  return compact({
    errorCode: optionalString(record.errorCode, "summary errorCode"),
    errorName: optionalString(record.errorName, "summary errorName"),
    errorMessage: optionalString(record.errorMessage, "summary errorMessage"),
    failedPhase: optionalString(record.failedPhase, "summary failedPhase"),
    lifecycle: optionalString(record.lifecycle, "summary lifecycle"),
    ownerHint: optionalOwnerHint(record.ownerHint, "summary ownerHint"),
    retryable: optionalBoolean(record.retryable, "summary retryable")
  });
}

function optionalInjection(value: unknown): InjectionMarker | undefined {
  if (value === undefined || value === null) return undefined;
  const record = asRecord(value, "injection marker");
  if (record.schemaVersion !== 1 || record.source !== "openruntime/extension-mf") {
    return undefined;
  }
  const status = requiredString(record.status, "injection status");
  const timing = requiredString(record.timing, "injection timing");
  if (!["installed", "already-installed", "error"].includes(status)) return undefined;
  if (!["before-runtime", "late", "unknown"].includes(timing)) return undefined;
  return compact({
    schemaVersion: 1,
    source: "openruntime/extension-mf",
    status: status as InjectionMarker["status"],
    scope: requiredString(record.scope, "injection scope"),
    observabilityVersion: requiredString(record.observabilityVersion, "injection version"),
    installedAt: requiredNumber(record.installedAt, "injection timestamp"),
    timing: timing as InjectionMarker["timing"],
    message: optionalString(record.message)
  }) as InjectionMarker;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function optionalRecord(
  value: unknown,
  label: string
): Record<string, unknown> | undefined {
  return value === undefined ? undefined : asRecord(value, label);
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  const values = array(value, label);
  if (!values.every((item) => typeof item === "string")) {
    throw new Error(`${label} must contain only strings.`);
  }
  return [...values] as string[];
}

function optionalStringArray(value: unknown): string[] | undefined {
  return value === undefined ? undefined : stringArray(value, "string array");
}

function optionalStringArrayStrict(value: unknown, label: string): string[] | undefined {
  return value === undefined ? undefined : stringArray(value, label);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function optionalString(value: unknown, label = "optional string"): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string when provided.`);
  }
  return value;
}

function optionalSafeUrl(value: unknown, label: string): string | undefined {
  const url = optionalString(value, label);
  if (url === undefined) return undefined;
  const queryIndex = url.indexOf("?");
  const hashIndex = url.indexOf("#");
  const end = [queryIndex, hashIndex]
    .filter((index) => index >= 0)
    .reduce((smallest, index) => Math.min(smallest, index), url.length);
  return url.slice(0, end);
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function optionalNumber(value: unknown, label = "optional number"): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number when provided.`);
  }
  return value;
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean.`);
  return value;
}

function optionalBoolean(value: unknown, label = "optional boolean"): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean when provided.`);
  }
  return value;
}

function optionalStringOrNumber(
  value: unknown,
  label: string
): string | number | undefined {
  if (value === undefined) return undefined;
  if (
    (typeof value !== "string" || value.length === 0) &&
    (typeof value !== "number" || !Number.isFinite(value))
  ) {
    throw new Error(`${label} must be a non-empty string or finite number when provided.`);
  }
  return value as string | number;
}

function requiredEnum<const T extends readonly string[]>(
  value: unknown,
  values: T,
  label: string
): T[number] {
  const parsed = requiredString(value, label);
  if (!values.includes(parsed)) {
    throw new Error(`${label} has an unsupported value: ${parsed}.`);
  }
  return parsed as T[number];
}

function optionalEnum<const T extends readonly string[]>(
  value: unknown,
  values: T,
  label: string
): T[number] | undefined {
  return value === undefined ? undefined : requiredEnum(value, values, label);
}

function optionalOwnerHint(
  value: unknown,
  label: string
): RuntimeReportEvent["ownerHint"] | undefined {
  return optionalEnum(
    value,
    ["host", "remote", "shared", "network", "runtime", "unknown"],
    label
  );
}

function requiredLiteral<T extends string>(value: unknown, literal: T, label: string): T {
  if (value !== literal) throw new Error(`${label} must be ${literal}.`);
  return literal;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as T;
}
