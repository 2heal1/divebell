import type {
  OpenRuntimeCore,
  OpenRuntimeWindowHost,
  RuntimeError,
  RuntimeInputOption,
  RuntimeStatus
} from "@openruntime/core";
import {
  createOpenRuntime,
  syncServerRuntimeBridge
} from "@openruntime/core";
import type {
  ModernDataRouter,
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
import {
  createOpenRuntimeRenderContext,
  type OpenRuntimeRenderContext
} from "../runtime/render-context.js";
import type { OpenRuntimeModernPluginOptions } from "./types.js";

export interface RouteRuntimeData {
  pathname?: string;
  navigation?: string;
  matches: RouteRuntimeMatch[];
  errorRouteIds: string[];
}

export interface RouteRuntimeMatch extends Omit<RouteManifestEntry, "hasLoader" | "hasRouteComponent"> {
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

const routeListActionName = "modern.route.list";
const routeNavigateActionName = "modern.route.navigate";

type NavigableRouteManifestEntry = RouteManifestEntry & {
  pathname: string;
};

export class ModernPluginRuntimeState {
  readonly source: string;
  readonly #options: OpenRuntimeModernPluginOptions;
  readonly #routes = new Map<string, RouteTargetInfo>();
  readonly #routeAliases = new Map<string, string>();
  readonly #loaderStates = new Map<string, RouteLoaderState>();
  readonly #componentStates = new Map<string, RouteComponentState>();
  readonly #routeErrors = new Map<string, RuntimeError>();
  readonly #routeListActionRuntimes = new WeakSet<OpenRuntimeCore>();
  readonly #routeNavigateActionRuntimes = new WeakSet<OpenRuntimeCore>();
  #runtime?: OpenRuntimeCore;
  #router?: ModernDataRouter;
  #serverRenderContext?: OpenRuntimeRenderContext;
  #serverSyncQueue: Promise<void> = Promise.resolve();
  #currentMatches: RouteRuntimeMatch[] = [];
  #pathname: string | undefined;
  #navigation: string | undefined;
  #hydrationFailed = false;
  #hydrationSuppressed = false;

  constructor(options: OpenRuntimeModernPluginOptions) {
    this.#options = options;
    this.source = options.source ?? "modern.js";
  }

  getRuntime(): OpenRuntimeCore {
    this.#runtime ??= resolveOpenRuntime({
      ...this.#options,
      beforeConnect: (runtime) => this.#ensureBaseTargets(runtime)
    });
    this.#ensureBaseTargets(this.#runtime);
    return this.#runtime;
  }

  getHost(): OpenRuntimeWindowHost | undefined {
    return this.#options.host;
  }

  setRouter(router: ModernDataRouter): void {
    this.#router = router;
  }

  startServerRender(): OpenRuntimeRenderContext {
    this.#runtime = createOpenRuntime();
    this.#serverRenderContext = createOpenRuntimeRenderContext(this.source);
    return this.#serverRenderContext;
  }

  getServerRenderContext(): OpenRuntimeRenderContext | undefined {
    return this.#serverRenderContext;
  }

  syncServerBridge(url: string): void {
    if (this.#serverRenderContext === undefined || this.#options.bridge === undefined || this.#options.bridge === false) {
      return;
    }

    const bridge = this.#options.bridge;
    const runtime = this.getRuntime();
    const renderContext = this.#serverRenderContext;
    this.#serverSyncQueue = this.#serverSyncQueue.then(() => syncServerRuntimeBridge(runtime, {
      runtimeId: renderContext.runtimeId,
      renderId: renderContext.renderId,
      url,
      source: this.source,
      ...(bridge.port === undefined ? {} : { port: bridge.port })
    }).then(() => undefined)).catch(() => {
      // Server rendering should not fail just because the optional local Bridge is unavailable.
    });
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
    if (this.#hydrationSuppressed) {
      return;
    }

    registerHydrationTarget(this.getRuntime(), this.source);
  }

  ensureSsrTarget(): void {
    const runtime = this.getRuntime();
    registerSsrTarget(runtime, this.source);
    updateInitialSnapshot(runtime, this.source, modernTargetIds.ssr, "unknown");
  }

  hasHydrationFailed(): boolean {
    return this.#hydrationFailed;
  }

  markHydrationFailed(): void {
    this.#hydrationFailed = true;
  }

  suppressHydrationTarget(): void {
    this.#hydrationSuppressed = true;
    this.getRuntime().unregisterTarget(modernTargetIds.hydration);
  }

  isHydrationSuppressed(): boolean {
    return this.#hydrationSuppressed;
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

  getCurrentRouteStatus(): RuntimeStatus {
    return this.#getRouteStatus();
  }

  getCurrentRoutePathname(): string | undefined {
    return this.#pathname;
  }

  getCurrentRouteErrorIds(): string[] {
    return [...this.#routeErrors.keys()];
  }

  getRouteCount(): number {
    return this.#routes.size;
  }

  getCurrentRouteFailureReason(): "route-loader-error" | "route-component-error" | "route-error" {
    if (this.#currentMatches.some((match) => match.loader === "error")) {
      return "route-loader-error";
    }
    if (this.#currentMatches.some((match) => match.routeComponent === "error")) {
      return "route-component-error";
    }

    return "route-error";
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
    registerRouteTargetInfos(runtime, this.source, [...this.#routes.values()]);
    this.#ensureRouteActions(runtime);
    updateInitialSnapshot(runtime, this.source, modernTargetIds.app, "initializing");
  }

  #ensureRouteActions(runtime: OpenRuntimeCore): void {
    if (this.#serverRenderContext !== undefined) {
      return;
    }

    if (this.#options.injectRouteListAction === true && !this.#routeListActionRuntimes.has(runtime)) {
      runtime.registerAction({
        name: routeListActionName,
        description: "List Modern.js routes known by the current page.",
        source: this.source,
        risk: "safe",
        handler: () => ({
          routes: this.#getRouteManifestEntries(),
          routeCount: this.#routes.size
        })
      });
      this.#routeListActionRuntimes.add(runtime);
    }

    if (this.#options.injectRouteNavigateAction === true && !this.#routeNavigateActionRuntimes.has(runtime)) {
      runtime.registerAction({
        name: routeNavigateActionName,
        description: "Navigate to a known Modern.js route.",
        source: this.source,
        risk: "state-changing",
        inputSchema: {
          type: "object",
          properties: {
            to: {
              type: "string",
              description: "Known route pathname to navigate to."
            },
            replace: {
              type: "boolean",
              description: "Replace the current history entry instead of pushing a new entry."
            }
          },
          required: ["to"],
          additionalProperties: false
        },
        getInputOptions: (inputName) => {
          if (inputName !== "to") {
            return [];
          }

          return this.#getRouteNavigateOptions();
        },
        handler: async (payload) => this.#navigateRoute(payload)
      });
      this.#routeNavigateActionRuntimes.add(runtime);
    }
  }

  #getRouteManifestEntries(): RouteManifestEntry[] {
    return [...this.#routes.values()].map(getRouteManifestEntry);
  }

  #getRouteNavigateOptions(): RuntimeInputOption[] {
    const seen = new Set<string>();
    const options: RuntimeInputOption[] = [];

    for (const route of this.#getRouteManifestEntries()) {
      if (!isNavigableRouteManifestEntry(route) || seen.has(route.pathname)) {
        continue;
      }

      seen.add(route.pathname);
      options.push({
        value: route.pathname,
        description: getRouteOptionDescription(route)
      });
    }

    return options;
  }

  async #navigateRoute(payload: unknown): Promise<Record<string, unknown>> {
    const input = isRecord(payload) ? payload : {};
    const to = typeof input.to === "string" ? input.to.trim() : "";
    if (to === "") {
      throw new Error("Route navigation requires a non-empty to value.");
    }

    const route = this.#resolveNavigableRoute(to);
    if (route === undefined) {
      throw new Error(`Route "${to}" is not in the Modern.js route list.`);
    }

    const router = this.#router;
    if (typeof router?.navigate !== "function") {
      throw new Error("Modern.js router navigation is not available.");
    }

    const replace = input.replace === true;
    await router.navigate(route.pathname, { replace });

    return {
      to: route.pathname,
      routeId: route.routeId,
      replace
    };
  }

  #resolveNavigableRoute(to: string): NavigableRouteManifestEntry | undefined {
    return this.#getRouteManifestEntries().find((route): route is NavigableRouteManifestEntry => {
      if (!isNavigableRouteManifestEntry(route)) {
        return false;
      }

      return route.pathname === to || route.routeId === to;
    });
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
      const manifest = routeInfo === undefined
        ? createFallbackManifest(match.routeId, match.modernRouteId, match.pathname)
        : getRouteManifestEntry(routeInfo);
      return this.#attachRouteStepState({
        ...manifest,
        ...(match.pathname === undefined ? {} : { pathname: match.pathname })
      });
    });
  }

  #attachRouteStepState(match: RouteManifestEntry): RouteRuntimeMatch {
    const {
      hasLoader,
      hasRouteComponent: _hasRouteComponent,
      ...matchData
    } = match;
    const loaderState = this.#loaderStates.get(match.routeId);
    const componentState = this.#componentStates.get(match.routeId);
    const routeError = this.#routeErrors.get(match.routeId);
    const next: RouteRuntimeMatch = { ...matchData };

    if (loaderState !== undefined) {
      next.loader = loaderState.status;
    } else if (hasLoader) {
      next.loader = routeError === undefined ? "success" : "error";
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
    hasRouteComponent: false,
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

function getRouteOptionDescription(route: RouteManifestEntry): string {
  if (route.modernRouteId !== undefined && route.modernRouteId !== route.pathname) {
    return route.modernRouteId;
  }

  return route.routeId;
}

function isNavigableRouteManifestEntry(route: RouteManifestEntry): route is NavigableRouteManifestEntry {
  return typeof route.pathname === "string" && route.pathname.startsWith("/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
