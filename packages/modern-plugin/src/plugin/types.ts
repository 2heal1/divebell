import type { BridgeConnectOptions, OpenRuntimeCore, OpenRuntimeWindowHost } from "@openruntime/core";
import type {
  ModernHydrationEvent,
  ModernRenderContext,
  ModernRouteComponentEvent,
  ModernRouteLoaderEvent,
  ModernRouterCreatedEvent,
  ModernRouterStateChangeEvent,
  ModernStreamSsrExtender
} from "../modern/events.js";

export interface OpenRuntimeModernPluginOptions {
  runtime?: OpenRuntimeCore;
  source?: string;
  bridge?: false | BridgeConnectOptions;
  host?: OpenRuntimeWindowHost;
}

export interface ModernRuntimePlugin {
  name: string;
  setup(api: ModernRuntimePluginApi): void;
}

export interface ModernRuntimePluginApi {
  onBeforeRender(handler: (context: ModernRenderContext) => void): void;
  onHydration?: (handler: (event: ModernHydrationEvent) => void) => void;
  onRouterCreated?: (handler: (event: ModernRouterCreatedEvent) => void) => void;
  onRouterStateChange?: (handler: (event: ModernRouterStateChangeEvent) => void) => void;
  onRouteLoader?: (handler: (event: ModernRouteLoaderEvent) => void) => void;
  onRouteComponent?: (handler: (event: ModernRouteComponentEvent) => void) => void;
  extendStreamSSR?: (handler: () => ModernStreamSsrExtender) => void;
}
