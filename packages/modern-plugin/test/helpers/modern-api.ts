import type {
  ModernRuntimePluginApi,
  ModernRuntimePlugin,
  ModernHydrationEvent,
  ModernRenderContext,
  ModernRouteComponentEvent,
  ModernRouteLoaderEvent,
  ModernRouterCreatedEvent,
  ModernRouterStateChangeEvent,
  ModernStreamSsrExtender
} from "../../dist/index.js";

export interface ModernApiHarness {
  api: ModernRuntimePluginApi;
  handlers: {
    onBeforeRender?: (context: ModernRenderContext) => void;
    onHydration?: (event: ModernHydrationEvent) => void;
    onRouterCreated?: (event: ModernRouterCreatedEvent) => void;
    onRouterStateChange?: (event: ModernRouterStateChangeEvent) => void;
    onRouteLoader?: (event: ModernRouteLoaderEvent) => void;
    onRouteComponent?: (event: ModernRouteComponentEvent) => void;
    extendStreamSSR?: () => ModernStreamSsrExtender;
  };
}

export function createModernApiHarness(plugin: ModernRuntimePlugin): ModernApiHarness {
  const handlers: ModernApiHarness["handlers"] = {};
  const api: ModernRuntimePluginApi = {
    onBeforeRender(handler) {
      handlers.onBeforeRender = handler;
    },
    onHydration(handler) {
      handlers.onHydration = handler;
    },
    onRouterCreated(handler) {
      handlers.onRouterCreated = handler;
    },
    onRouterStateChange(handler) {
      handlers.onRouterStateChange = handler;
    },
    onRouteLoader(handler) {
      handlers.onRouteLoader = handler;
    },
    onRouteComponent(handler) {
      handlers.onRouteComponent = handler;
    },
    extendStreamSSR(handler) {
      handlers.extendStreamSSR = handler;
    }
  };

  plugin.setup(api);

  return {
    api,
    handlers
  };
}
