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
  injectRouteListAction?: boolean;
  injectRouteNavigateAction?: boolean;
  devServer?: false | OpenRuntimeModernDevServerOptions;
}

export interface OpenRuntimeModernDevServerOptions {
  runtimeId?: string;
  url?: string;
  sessionId?: string;
}

export interface ModernRuntimePlugin {
  name: string;
  setup(api: ModernPluginApi): void;
}

export type ModernPluginApi = ModernRuntimePluginApi & ModernDevServerPluginApi;

export interface ModernRuntimePluginApi {
  onBeforeRender?: (handler: (context: ModernRenderContext) => void) => void;
  onHydration?: (handler: (event: ModernHydrationEvent) => void) => void;
  onRouterCreated?: (handler: (event: ModernRouterCreatedEvent) => void) => void;
  onRouterStateChange?: (handler: (event: ModernRouterStateChangeEvent) => void) => void;
  onRouteLoader?: (handler: (event: ModernRouteLoaderEvent) => void) => void;
  onRouteComponent?: (handler: (event: ModernRouteComponentEvent) => void) => void;
  extendStreamSSR?: (handler: () => ModernStreamSsrExtender) => void;
}

export interface ModernDevServerPluginApi {
  onBeforeDev?: (handler: () => MaybePromise<void>) => void;
  onAfterDev?: (handler: (event: ModernDevServerStartedEvent) => MaybePromise<void>) => void;
  onAfterCreateCompiler?: (handler: (event: ModernCompilerCreatedEvent) => MaybePromise<void>) => void;
  onDevCompileDone?: (handler: (event: ModernDevCompileDoneEvent) => MaybePromise<void>) => void;
  onFileChanged?: (handler: (event: ModernDevServerFileChangedEvent) => MaybePromise<void>) => void;
  onBeforeRestart?: (handler: () => MaybePromise<void>) => void;
}

export interface ModernDevServerStartedEvent {
  port: number;
}

export interface ModernCompilerCreatedEvent {
  compiler?: unknown;
  environments?: unknown;
}

export interface ModernDevCompileDoneEvent {
  isFirstCompile?: boolean;
  stats?: unknown;
  environments?: unknown;
}

export interface ModernDevServerFileChangedEvent {
  filename: string;
  eventType: "add" | "change" | "unlink";
  isPrivate: boolean;
}

type MaybePromise<T> = T | Promise<T>;
