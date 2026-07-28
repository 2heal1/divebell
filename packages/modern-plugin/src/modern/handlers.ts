import type { DivebellWindowHost } from "@divebell/core";
import type {
  ModernHydrationEvent,
  ModernRenderContext,
  ModernRouteComponentEvent,
  ModernRouteLoaderEvent,
  ModernRouteObject,
  ModernRouterCreatedEvent,
  ModernRouterStateChangeEvent
} from "./events.js";
import {
  getPlainResponseData,
  toJsonSafeValue,
  toRuntimeError
} from "./serialize.js";
import { ModernPluginRuntimeState } from "../plugin/runtime-state.js";
import {
  modernTargetIds,
  updateTargetStatus
} from "../runtime/targets.js";
import {
  injectDivebellRenderContext,
  readDivebellRenderContext
} from "../runtime/render-context.js";
import { attachDivebellStreamSsrState } from "./stream-ssr.js";

export function handleBeforeRender(state: ModernPluginRuntimeState, context: ModernRenderContext): void {
  const serverRenderContext = isServerRenderContext(context) ? state.startServerRender() : undefined;
  const runtime = state.getRuntime();
  const routes = getRoutesFromContext(context);

  if (routes.length > 0) {
    state.registerRoutes(routes);
  }

  updateTargetStatus(runtime, state.source, modernTargetIds.app, "rendering", {
    data: {
      routeCount: routes.length
    }
  });
  if (serverRenderContext !== undefined) {
    updateServerSsrSnapshot(state, context, "rendering");
    state.syncServerBridge(getRequestUrl(context));
    let completed = false;
    const complete = () => {
      if (completed) {
        return;
      }
      completed = true;
      updateServerSsrSnapshot(state, context, "server-rendered");
      state.syncServerBridge(getRequestUrl(context));
    };
    attachDivebellStreamSsrState(context, serverRenderContext, complete);
    context.ssrContext?.htmlModifiers?.push((html) => {
      complete();
      return injectDivebellRenderContext(html, serverRenderContext);
    });
    return;
  }

  updateBrowserSsrSnapshot(state, context);
}

export function handleHydration(state: ModernPluginRuntimeState, event: ModernHydrationEvent): void {
  if (state.isHydrationSuppressed()) {
    return;
  }

  const runtime = state.getRuntime();
  state.ensureHydrationTarget();
  const status = getHydrationStatus(event.type);
  if (status === "success" && state.hasHydrationFailed()) {
    return;
  }
  if (status === "error") {
    state.markHydrationFailed();
  }
  const data = getHydrationData(event);

  updateTargetStatus(runtime, state.source, modernTargetIds.hydration, status, {
    data,
    ...(event.error === undefined ? {} : { error: toRuntimeError(event.error, "modern_hydration_error") })
  });

  if (event.type === "fallback" && state.hasSsrTarget()) {
    updateSsrFallbackFromHydration(state, data);
  } else if (shouldMarkSsrFallback(event)) {
    updateSsrFallbackFromHydration(state, data);
  }
  if (status === "error") {
    state.ensureSsrTarget();
    updateTargetStatus(runtime, state.source, modernTargetIds.ssr, "invalidated", {
      data: getSsrInvalidationData(data)
    });
    updateTargetStatus(runtime, state.source, modernTargetIds.app, "error", {
      data: getAppFailureData(data, modernTargetIds.hydration)
    });
  }
}

type HydrationData = {
  type: ModernHydrationEvent["type"];
  renderLevel?: unknown;
  renderMode?: string;
  reason?: string;
};

function getHydrationData(event: ModernHydrationEvent): HydrationData {
  return {
    type: event.type,
    ...(event.renderLevel === undefined ? {} : { renderLevel: event.renderLevel }),
    ...(event.renderMode === undefined ? {} : { renderMode: event.renderMode }),
    ...(event.reason === undefined ? {} : { reason: event.reason })
  };
}

function updateSsrFallbackFromHydration(
  state: ModernPluginRuntimeState,
  data: HydrationData
): void {
  const runtime = state.getRuntime();
  state.ensureSsrTarget();
  updateTargetStatus(runtime, state.source, modernTargetIds.ssr, "fallback", {
    data: getBrowserSsrHydrationData(data)
  });
}

function syncAppFromRoute(
  state: ModernPluginRuntimeState,
  readyData: Record<string, unknown>,
  options: {
    invalidateSsr?: boolean;
  } = {}
): void {
  const runtime = state.getRuntime();
  const routeStatus = state.getCurrentRouteStatus();
  if (routeStatus === "error") {
    updateTargetStatus(runtime, state.source, modernTargetIds.app, "error", {
      data: getRouteFailureData(state)
    });

    if (options.invalidateSsr === true && shouldInvalidateSsrFromRoute(state)) {
      state.suppressHydrationTarget();
      state.ensureSsrTarget();
      updateTargetStatus(runtime, state.source, modernTargetIds.ssr, "error", {
        data: getSsrErrorFromRoute(state)
      });
    }
    return;
  }

  if (routeStatus === "loading") {
    updateTargetStatus(runtime, state.source, modernTargetIds.app, "rendering", {
      data: readyData
    });
    return;
  }

  if (!state.hasHydrationFailed()) {
    updateTargetStatus(runtime, state.source, modernTargetIds.app, "ready", {
      data: readyData
    });
  }
}

function getRouteFailureData(state: ModernPluginRuntimeState): Record<string, unknown> {
  const errorRouteIds = state.getCurrentRouteErrorIds();
  return {
    failedTargetId: modernTargetIds.route,
    failedStatus: "error",
    reason: state.getCurrentRouteFailureReason(),
    ...(state.getCurrentRoutePathname() === undefined ? {} : { pathname: state.getCurrentRoutePathname() }),
    ...(errorRouteIds.length === 0 ? {} : { errorRouteIds })
  };
}

function shouldInvalidateSsrFromRoute(state: ModernPluginRuntimeState): boolean {
  return state.hasSsrTarget() || readDivebellRenderContext() !== undefined;
}

export function handleRouterCreated(state: ModernPluginRuntimeState, event: ModernRouterCreatedEvent): void {
  state.setRouter(event.router);
  state.updateRouteFromRouterState(event.routes, event.router.state);
  syncAppFromRoute(state, {
    basename: event.basename,
    routeCount: event.routes.length
  }, {
    invalidateSsr: true
  });
}

export function handleRouterStateChange(
  state: ModernPluginRuntimeState,
  event: ModernRouterStateChangeEvent
): void {
  state.setRouter(event.router);
  state.updateRouteFromRouterState(event.routes, event.state);
  syncAppFromRoute(state, {
    routeCount: event.routes.length
  });
}

export function handleRouteLoader(state: ModernPluginRuntimeState, event: ModernRouteLoaderEvent): void {
  if (event.type === "start") {
    state.updateLoader(event.routeId, {
      status: "loading",
      data: {
        modernRouteId: event.routeId
      }
    });
    syncAppFromRoute(state, getRouteReadyData(state));
    return;
  }

  if (event.type === "success") {
    state.updateLoader(event.routeId, {
      status: "success",
      data: {
        modernRouteId: event.routeId,
        result: toJsonSafeValue(event.result)
      }
    });
    syncAppFromRoute(state, getRouteReadyData(state));
    return;
  }

  if (event.type === "redirect") {
    state.updateLoader(event.routeId, {
      status: "redirect",
      data: {
        modernRouteId: event.routeId,
        redirect: getPlainResponseData(event.response)
      }
    });
    syncAppFromRoute(state, getRouteReadyData(state));
    return;
  }

  const error = toRuntimeError(event.error, "modern_loader_error");
  state.updateLoader(event.routeId, {
    status: "error",
    error
  });
  syncAppFromRoute(state, getRouteReadyData(state));
}

export function handleRouteComponent(state: ModernPluginRuntimeState, event: ModernRouteComponentEvent): void {
  const runtime = state.getRuntime();

  if (event.type === "render-error") {
    const error = toRuntimeError(event.error, "modern_route_render_error");
    if (event.componentStack !== undefined) {
      error.data = {
        ...(typeof error.data === "object" && error.data !== null ? error.data : {}),
        componentStack: event.componentStack
      };
    }

    state.updateComponent(event.routeId, {
      status: "error",
      error
    });
    syncAppFromRoute(state, getRouteReadyData(state));
    return;
  }

  if (event.type === "module-load-error") {
    const error = toRuntimeError(event.error, "modern_route_module_error");
    if (event.routeId === undefined) {
      updateTargetStatus(runtime, state.source, modernTargetIds.app, "error", {
        error
      });
      return;
    }

    state.updateComponent(event.routeId, {
      status: "error",
      error
    });
    syncAppFromRoute(state, getRouteReadyData(state));
    return;
  }

  if (event.type === "module-load") {
    state.updateComponent(event.routeId, {
      status: "loading",
      data: {
        modernRouteId: event.routeId,
        hasRouteModule: event.routeModule !== undefined
      }
    });
    syncAppFromRoute(state, getRouteReadyData(state));
    return;
  }

  state.updateComponent(event.routeId, {
    status: "mounted",
    data: {
      modernRouteId: event.routeId
    }
  });
  syncAppFromRoute(state, getRouteReadyData(state));
}

function getRouteReadyData(state: ModernPluginRuntimeState): Record<string, unknown> {
  return {
    routeCount: state.getRouteCount()
  };
}

function updateBrowserSsrSnapshot(state: ModernPluginRuntimeState, context: ModernRenderContext): void {
  if (readDivebellRenderContext() !== undefined) {
    return;
  }

  const runtime = state.getRuntime();
  const ssrData = getSsrData(state.getHost());
  if (ssrData === undefined) {
    return;
  }

  state.ensureSsrTarget();
  updateTargetStatus(runtime, state.source, modernTargetIds.ssr, "server-rendered", {
    data: {
      environment: "browser",
      hasSsrData: true,
      ssrData: toJsonSafeValue(ssrData),
      requestPathname: context.ssrContext?.request?.pathname
    }
  });
}

function shouldMarkSsrFallback(event: ModernHydrationEvent): boolean {
  return event.renderLevel !== undefined && event.renderLevel !== 2;
}

function getBrowserSsrHydrationData(data: HydrationData): Record<string, unknown> {
  const renderContext = readDivebellRenderContext();
  return {
    environment: "browser",
    ...(renderContext === undefined ? {} : {
      runtimeId: renderContext.runtimeId,
      renderId: renderContext.renderId
    }),
    ...data
  };
}

function getSsrInvalidationData(data: HydrationData): Record<string, unknown> {
  return {
    ...getBrowserSsrHydrationData(data),
    invalidatedBy: modernTargetIds.hydration,
    hydrationStatus: "error"
  };
}

function getSsrErrorFromRoute(state: ModernPluginRuntimeState): Record<string, unknown> {
  const renderContext = readDivebellRenderContext();
  const errorRouteIds = state.getCurrentRouteErrorIds();
  return {
    environment: "browser",
    ...(renderContext === undefined ? {} : {
      runtimeId: renderContext.runtimeId,
      renderId: renderContext.renderId
    }),
    phase: "server-render",
    reason: state.getCurrentRouteFailureReason(),
    failedTargetId: modernTargetIds.route,
    failedStatus: "error",
    ...(state.getCurrentRoutePathname() === undefined ? {} : { pathname: state.getCurrentRoutePathname() }),
    ...(errorRouteIds.length === 0 ? {} : { errorRouteIds })
  };
}

function getAppFailureData(data: HydrationData, failedTargetId: string): Record<string, unknown> {
  return {
    failedTargetId,
    failedStatus: "error",
    hydrationEventType: data.type,
    ...(data.reason === undefined ? {} : { reason: data.reason })
  };
}

function updateServerSsrSnapshot(
  state: ModernPluginRuntimeState,
  context: ModernRenderContext,
  status: "rendering" | "server-rendered"
): void {
  const runtime = state.getRuntime();
  const renderContext = state.getServerRenderContext();
  state.ensureSsrTarget();
  updateTargetStatus(runtime, state.source, modernTargetIds.ssr, status, {
    data: {
      environment: "server",
      ...(renderContext === undefined ? {} : {
        runtimeId: renderContext.runtimeId,
        renderId: renderContext.renderId
      }),
      requestPathname: context.ssrContext?.request?.pathname,
      requestUrl: getRequestUrl(context)
    }
  });
}

function getRoutesFromContext(context: ModernRenderContext): ModernRouteObject[] {
  return Array.isArray(context.routes) ? context.routes : [];
}

export function isServerRenderContext(context: ModernRenderContext): boolean {
  return context.ssrContext !== undefined && context.isBrowser !== true && typeof window === "undefined";
}

function getRequestUrl(context: ModernRenderContext): string {
  const request = context.ssrContext?.request;
  if (request?.url !== undefined && request.url.length > 0) {
    return request.url;
  }

  const host = request?.host ?? "server";
  const pathname = request?.pathname ?? "/";
  return `http://${host}${pathname}`;
}

function getHydrationStatus(type: ModernHydrationEvent["type"]): "running" | "success" | "fallback" | "error" {
  if (type === "start") return "running";
  if (type === "recoverable-error") return "error";
  return type;
}

function getSsrData(host: DivebellWindowHost | undefined): unknown {
  const candidate = host ?? getDefaultHost();
  return (candidate as { _SSR_DATA?: unknown } | undefined)?._SSR_DATA;
}

function getDefaultHost(): DivebellWindowHost | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window;
}
