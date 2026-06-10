import type { BridgeConnectOptions, OpenRuntimeCore, OpenRuntimeWindowHost } from "@openruntime/core";
import type { RuntimePlugin } from "@modern-js/runtime";
import type {
  ModernHydrationEvent,
  ModernRenderContext,
  ModernRouteComponentEvent,
  ModernRouteLoaderEvent,
  ModernRouterCreatedEvent,
  ModernRouterStateChangeEvent
} from "../modern/events.js";

export interface OpenRuntimeModernPluginOptions {
  runtime?: OpenRuntimeCore;
  source?: string;
  bridge?: false | BridgeConnectOptions;
  host?: OpenRuntimeWindowHost;
}

export interface ModernRuntimePlugin extends Omit<RuntimePlugin, "setup"> {
  setup(api: ModernRuntimePluginApi): void;
}

export interface ModernRuntimePluginApi {
  onBeforeRender(handler: (context: ModernRenderContext) => void): void;
  onHydration?: (handler: (event: ModernHydrationEvent) => void) => void;
  onRouterCreated?: (handler: (event: ModernRouterCreatedEvent) => void) => void;
  onRouterStateChange?: (handler: (event: ModernRouterStateChangeEvent) => void) => void;
  onRouteLoader?: (handler: (event: ModernRouteLoaderEvent) => void) => void;
  onRouteComponent?: (handler: (event: ModernRouteComponentEvent) => void) => void;
}
