import type { OpenRuntimeWindowHost } from "@openruntime/core";
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

export function handleBeforeRender(state: ModernPluginRuntimeState, context: ModernRenderContext): void {
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
  updateSsrSnapshot(state, context);
}

export function handleHydration(state: ModernPluginRuntimeState, event: ModernHydrationEvent): void {
  const runtime = state.getRuntime();
  state.ensureHydrationTarget();
  const status = getHydrationStatus(event.type);
  const data = {
    type: event.type,
    renderLevel: event.renderLevel,
    renderMode: event.renderMode,
    reason: event.reason
  };

  updateTargetStatus(runtime, state.source, modernTargetIds.hydration, status, {
    data,
    ...(event.error === undefined ? {} : { error: toRuntimeError(event.error, "modern_hydration_error") })
  });

  if (event.type === "fallback" && state.hasSsrTarget()) {
    updateTargetStatus(runtime, state.source, modernTargetIds.ssr, "fallback", {
      data
    });
  }
  if (event.type === "error") {
    if (state.hasSsrTarget()) {
      updateTargetStatus(runtime, state.source, modernTargetIds.ssr, "error", {
        data,
        ...(event.error === undefined ? {} : { error: toRuntimeError(event.error, "modern_hydration_error") })
      });
    }
    updateTargetStatus(runtime, state.source, modernTargetIds.app, "error", {
      data,
      ...(event.error === undefined ? {} : { error: toRuntimeError(event.error, "modern_hydration_error") })
    });
  }
}

export function handleRouterCreated(state: ModernPluginRuntimeState, event: ModernRouterCreatedEvent): void {
  const runtime = state.getRuntime();
  updateTargetStatus(runtime, state.source, modernTargetIds.app, "ready", {
    data: {
      basename: event.basename,
      routeCount: event.routes.length
    }
  });
  state.updateRouteFromRouterState(event.routes, event.router.state);
}

export function handleRouterStateChange(
  state: ModernPluginRuntimeState,
  event: ModernRouterStateChangeEvent
): void {
  state.updateRouteFromRouterState(event.routes, event.state);
}

export function handleRouteLoader(state: ModernPluginRuntimeState, event: ModernRouteLoaderEvent): void {
  if (event.type === "start") {
    state.updateLoader(event.routeId, {
      status: "loading",
      data: {
        modernRouteId: event.routeId
      }
    });
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
    return;
  }

  const error = toRuntimeError(event.error, "modern_loader_error");
  state.updateLoader(event.routeId, {
    status: "error",
    error
  });
}

export function handleRouteComponent(state: ModernPluginRuntimeState, event: ModernRouteComponentEvent): void {
  const runtime = state.getRuntime();

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
    return;
  }

  state.updateComponent(event.routeId, {
    status: "mounted",
    data: {
      modernRouteId: event.routeId
    }
  });
}

function updateSsrSnapshot(state: ModernPluginRuntimeState, context: ModernRenderContext): void {
  const runtime = state.getRuntime();
  const ssrData = getSsrData(state.getHost());
  if (ssrData === undefined) {
    return;
  }

  state.ensureSsrTarget();
  updateTargetStatus(runtime, state.source, modernTargetIds.ssr, "server-rendered", {
    data: {
      hasSsrData: true,
      ssrData: toJsonSafeValue(ssrData),
      requestPathname: context.ssrContext?.request?.pathname
    }
  });
}

function getRoutesFromContext(context: ModernRenderContext): ModernRouteObject[] {
  return Array.isArray(context.routes) ? context.routes : [];
}

function getHydrationStatus(type: ModernHydrationEvent["type"]): "running" | "success" | "fallback" | "error" {
  if (type === "start") return "running";
  return type;
}

function getSsrData(host: OpenRuntimeWindowHost | undefined): unknown {
  const candidate = host ?? getDefaultHost();
  return (candidate as { _SSR_DATA?: unknown } | undefined)?._SSR_DATA;
}

function getDefaultHost(): OpenRuntimeWindowHost | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window;
}
