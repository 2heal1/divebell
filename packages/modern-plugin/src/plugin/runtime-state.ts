import type {
  OpenRuntimeCore,
  OpenRuntimeWindowHost,
  RuntimeError,
  RuntimeStatus
} from "@openruntime/core";
import type {
  ModernRouteMatch,
  ModernRouteObject,
  ModernRouterState
} from "../modern/events.js";
import {
  flattenRoutes,
  getRouteManifestEntry,
  registerBaseTargets,
  registerHydrationTarget,
  registerRouteTargetInfos,
  registerSsrTarget,
  updateTargetStatus,
  modernTargetIds,
  type RouteManifestEntry,
  type RouteTargetInfo
} from "../runtime/targets.js";
import { resolveOpenRuntime } from "../runtime/resolve-runtime.js";
import type { OpenRuntimeModernPluginOptions } from "./types.js";

export interface RouteRuntimeData {
  pathname?: string;
  navigation?: string;
  matches: RouteRuntimeMatch[];
  errorRouteIds: string[];
}

export interface RouteRuntimeMatch extends RouteManifestEntry {
  loader?: RuntimeRouteLoaderStatus;
  routeComponent?: "error";
  error?: RuntimeError;
}

type RuntimeRouteLoaderStatus = "loading" | "success" | "redirect" | "error";
type RuntimeRouteComponentStatus = "loading" | "mounted" | "error";

interface RouteLoaderState {
  status: RuntimeRouteLoaderStatus;
  error?: RuntimeError;
  data?: unknown;
}

interface RouteComponentState {
  status: RuntimeRouteComponentStatus;
  error?: RuntimeError;
  data?: unknown;
}

export class ModernPluginRuntimeState {
  readonly source: string;
  readonly #options: OpenRuntimeModernPluginOptions;
  readonly #routes = new Map<string, RouteTargetInfo>();
  readonly #routeAliases = new Map<string, string>();
  readonly #loaderStates = new Map<string, RouteLoaderState>();
  readonly #componentStates = new Map<string, RouteComponentState>();
  readonly #routeErrors = new Map<string, RuntimeError>();
  #runtime?: OpenRuntimeCore;
  #currentMatches: RouteRuntimeMatch[] = [];
  #pathname: string | undefined;
  #navigation: string | undefined;

  constructor(options: OpenRuntimeModernPluginOptions) {
    this.#options = options;
    this.source = options.source ?? "modern.js";
  }

  getRuntime(): OpenRuntimeCore {
    this.#runtime ??= resolveOpenRuntime(this.#options);
    this.#ensureBaseTargets(this.#runtime);
    return this.#runtime;
  }

  getHost(): OpenRuntimeWindowHost | undefined {
    return this.#options.host;
  }

  registerRoutes(routes: ModernRouteObject[]): RouteTargetInfo[] {
    const routeInfos = flattenRoutes(routes);
    for (const info of routeInfos) {
      this.#upsertRoute(info);
    }

    return this.#syncRouteTarget();
  }

  registerRoute(route: ModernRouteObject): RouteTargetInfo[] {
    return this.registerRoutes([route]);
  }

  resolveRouteId(routeId: string): string {
    return this.#routeAliases.get(routeId) ?? routeId;
  }

  ensureHydrationTarget(): void {
    registerHydrationTarget(this.getRuntime(), this.source);
  }

  ensureSsrTarget(): void {
    const runtime = this.getRuntime();
    registerSsrTarget(runtime, this.source);
    updateInitialSnapshot(runtime, this.source, modernTargetIds.ssr, "unknown");
  }

  hasSsrTarget(): boolean {
    return this.getRuntime().getTargets({ id: modernTargetIds.ssr }).length > 0;
  }

  updateRouteFromRouterState(routes: ModernRouteObject[], routerState: ModernRouterState | undefined): void {
    this.registerRoutes(routes);
    this.#pathname = routerState?.location?.pathname;
    this.#navigation = routerState?.navigation?.state ?? "idle";
    this.#routeErrors.clear();

    for (const [routeId, error] of Object.entries(routerState?.errors ?? {})) {
      this.#routeErrors.set(this.resolveRouteId(routeId), toRouteError(error));
    }

    this.#currentMatches = dedupeRouteMatches(
      (routerState?.matches ?? []).map((match) => this.#createRouteMatch(match))
    );
    this.syncRouteSnapshot();
  }

  updateLoader(routeId: string, state: RouteLoaderState): void {
    const targetRouteId = this.resolveRouteId(routeId);
    if (targetRouteId === routeId) {
      this.registerRoute({ id: routeId, hasLoader: true });
    }

    this.#loaderStates.set(targetRouteId, state);
    if (state.error !== undefined) {
      this.#routeErrors.set(targetRouteId, state.error);
    }
    this.#refreshCurrentMatch(targetRouteId);
    this.syncRouteSnapshot();
  }

  updateComponent(routeId: string, state: RouteComponentState): void {
    const targetRouteId = this.resolveRouteId(routeId);
    if (targetRouteId === routeId) {
      this.registerRoute({ id: routeId, Component: true });
    }

    this.#componentStates.set(targetRouteId, state);
    if (state.error !== undefined) {
      this.#routeErrors.set(targetRouteId, state.error);
    }
    this.#refreshCurrentMatch(targetRouteId);
    this.syncRouteSnapshot();
  }

  syncRouteSnapshot(): void {
    const runtime = this.getRuntime();
    const status = this.#getRouteStatus();
    const error = status === "error" ? this.#getFirstRouteError() : undefined;
    updateTargetStatus(runtime, this.source, modernTargetIds.route, status, {
      data: this.#getRouteRuntimeData(),
      ...(error === undefined ? {} : { error })
    });
  }

  #ensureBaseTargets(runtime: OpenRuntimeCore): void {
    registerBaseTargets(runtime, this.source);
    updateInitialSnapshot(runtime, this.source, modernTargetIds.app, "initializing");
  }

  #upsertRoute(info: RouteTargetInfo): void {
    const existing = this.#routes.get(info.routeId);
    this.#routes.set(info.routeId, {
      routeId: info.routeId,
      route: {
        ...existing?.route,
        ...info.route,
        ...(info.route.children === undefined && existing?.route.children !== undefined
          ? { children: existing.route.children }
          : {})
      },
      ...(info.parentRouteId !== undefined
        ? { parentRouteId: info.parentRouteId }
        : existing?.parentRouteId === undefined
          ? {}
          : { parentRouteId: existing.parentRouteId }),
      ...(info.modernRouteId !== undefined
        ? { modernRouteId: info.modernRouteId }
        : existing?.modernRouteId === undefined
          ? {}
          : { modernRouteId: existing.modernRouteId }),
      ...(info.pathname !== undefined
        ? { pathname: info.pathname }
        : existing?.pathname === undefined
          ? {}
          : { pathname: existing.pathname })
    });

    if (info.modernRouteId !== undefined) {
      this.#routeAliases.set(info.modernRouteId, info.routeId);
    }
  }

  #syncRouteTarget(): RouteTargetInfo[] {
    const runtime = this.getRuntime();
    const routeInfos = [...this.#routes.values()];
    registerRouteTargetInfos(runtime, this.source, routeInfos);
    return routeInfos;
  }

  #createRouteMatch(match: ModernRouteMatch): RouteRuntimeMatch {
    const modernRouteId = match.route?.id ?? match.id;
    const routeId = modernRouteId === undefined ? match.pathname ?? "unknown" : this.resolveRouteId(modernRouteId);
    const routeInfo = this.#routes.get(routeId);
    if (routeInfo === undefined && modernRouteId !== undefined) {
      this.registerRoute({ id: modernRouteId });
    }

    const refreshedRouteInfo = this.#routes.get(routeId);
    const manifest = refreshedRouteInfo === undefined
      ? createFallbackManifest(routeId, modernRouteId, match.pathname)
      : getRouteManifestEntry(refreshedRouteInfo);
    return this.#attachRouteStepState({
      ...manifest,
      ...(match.pathname === undefined ? {} : { pathname: match.pathname })
    });
  }

  #refreshCurrentMatch(routeId: string): void {
    this.#currentMatches = this.#currentMatches.map((match) => {
      if (match.routeId !== routeId) {
        return match;
      }

      const routeInfo = this.#routes.get(routeId);
      const manifest = routeInfo === undefined ? match : getRouteManifestEntry(routeInfo);
      return this.#attachRouteStepState({
        ...manifest,
        ...(match.pathname === undefined ? {} : { pathname: match.pathname })
      });
    });
  }

  #attachRouteStepState(match: RouteManifestEntry): RouteRuntimeMatch {
    const loaderState = this.#loaderStates.get(match.routeId);
    const componentState = this.#componentStates.get(match.routeId);
    const routeError = this.#routeErrors.get(match.routeId);
    const next: RouteRuntimeMatch = { ...match };

    if (loaderState !== undefined) {
      next.loader = loaderState.status;
    }
    if (componentState?.status === "error") {
      next.routeComponent = "error";
    }
    if (routeError !== undefined) {
      next.error = routeError;
    } else if (loaderState?.error !== undefined) {
      next.error = loaderState.error;
    } else if (componentState?.error !== undefined) {
      next.error = componentState.error;
    }

    return next;
  }

  #getRouteRuntimeData(): RouteRuntimeData {
    return {
      ...(this.#pathname === undefined ? {} : { pathname: this.#pathname }),
      ...(this.#navigation === undefined ? {} : { navigation: this.#navigation }),
      matches: this.#currentMatches,
      errorRouteIds: [...this.#routeErrors.keys()]
    };
  }

  #getRouteStatus(): RuntimeStatus {
    if (this.#currentMatches.length === 0) {
      return "idle";
    }

    if (this.#routeErrors.size > 0 || this.#currentMatches.some((match) => match.error !== undefined || match.loader === "error" || match.routeComponent === "error")) {
      return "error";
    }

    if (this.#navigation !== undefined && this.#navigation !== "idle") {
      return "loading";
    }

    if (this.#currentMatches.some((match) => match.loader === "loading" || match.loader === "redirect")) {
      return "loading";
    }

    return "ready";
  }

  #getFirstRouteError(): RuntimeError | undefined {
    for (const match of this.#currentMatches) {
      if (match.error !== undefined) {
        return match.error;
      }
    }

    return this.#routeErrors.values().next().value;
  }
}

function createFallbackManifest(
  routeId: string,
  modernRouteId: string | undefined,
  pathname: string | undefined
): RouteManifestEntry {
  return {
    routeId,
    hasLoader: false,
    hasComponent: false,
    hasLazyModule: false,
    ...(pathname === undefined ? {} : { pathname }),
    ...(modernRouteId === undefined ? {} : { modernRouteId })
  };
}

function updateInitialSnapshot(
  runtime: OpenRuntimeCore,
  source: string,
  targetId: string,
  status: RuntimeStatus
): void {
  if (runtime.getSnapshot({ id: targetId }).targets[targetId] !== undefined) {
    return;
  }

  updateTargetStatus(runtime, source, targetId, status);
}

function toRouteError(error: unknown): RuntimeError {
  if (error instanceof Error) {
    return {
      message: error.message,
      ...(error.stack === undefined ? {} : { stack: error.stack })
    };
  }

  return {
    message: String(error)
  };
}

function dedupeRouteMatches(matches: RouteRuntimeMatch[]): RouteRuntimeMatch[] {
  const deduped: RouteRuntimeMatch[] = [];
  for (const match of matches) {
    if (deduped[deduped.length - 1]?.routeId === match.routeId) {
      deduped[deduped.length - 1] = match;
      continue;
    }

    deduped.push(match);
  }

  return deduped;
}
