import type {
  BrowserObservabilitySnapshot,
  BrowserReadResult,
  Capability,
  CapabilityName,
  InjectionMarker,
  RuntimeInstance,
  RuntimeModuleInfo,
  RuntimeRelationship,
  RuntimeRemote,
  RuntimeReport,
  RuntimeState,
  ShareScope,
  SharedVersion
} from "./types.js";

const capabilityNames: CapabilityName[] = [
  "instanceState",
  "remoteTrace",
  "sharedState",
  "sharedTrace",
  "bridgeTrace"
];

export const MF_BROWSER_READ_SCRIPT = `(() => {
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
      reports
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

export async function readMfObservability(browser: {
  eval<T = unknown>(script: string): Promise<T>;
}): Promise<BrowserReadResult> {
  const value = await browser.eval<unknown>(MF_BROWSER_READ_SCRIPT);
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
    reports: array(record.reports, "reports").map(parseReport)
  };
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
    entry: optionalString(record.entry),
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
        lifecycleCount: optionalNumber(bridgeRecord.lifecycleCount)
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
            eager: optionalBoolean(item.eager)
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
    entry: optionalString(record.entry),
    tag: optionalString(record.tag),
    remotes
  }) as RuntimeModuleInfo;
}

function parseReport(value: unknown): RuntimeReport {
  const record = asRecord(value, "report");
  const status = requiredString(record.status, "report status");
  if (!["pending", "success", "error"].includes(status)) {
    throw new Error(`Unsupported report status: ${status}`);
  }
  const summary = asRecord(record.summary, "report summary");
  const flags = asRecord(summary.flags, "report flags");
  const moduleInfoRecord = record.moduleInfo === undefined
    ? undefined
    : asRecord(record.moduleInfo, "report moduleInfo");
  const diagnosisRecord = record.diagnosis === undefined
    ? undefined
    : asRecord(record.diagnosis, "report diagnosis");
  return compact({
    traceId: requiredString(record.traceId, "traceId"),
    instanceRef: optionalString(record.instanceRef),
    status: status as RuntimeReport["status"],
    remote: record.remote === undefined ? undefined : parseRemote(record.remote),
    expose: optionalString(record.expose),
    sanitizedUrl: optionalString(record.sanitizedUrl),
    startedAt: requiredNumber(record.startedAt, "report startedAt"),
    updatedAt: requiredNumber(record.updatedAt, "report updatedAt"),
    duration: requiredNumber(record.duration, "report duration"),
    moduleInfo: moduleInfoRecord === undefined
      ? undefined
      : {
          reason: requiredString(moduleInfoRecord.reason, "moduleInfo reason"),
          entries: array(moduleInfoRecord.entries, "moduleInfo report entries").map((entry) => {
            const item = asRecord(entry, "moduleInfo report entry");
            return compact({
              name: requiredString(item.name, "moduleInfo report name"),
              publicPath: optionalString(item.publicPath),
              getPublicPath: optionalString(item.getPublicPath),
              remoteEntry: optionalString(item.remoteEntry),
              globalName: optionalString(item.globalName)
            });
          })
        },
    events: array(record.events, "report events").map((event) => {
      const item = asRecord(event, "report event");
      return compact({
        phase: requiredString(item.phase, "event phase"),
        status: requiredString(item.status, "event status"),
        timestamp: requiredNumber(item.timestamp, "event timestamp"),
        sanitizedUrl: optionalString(item.sanitizedUrl),
        message: optionalString(item.message),
        cached: optionalBoolean(item.cached)
      });
    }),
    summary: {
      flags: {
        cached: requiredBoolean(flags.cached, "report cached flag"),
        fallback: requiredBoolean(flags.fallback, "report fallback flag"),
        recovered: requiredBoolean(flags.recovered, "report recovered flag")
      }
    },
    diagnosis: diagnosisRecord === undefined
      ? undefined
      : {
          warnings: diagnosisRecord.warnings === undefined
            ? undefined
            : stringArray(diagnosisRecord.warnings, "diagnosis warnings"),
          actions: array(diagnosisRecord.actions, "diagnosis actions").map((action) => {
            const item = asRecord(action, "diagnosis action");
            return compact({
              title: requiredString(item.title, "diagnosis action title"),
              detail: optionalString(item.detail)
            });
          })
        }
  }) as RuntimeReport;
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

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean.`);
  return value;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
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
