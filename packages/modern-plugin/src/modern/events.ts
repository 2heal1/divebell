export interface ModernRouteObject {
  id?: string;
  path?: string;
  index?: boolean;
  children?: ModernRouteObject[];
  loader?: unknown;
  hasLoader?: boolean;
  Component?: unknown;
  component?: unknown;
  element?: unknown;
  lazy?: unknown;
}

export interface ModernHydrationEvent {
  type: "start" | "success" | "fallback" | "error";
  context?: unknown;
  renderLevel?: unknown;
  renderMode?: string;
  reason?: string;
  root?: unknown;
  error?: unknown;
}

export interface ModernRouterCreatedEvent {
  router: ModernDataRouter;
  routes: ModernRouteObject[];
  basename: string;
  context?: unknown;
}

export interface ModernRouterStateChangeEvent {
  router: ModernDataRouter;
  routes: ModernRouteObject[];
  state: ModernRouterState;
  context?: unknown;
}

export type ModernRouteLoaderEvent =
  | {
      type: "start";
      routeId: string;
      args?: unknown;
    }
  | {
      type: "success";
      routeId: string;
      args?: unknown;
      result?: unknown;
    }
  | {
      type: "redirect";
      routeId: string;
      args?: unknown;
      response?: unknown;
    }
  | {
      type: "error";
      routeId: string;
      args?: unknown;
      error?: unknown;
    };

export type ModernRouteComponentEvent =
  | {
      type: "module-load";
      routeId: string;
      routeModule?: unknown;
    }
  | {
      type: "module-load-error";
      routeId?: string;
      error?: unknown;
    }
  | {
      type: "mount";
      routeId: string;
    };

export interface ModernDataRouter {
  state?: ModernRouterState;
}

export interface ModernRouterState {
  location?: ModernRouterLocation;
  navigation?: ModernNavigationState;
  matches?: ModernRouteMatch[];
  errors?: Record<string, unknown> | null;
}

export interface ModernRouterLocation {
  pathname?: string;
  search?: string;
  hash?: string;
  key?: string;
}

export interface ModernNavigationState {
  state?: string;
  location?: ModernRouterLocation;
}

export interface ModernRouteMatch {
  route?: {
    id?: string;
  };
  id?: string;
  pathname?: string;
}

export interface ModernRenderContext {
  routes?: ModernRouteObject[];
  router?: unknown;
  ssrContext?: {
    request?: {
      pathname?: string;
    };
  };
}
