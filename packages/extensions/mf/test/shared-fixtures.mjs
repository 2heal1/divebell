import { report } from "./fixtures.mjs";

export function sharedVersion(version, options = {}) {
  return {
    version,
    provider: options.provider ?? "host",
    loaded: options.loaded ?? false,
    singleton: options.singleton ?? false,
    eager: options.eager ?? false,
    strategy: options.strategy ?? "loaded-first"
  };
}

export function shareScope(name, packages) {
  return {
    name,
    sharedCount: packages.length,
    sharedNames: packages.map((item) => item.name),
    shared: packages
  };
}

export function sharedPackage(name, versions) {
  return { name, versions };
}

export function sharedCandidate(version, options = {}) {
  return {
    scope: options.scope ?? "default",
    version,
    provider: options.provider ?? "host",
    loaded: options.loaded ?? false,
    loading: options.loading ?? false,
    singleton: options.singleton ?? false,
    eager: options.eager ?? false,
    strategy: options.strategy ?? "loaded-first",
    ...(options.compatible === undefined ? {} : { compatible: options.compatible }),
    ...(options.rejectionReason === undefined
      ? {}
      : { rejectionReason: options.rejectionReason })
  };
}

export function sharedReport(options = {}) {
  const candidate = options.candidate ?? sharedCandidate("18.3.1", {
    loaded: true,
    singleton: true,
    compatible: true
  });
  const shared = {
    name: options.package ?? "react",
    shareScope: [options.scope ?? "default"],
    version: options.requestedVersion ?? "18.3.1",
    requiredVersion: options.requiredVersion ?? "^18.0.0",
    selectedVersion: options.selectedVersion ?? candidate.version,
    availableVersions: options.availableVersions ?? [candidate.version],
    provider: options.provider ?? candidate.provider,
    ...(options.useIn === undefined ? {} : { useIn: options.useIn }),
    singleton: options.singleton ?? candidate.singleton,
    strictVersion: options.strictVersion ?? false,
    eager: options.eager ?? candidate.eager,
    strategy: options.strategy ?? candidate.strategy,
    loaded: options.loaded ?? true,
    candidates: options.candidates ?? [candidate],
    selectionReason: options.selectionReason ?? "singleton-existing",
    trigger: options.trigger ?? "runtime",
    remote: options.remote ?? "catalog",
    expose: options.expose ?? "./App",
    requestId: options.sharedRequestId ?? "catalog/App",
    operationId: options.operationId ?? "loadShare-1",
    fallback: options.fallback ?? false,
    recovered: options.recovered ?? false,
    ...(options.failureReason === undefined ? {} : { failureReason: options.failureReason }),
    ...(options.registration === undefined ? {} : { registration: options.registration }),
    ...(options.conflict === undefined ? {} : { conflict: options.conflict })
  };
  return report({
    traceId: options.traceId ?? `trace-${options.operationId ?? "loadShare-1"}`,
    instanceRef: options.instanceRef ?? "mf-1",
    runtimeVersion: options.runtimeVersion ?? "2.5.4",
    remote: undefined,
    expose: options.expose ?? "./App",
    requestId: options.reportRequestId ?? options.operationId ?? "loadShare-1",
    status: options.status ?? "success",
    startedAt: options.startedAt ?? 100,
    updatedAt: options.updatedAt ?? 120,
    duration: (options.updatedAt ?? 120) - (options.startedAt ?? 100),
    shared,
    events: [{
      traceId: options.traceId ?? `trace-${options.operationId ?? "loadShare-1"}`,
      instanceRef: options.instanceRef ?? "mf-1",
      phase: options.phase ?? "shared",
      status: options.status === "error" ? "error" : "success",
      timestamp: options.updatedAt ?? 120,
      requestId: options.operationId ?? "loadShare-1",
      shared
    }],
    summary: {
      outcome: options.outcome ?? (options.status === "error" ? "failed" : "shared-resolved"),
      recovered: options.recovered ?? false,
      flags: {
        cached: false,
        fallback: options.fallback ?? false,
        recovered: options.recovered ?? false
      },
      ...(options.error === undefined ? {} : { error: options.error })
    }
  });
}

export function registration(action, options = {}) {
  const candidate = options.candidate ?? sharedCandidate(options.version ?? "18.3.1", {
    loaded: action === "reused",
    singleton: options.singleton ?? false,
    compatible: true
  });
  return {
    registrationId: options.registrationId ?? `registration-${action}`,
    action,
    reason: options.reason ?? `share-${action}`,
    trigger: options.trigger ?? "container-init",
    scope: options.scope ?? "default",
    candidate,
    effective: options.effective ?? candidate
  };
}
