import type { OpenRuntimeCore, RuntimeStatus } from "@openruntime/core";
import type { ModernRouteObject } from "../modern/events.js";

export const modernTargetTypes = {
  app: "modern.app",
  ssr: "modern.ssr",
  hydration: "modern.hydration",
  route: "modern.route"
} as const;

const appStatuses = ["initializing", "rendering", "ready", "error"] as const;
const ssrStatuses = ["unknown", "server-rendered", "fallback", "error"] as const;
const hydrationStatuses = ["running", "success", "fallback", "error"] as const;
const routeStatuses = ["idle", "loading", "ready", "error"] as const;

export const modernTargetIds = {
  app: "modern:app",
  ssr: "modern:ssr",
  hydration: "modern:hydration",
  route: "modern:route"
} as const;

export interface RouteTargetInfo {
  routeId: string;
  route: ModernRouteObject;
  modernRouteId?: string;
  parentRouteId?: string;
  pathname?: string;
}

export interface RouteManifestEntry {
  routeId: string;
  hasLoader: boolean;
  hasComponent: boolean;
  hasLazyModule: boolean;
  path?: string;
  pathname?: string;
  modernRouteId?: string;
  index?: boolean;
  parentRouteId?: string;
}

export function registerBaseTargets(runtime: OpenRuntimeCore, source: string): void {
  runtime.registerTarget({
    id: modernTargetIds.app,
    type: modernTargetTypes.app,
    source,
    label: "Modern.js app",
    description: "Overall Modern.js runtime state for this page.",
    statuses: [...appStatuses]
  });
}

export function registerHydrationTarget(runtime: OpenRuntimeCore, source: string): void {
  runtime.registerTarget({
    id: modernTargetIds.hydration,
    type: modernTargetTypes.hydration,
    source,
    label: "Modern.js hydration",
    description: "Client hydration lifecycle for this page.",
    statuses: [...hydrationStatuses]
  });
}

export function registerSsrTarget(runtime: OpenRuntimeCore, source: string): void {
  runtime.registerTarget({
    id: modernTargetIds.ssr,
    type: modernTargetTypes.ssr,
    source,
    label: "Modern.js SSR",
    description: "Server-rendered payload state. Registered only when SSR data exists.",
    statuses: [...ssrStatuses]
  });
}

export function registerRouteTargetInfos(
  runtime: OpenRuntimeCore,
  source: string,
  routeInfos: RouteTargetInfo[]
): void {
  runtime.registerTarget({
    id: modernTargetIds.route,
    type: modernTargetTypes.route,
    source,
    label: "Modern.js route",
    description: "Current Modern.js route state and route manifest.",
    statuses: [...routeStatuses],
    data: {
      routes: routeInfos.map(getRouteManifestEntry)
    }
  });
}

export function updateTargetStatus(
  runtime: OpenRuntimeCore,
  source: string,
  targetId: string,
  status: RuntimeStatus,
  options: {
    data?: unknown;
    error?: { message: string; code?: string; stack?: string; data?: unknown };
    dependsOn?: string[];
  } = {}
): void {
  runtime.updateSnapshot({
    id: targetId,
    status,
    source,
    ...(options.data !== undefined ? { data: options.data } : {}),
    ...(options.error !== undefined ? { error: options.error } : {}),
    ...(options.dependsOn !== undefined ? { dependsOn: options.dependsOn } : {})
  });
}

export function flattenRoutes(routes: ModernRouteObject[]): RouteTargetInfo[] {
  const result: RouteTargetInfo[] = [];

  routes.forEach((route, index) => {
    collectRouteTargets(route, result, {
      fallbackId: String(index)
    });
  });

  return result;
}

export function getRouteManifestEntry(info: RouteTargetInfo): RouteManifestEntry {
  const data: RouteManifestEntry = {
    routeId: info.routeId,
    hasLoader: hasRouteLoader(info.route),
    hasComponent: hasRouteComponent(info.route),
    hasLazyModule: info.route.lazy !== undefined
  };

  if (info.route.path !== undefined) {
    data.path = info.route.path;
  }
  if (info.pathname !== undefined) {
    data.pathname = info.pathname;
  }
  if (info.modernRouteId !== undefined) {
    data.modernRouteId = info.modernRouteId;
  }
  if (info.route.index !== undefined) {
    data.index = info.route.index;
  }
  if (info.parentRouteId !== undefined) {
    data.parentRouteId = info.parentRouteId;
  }

  return data;
}

export function hasRouteComponent(route: ModernRouteObject | undefined): boolean {
  return route?.Component !== undefined || route?.component !== undefined || route?.element !== undefined || route?.lazy !== undefined;
}

export function hasRouteLoader(route: ModernRouteObject | undefined): boolean {
  if (route?.hasLoader === true) {
    return true;
  }

  if (typeof route?.loader !== "function") {
    return false;
  }

  return route.loader.length > 0;
}

function collectRouteTargets(
  route: ModernRouteObject,
  result: RouteTargetInfo[],
  context: {
    fallbackId: string;
    parentRouteId?: string;
    parentPathname?: string;
  }
): void {
  const pathname = getRoutePathname(route, context.parentPathname);
  const routeId = normalizeRouteId(route, context.fallbackId, pathname);
  const modernRouteId = normalizeModernRouteId(route);
  const parentRouteId = context.parentRouteId === routeId ? undefined : context.parentRouteId;
  const info: RouteTargetInfo = {
    routeId,
    route,
    ...(modernRouteId !== undefined ? { modernRouteId } : {}),
    ...(parentRouteId !== undefined ? { parentRouteId } : {}),
    ...(pathname !== undefined ? { pathname } : {})
  };
  result.push(info);

  route.children?.forEach((child, index) => {
    collectRouteTargets(child, result, {
      fallbackId: `${routeId}.${index}`,
      parentRouteId: routeId,
      ...((pathname ?? context.parentPathname) === undefined
        ? {}
        : { parentPathname: pathname ?? context.parentPathname })
    });
  });
}

function normalizeRouteId(route: ModernRouteObject, fallbackId: string, pathname: string | undefined): string {
  if (pathname !== undefined) return pathname;

  if (route.index === true) {
    return `index:${fallbackId}`;
  }
  if (typeof route.id === "string" && route.id.trim() !== "") {
    return route.id;
  }

  return `unnamed:${fallbackId}`;
}

function normalizeModernRouteId(route: ModernRouteObject): string | undefined {
  return typeof route.id === "string" && route.id.trim() !== "" ? route.id : undefined;
}

function getRoutePathname(route: ModernRouteObject, parentPathname: string | undefined): string | undefined {
  if (route.index === true) {
    return parentPathname;
  }
  if (typeof route.path !== "string" || route.path.trim() === "") {
    return undefined;
  }

  return joinRoutePath(parentPathname, route.path.trim());
}

function joinRoutePath(parentPathname: string | undefined, path: string): string {
  if (path.startsWith("/")) return normalizePathname(path);
  if (parentPathname === undefined || parentPathname === "") return normalizePathname(path);
  if (parentPathname === "/") return normalizePathname(`/${path}`);
  return normalizePathname(`${parentPathname}/${path}`);
}

function normalizePathname(pathname: string): string {
  const normalized = pathname.replace(/\/+/g, "/");
  if (normalized === "") return "/";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}
