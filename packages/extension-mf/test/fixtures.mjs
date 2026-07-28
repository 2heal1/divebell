export function capability(available = true, completeness = "complete", reason) {
  return {
    available,
    completeness,
    ...(reason === undefined ? {} : { reason })
  };
}

export function instance(options) {
  return {
    instanceRef: options.instanceRef,
    name: options.name,
    optionsName: options.name,
    optionsVersion: options.version ?? "1.0.0",
    runtimeVersion: options.runtimeVersion ?? "2.5.4",
    role: options.role,
    roleEvidence: {
      consumer: options.role === "consumer" || options.role === "mixed"
        ? ["options.remotes"]
        : [],
      producer: options.role === "producer" || options.role === "mixed"
        ? ["moduleInfo"]
        : []
    },
    remotes: options.remotes ?? [],
    loadedProducers: options.loadedProducers ?? [],
    shareScopes: options.shareScopes ?? [],
    bridge: options.bridge ?? { available: false },
    active: true
  };
}

export function runtimeState(overrides = {}) {
  return {
    schemaVersion: 1,
    observedAt: 100,
    scope: {
      name: "chrome_extension",
      realm: "current",
      frame: "top"
    },
    completeness: {
      currentState: "complete",
      history: "complete",
      historyCleared: false,
      lateBoundInstanceRefs: []
    },
    capabilities: {
      instanceState: capability(),
      remoteTrace: capability(),
      sharedState: capability(),
      sharedTrace: capability(),
      bridgeTrace: capability(false, "unavailable", "No Bridge signal.")
    },
    instances: [],
    relationships: [],
    moduleInfo: [],
    ...overrides
  };
}

export function report(overrides = {}) {
  return {
    traceId: "trace-1",
    instanceRef: "mf-1",
    status: "success",
    remote: {
      name: "catalog",
      alias: "shop",
      entry: "https://cdn.test/catalog/mf-manifest.json",
      entryGlobalName: "catalog",
      type: "global"
    },
    expose: "./App",
    sanitizedUrl: "https://cdn.test/catalog/mf-manifest.json",
    startedAt: 10,
    updatedAt: 20,
    duration: 10,
    moduleInfo: {
      reason: "remote-snapshot",
      entries: [{
        name: "catalog",
        publicPath: "https://cdn.test/catalog/",
        getPublicPath: "return 'https://cdn.test/catalog/'",
        remoteEntry: "https://cdn.test/catalog/remoteEntry.js",
        globalName: "catalog"
      }]
    },
    events: [{
      phase: "manifest",
      status: "success",
      timestamp: 11,
      sanitizedUrl: "https://cdn.test/catalog/mf-manifest.json",
      message: "manifest:loaded",
      cached: false
    }],
    summary: {
      flags: {
        cached: false,
        fallback: false,
        recovered: false
      }
    },
    diagnosis: {
      warnings: [],
      actions: []
    },
    ...overrides
  };
}

export function browserRead(state, reports = [], overrides = {}) {
  return {
    ok: true,
    selectedScope: "chrome_extension",
    mode: "injected",
    observabilityVersion: "2.5.4",
    availableScopes: ["chrome_extension"],
    compatibleScopes: ["chrome_extension"],
    marker: {
      schemaVersion: 1,
      source: "divebell/extension-mf",
      status: "installed",
      scope: "chrome_extension",
      observabilityVersion: "2.5.4",
      installedAt: 1,
      timing: "before-runtime"
    },
    state,
    reports,
    globalShared: {},
    ...overrides
  };
}
