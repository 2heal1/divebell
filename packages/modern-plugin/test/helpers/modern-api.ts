import type {
  ModernRuntimePluginApi,
  ModernRuntimePlugin,
  ModernCompilerCreatedEvent,
  ModernDevCompileDoneEvent,
  ModernDevServerFileChangedEvent,
  ModernDevServerStartedEvent,
  ModernHydrationEvent,
  ModernPluginApi,
  ModernRenderContext,
  ModernRouteComponentEvent,
  ModernRouteLoaderEvent,
  ModernRouterCreatedEvent,
  ModernRouterStateChangeEvent,
  ModernStreamSsrExtender
} from "../../dist/index.js";

export interface ModernApiHarness {
  api: ModernPluginApi;
  handlers: {
    onBeforeRender?: (context: ModernRenderContext) => void;
    onHydration?: (event: ModernHydrationEvent) => void;
    onRouterCreated?: (event: ModernRouterCreatedEvent) => void;
    onRouterStateChange?: (event: ModernRouterStateChangeEvent) => void;
    onRouteLoader?: (event: ModernRouteLoaderEvent) => void;
    onRouteComponent?: (event: ModernRouteComponentEvent) => void;
    extendStreamSSR?: () => ModernStreamSsrExtender;
    onBeforeDev?: () => void | Promise<void>;
    onAfterDev?: (event: ModernDevServerStartedEvent) => void | Promise<void>;
    onAfterCreateCompiler?: (event: ModernCompilerCreatedEvent) => void | Promise<void>;
    onDevCompileDone?: (event: ModernDevCompileDoneEvent) => void | Promise<void>;
    onFileChanged?: (event: ModernDevServerFileChangedEvent) => void | Promise<void>;
    onBeforeRestart?: () => void | Promise<void>;
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

export function createModernCliApiHarness(plugin: ModernRuntimePlugin): ModernApiHarness {
  const handlers: ModernApiHarness["handlers"] = {};
  const api: ModernPluginApi = {
    onBeforeDev(handler) {
      handlers.onBeforeDev = handler;
    },
    onAfterDev(handler) {
      handlers.onAfterDev = handler;
    },
    onAfterCreateCompiler(handler) {
      handlers.onAfterCreateCompiler = handler;
    },
    onDevCompileDone(handler) {
      handlers.onDevCompileDone = handler;
    },
    onFileChanged(handler) {
      handlers.onFileChanged = handler;
    },
    onBeforeRestart(handler) {
      handlers.onBeforeRestart = handler;
    }
  };

  plugin.setup(api);

  return {
    api,
    handlers
  };
}
