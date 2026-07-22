import { instance, runtimeState } from "./fixtures.mjs";

export const catalogRemote = {
  name: "@scope/catalog",
  alias: "shop",
  entry: "https://cdn.test/catalog/mf-manifest.json",
  entryGlobalName: "catalog",
  type: "global"
};

export function consumer(options = {}) {
  return instance({
    instanceRef: options.instanceRef ?? "mf-1",
    name: options.name ?? "host",
    role: "consumer",
    remotes: options.remotes ?? [catalogRemote],
    loadedProducers: options.loadedProducers ?? [catalogRemote]
  });
}

export function stateWithConsumer(overrides = {}) {
  const host = overrides.consumer ?? consumer();
  return runtimeState({
    instances: overrides.instances ?? [host],
    relationships: overrides.relationships ?? [{
      consumerInstanceRef: host.instanceRef,
      producerInstanceRef: "mf-producer",
      remote: catalogRemote,
      evidence: ["moduleCache.remoteInfo"],
      status: "resolved"
    }],
    ...overrides.state
  });
}

export function loadTrace(options = {}) {
  const traceId = options.traceId ?? "trace-load-1";
  const instanceRef = options.instanceRef ?? "mf-1";
  const remote = options.remote ?? catalogRemote;
  const expose = options.expose ?? "./Button";
  const base = options.base ?? 1_000;
  const manifestUrl = options.manifestUrl ??
    "https://cdn.test/catalog/mf-manifest.json?token=demo-secret#hash";
  const remoteEntryUrl = options.remoteEntryUrl ??
    "https://cdn.test/catalog/remoteEntry.js?token=demo-secret#hash";
  const manifestOutcome = options.manifestOutcome ?? "success";
  const remoteEntryOutcome = options.remoteEntryOutcome ?? "success";
  const cached = options.cached ?? false;
  const recovered = options.recovered ?? false;
  const pending = options.pending ?? false;
  const timeout = remoteEntryOutcome === "timeout";
  const failed = manifestOutcome === "error" || remoteEntryOutcome === "error" || timeout;
  const events = [
    event(base, "loadRemote", "start", {
      lifecycle: "beforeRequest",
      message: "remote:load-start",
      requestId: `${remote.name}/Button`,
      remote
    }),
    event(base + 1, "matchRemote", "success", {
      lifecycle: "afterMatchRemote",
      message: "remote:matched",
      requestId: `${remote.name}/Button`,
      remote,
      expose
    }),
    resourceEvent({
      timestamp: base + 2,
      phase: "manifest",
      status: "start",
      lifecycle: "beforeLoadResource",
      type: "manifest",
      initiator: "loadRemote",
      url: manifestUrl,
      startedAt: base + 2,
      remote,
      expose
    }),
    resourceEvent({
      timestamp: base + 12,
      phase: "manifest",
      status: manifestOutcome === "error" ? "error" : "success",
      lifecycle: "afterLoadResource",
      type: "manifest",
      initiator: "loadRemote",
      outcome: manifestOutcome,
      url: manifestUrl,
      startedAt: base + 2,
      endedAt: base + 12,
      duration: 10,
      httpStatus: manifestOutcome === "error" ? 503 : 200,
      mimeType: "application/json",
      redirected: false,
      remote,
      expose,
      errorType: manifestOutcome === "error" ? "network" : undefined,
      errorMessage: manifestOutcome === "error" ? "token=demo-secret manifest failed" : undefined
    })
  ];

  if (manifestOutcome !== "error") {
    events.push(
      resourceEvent({
        timestamp: base + 13,
        phase: "remoteEntry",
        status: "start",
        lifecycle: "beforeLoadResource",
        type: "remoteEntry",
        initiator: "loadRemote",
        url: remoteEntryUrl,
        startedAt: base + 13,
        remote,
        expose
      })
    );
    if (!pending) {
      events.push(resourceEvent({
        timestamp: base + 23,
        phase: "remoteEntry",
        status: remoteEntryOutcome === "success" || remoteEntryOutcome === "cached"
          ? "success"
          : "error",
        lifecycle: "afterLoadResource",
        type: "remoteEntry",
        initiator: "loadRemote",
        outcome: remoteEntryOutcome,
        url: remoteEntryUrl,
        startedAt: base + 13,
        endedAt: base + 23,
        duration: 10,
        httpStatus: remoteEntryOutcome === "success" || remoteEntryOutcome === "cached"
          ? 200
          : 504,
        mimeType: "text/javascript",
        redirected: true,
        cacheSource: cached ? "memory" : undefined,
        remote,
        expose,
        errorType: timeout ? "timeout" : failed ? "network" : undefined,
        errorMessage: failed ? "token=demo-secret remoteEntry failed" : undefined
      }));
    }
  }

  if (!failed && !pending) {
    events.push(
      event(base + 24, "remoteEntryInit", "start", {
        lifecycle: "beforeInitRemote",
        remote,
        expose
      }),
      event(base + 26, "remoteEntryInit", "success", {
        lifecycle: "afterInitRemote",
        remote,
        expose,
        cached
      }),
      event(base + 27, "expose", "start", {
        lifecycle: "beforeGetExpose",
        remote,
        expose
      }),
      event(base + 29, "expose", "success", {
        lifecycle: "afterGetExpose",
        remote,
        expose
      }),
      event(base + 30, "moduleFactory", "start", {
        lifecycle: "beforeExecuteFactory",
        remote,
        expose
      }),
      event(base + 33, "moduleFactory", "success", {
        lifecycle: "afterExecuteFactory",
        remote,
        expose,
        duration: 3
      }),
      event(base + 34, "loadRemote", "success", {
        lifecycle: "onLoad",
        message: "remote:loaded",
        remote,
        expose
      }),
      event(base + 35, "loadRemote", "complete", {
        lifecycle: "afterLoadRemote",
        message: recovered ? "remote:load-recovered" : "remote:load-complete",
        remote,
        expose,
        recovered
      })
    );
  } else if (!pending) {
    events.push(event(base + 25, "loadRemote", "complete", {
      lifecycle: "afterLoadRemote",
      message: "remote:load-failed",
      remote,
      expose,
      errorName: "Error",
      errorMessage: "token=demo-secret remote load failed"
    }));
  }

  if (recovered) {
    const failedResource = resourceEvent({
      timestamp: base + 13,
      phase: "remoteEntry",
      status: "error",
      lifecycle: "afterLoadResource",
      type: "remoteEntry",
      initiator: "loadRemote",
      outcome: "error",
      url: remoteEntryUrl,
      startedAt: base + 12,
      endedAt: base + 13,
      duration: 1,
      remote,
      expose,
      errorType: "execution",
      errorMessage: "token=demo-secret first attempt failed"
    });
    events.splice(4, 0, failedResource);
  }

  const status = pending ? "pending" : failed && !recovered ? "error" : "success";
  const errorMessage = failed && !recovered ? "token=demo-secret remote load failed" : undefined;
  return {
    traceId,
    instanceRef,
    status,
    requestId: `${remote.name}/Button`,
    requestAlias: remote.alias,
    hostName: options.hostName ?? "host",
    runtimeVersion: "2.5.4",
    remote,
    expose,
    sanitizedUrl: manifestUrl,
    startedAt: base,
    updatedAt: pending ? base + 13 : base + 35,
    duration: pending ? 13 : 35,
    ...(failed && !recovered ? { failedPhase: remoteEntryOutcome === "success" ? "manifest" : "remoteEntry" } : {}),
    ...(errorMessage === undefined ? {} : {
      errorName: "Error",
      errorMessage,
      ownerHint: "network"
    }),
    events: events.map((item) => ({ traceId, instanceRef, ...item })),
    summary: {
      recovered,
      loadCompleted: !pending,
      runtimeLoaded: !failed && !pending || recovered,
      outcome: pending ? "pending" : recovered ? "recovered" : failed ? "failed" : "runtime-loaded",
      flags: {
        cached,
        fallback: recovered,
        recovered
      },
      ...(errorMessage === undefined ? {} : {
        error: {
          errorName: "Error",
          errorMessage,
          failedPhase: remoteEntryOutcome === "success" ? "manifest" : "remoteEntry",
          ownerHint: "network"
        }
      })
    },
    diagnosis: {
      status,
      actions: []
    }
  };
}

export function preloadTrace(options = {}) {
  const traceId = options.traceId ?? "trace-preload-1";
  const instanceRef = options.instanceRef ?? "mf-1";
  const remote = options.remote ?? catalogRemote;
  const base = options.base ?? 2_000;
  const outcome = options.outcome ?? "success";
  const timeout = outcome === "timeout";
  const cached = outcome === "cached";
  const recovered = outcome === "recovered";
  const failed = outcome === "error" || timeout;
  const resourceUrl = options.resourceUrl ??
    "https://cdn.test/catalog/Button.js?token=demo-secret#hash";
  const manifestUrl = options.manifestUrl ??
    "https://cdn.test/catalog/mf-manifest.json?token=demo-secret#hash";
  const events = [
    event(base, "preload", "start", {
      lifecycle: "generatePreloadAssets",
      message: "preload:assets-ready",
      requestId: remote.name,
      remote
    }),
    resourceEvent({
      timestamp: base + 0.1,
      phase: "manifest",
      status: "start",
      lifecycle: "beforeLoadResource",
      type: "manifest",
      initiator: "preloadRemote",
      url: manifestUrl,
      startedAt: base + 0.1,
      remote
    }),
    resourceEvent({
      timestamp: base + 0.9,
      phase: "manifest",
      status: "success",
      lifecycle: "afterLoadResource",
      type: "manifest",
      initiator: "preloadRemote",
      outcome: "success",
      url: manifestUrl,
      startedAt: base + 0.1,
      endedAt: base + 0.9,
      duration: 0.8,
      httpStatus: 200,
      mimeType: "application/json",
      redirected: false,
      remote
    }),
    resourceEvent({
      timestamp: base + 1,
      phase: "preload",
      status: "start",
      lifecycle: "beforeLoadResource",
      type: "js",
      initiator: "preloadRemote",
      url: resourceUrl,
      startedAt: base + 1,
      remote,
      expose: "./Button"
    }),
    resourceEvent({
      timestamp: base + 11,
      phase: "preload",
      status: failed ? "error" : recovered ? "complete" : "success",
      lifecycle: "afterLoadResource",
      type: "js",
      initiator: "preloadRemote",
      outcome,
      url: resourceUrl,
      startedAt: base + 1,
      endedAt: base + 11,
      duration: 10,
      httpStatus: failed ? 504 : 200,
      mimeType: "text/javascript",
      redirected: false,
      cacheSource: cached ? "memory" : undefined,
      errorType: timeout ? "timeout" : failed ? "network" : undefined,
      remote,
      expose: "./Button",
      errorMessage: failed ? "token=demo-secret preload failed" : undefined,
      recovered
    }),
    event(base + 12, "preload", failed ? "error" : "complete", {
      lifecycle: "afterPreloadRemote",
      message: failed ? "preload:completed-with-errors" : "preload:complete",
      requestId: `${remote.name}/Button`,
      remote,
      ...(failed ? { errorMessage: "token=demo-secret preload failed" } : {})
    })
  ];
  return {
    traceId,
    instanceRef,
    status: failed ? "error" : "success",
    requestId: `${remote.name}/Button`,
    hostName: options.hostName ?? "host",
    runtimeVersion: "2.5.4",
    remote,
    expose: "./Button",
    sanitizedUrl: resourceUrl,
    startedAt: base,
    updatedAt: base + 12,
    duration: 12,
    ...(failed ? {
      failedPhase: "preload",
      errorName: "Error",
      errorMessage: "token=demo-secret preload failed"
    } : {}),
    events: events.map((item) => ({ traceId, instanceRef, ...item })),
    summary: {
      preloaded: !failed,
      recovered,
      outcome: recovered ? "recovered" : failed ? "failed" : "preloaded",
      flags: {
        cached,
        fallback: recovered,
        recovered
      }
    },
    diagnosis: {
      status: failed ? "error" : "success",
      actions: []
    }
  };
}

function event(timestamp, phase, status, fields = {}) {
  return { timestamp, phase, status, ...fields };
}

function resourceEvent(options) {
  return event(options.timestamp, options.phase, options.status, {
    lifecycle: options.lifecycle,
    requestId: `${options.remote.name}/Button`,
    remote: options.remote,
    expose: options.expose,
    sanitizedUrl: options.url,
    message: `resource:${options.type}:${options.outcome ?? "load-start"}`,
    ...(options.duration === undefined ? {} : { duration: options.duration }),
    ...(options.errorMessage === undefined ? {} : {
      errorName: "Error",
      errorMessage: options.errorMessage,
      ownerHint: "network"
    }),
    ...(options.recovered === undefined ? {} : { recovered: options.recovered }),
    cached: options.outcome === "cached",
    resource: {
      type: options.type,
      initiator: options.initiator,
      ...(options.outcome === undefined ? {} : { outcome: options.outcome }),
      url: options.url,
      startedAt: options.startedAt,
      ...(options.endedAt === undefined ? {} : { endedAt: options.endedAt }),
      ...(options.duration === undefined ? {} : { duration: options.duration }),
      ...(options.httpStatus === undefined ? {} : { httpStatus: options.httpStatus }),
      ...(options.mimeType === undefined ? {} : { mimeType: options.mimeType }),
      ...(options.redirected === undefined ? {} : { redirected: options.redirected }),
      ...(options.cacheSource === undefined ? {} : { cacheSource: options.cacheSource }),
      ...(options.errorType === undefined ? {} : { errorType: options.errorType })
    }
  });
}
