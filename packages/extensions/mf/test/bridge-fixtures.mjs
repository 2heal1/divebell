import {
  browserRead,
  capability,
  instance,
  report,
  runtimeState
} from "./fixtures.mjs";

export function bridgeInfo(overrides = {}) {
  return {
    operationId: "bridge-op-1",
    bridgeId: "bridge-1",
    side: "consumer",
    framework: "react",
    operation: "render",
    moduleName: "catalog/App",
    remote: "catalog",
    expose: "./App",
    startedAt: 100,
    ...overrides
  };
}

export function bridgeReport(options = {}) {
  const context = bridgeInfo(options.bridge);
  const endedAt = options.endedAt ?? context.startedAt + 10;
  const result = {
    ...context,
    endedAt,
    duration: endedAt - context.startedAt,
    outcome: options.outcome ?? "success",
    ...(options.error === undefined ? {} : { error: options.error })
  };
  const events = [];
  if (options.called !== false) {
    events.push(bridgeEvent(context, {
      lifecycle: "beforeBridgeOperation",
      phase: phaseFor(context.operation),
      status: "start",
      timestamp: context.startedAt,
      message: `bridge:${context.operation}-start`
    }));
  }
  if (options.invoked === true) {
    events.push(bridgeEvent(context, {
      lifecycle: "bridgeRenderInvoked",
      phase: phaseFor(context.operation),
      status: "success",
      timestamp: context.startedAt + 1,
      message: "bridge:render-invoked"
    }));
  }
  if (options.returned !== false) {
    events.push(bridgeEvent(result, {
      lifecycle: "afterBridgeOperation",
      phase: phaseFor(context.operation),
      status: result.outcome === "error"
        ? "error"
        : result.outcome === "skipped"
          ? "complete"
          : "success",
      timestamp: endedAt,
      message: `bridge:${context.operation}-${result.outcome}`
    }));
  }
  return report({
    traceId: options.traceId ?? `trace-${context.operationId}-${context.side}`,
    instanceRef: options.instanceRef ?? "mf-1",
    hostName: options.hostName ?? "host",
    remote: context.remote === undefined ? undefined : { name: context.remote },
    expose: context.expose,
    startedAt: context.startedAt,
    updatedAt: endedAt,
    duration: endedAt - context.startedAt,
    bridge: result,
    events
  });
}

export function bridgeInstance(options = {}) {
  const states = options.states ?? [];
  return instance({
    instanceRef: options.instanceRef ?? "mf-1",
    name: options.name ?? "host",
    role: options.role ?? "consumer",
    remotes: options.remotes ?? [{ name: "catalog", alias: "shop" }],
    loadedProducers: options.loadedProducers ?? [],
    bridge: options.available === false
      ? { available: false }
      : {
          available: true,
          lifecycleCount: 4,
          ...(states[0]?.framework === undefined
            ? {}
            : { framework: states[0].framework }),
          ...(states[0]?.moduleName === undefined
            ? {}
            : { moduleName: states[0].moduleName }),
          ...(states[0]?.remote === undefined ? {} : { remote: states[0].remote }),
          ...(states[0]?.expose === undefined ? {} : { expose: states[0].expose }),
          ...(states[0]?.status === undefined ? {} : { status: states[0].status }),
          ...(states[0]?.lastOperationAt === undefined
            ? {}
            : { lastOperationAt: states[0].lastOperationAt }),
          routeSyncObserved: states.some((state) => state.routeSyncObserved),
          states
        }
  });
}

export function bridgeState(overrides = {}) {
  return {
    bridgeId: "bridge-1",
    side: "consumer",
    framework: "react",
    moduleName: "catalog/App",
    remote: "catalog",
    expose: "./App",
    status: "rendered",
    lastOperation: "render",
    lastOperationId: "bridge-op-1",
    lastOperationAt: 110,
    routeSyncObserved: false,
    ...overrides
  };
}

export function bridgeSnapshot({
  instances,
  reports = [],
  bridgeCapability = capability(true, "complete"),
  stateOverrides = {},
  browserOverrides = {}
}) {
  const state = runtimeState({
    capabilities: {
      ...runtimeState().capabilities,
      bridgeTrace: bridgeCapability
    },
    instances,
    ...stateOverrides
  });
  return browserRead(state, reports, browserOverrides);
}

function bridgeEvent(bridge, options) {
  return {
    traceId: `event-${bridge.operationId}`,
    phase: options.phase,
    status: options.status,
    timestamp: options.timestamp,
    lifecycle: options.lifecycle,
    message: options.message,
    duration: bridge.duration,
    bridge
  };
}

function phaseFor(operation) {
  if (operation === "destroy") return "bridge-destroy";
  if (operation === "route-sync") return "bridge-route";
  return "bridge-render";
}
