import type {
  BridgeConnectOptions,
  OpenRuntimeCore,
  OpenRuntimeWindowHost,
  RuntimeError
} from "@openruntime/core";

export const modernGarfishTargetTypes = {
  root: "modern.garfish",
  app: "modern.garfish.app"
} as const;

export const modernGarfishTargetIds = {
  root: "modern:garfish",
  app(name: string): string {
    return `modern:garfish:app:${encodeURIComponent(name)}`;
  }
} as const;

export const modernGarfishStatuses = [
  "idle",
  "registered",
  "loading",
  "loaded",
  "evaluating",
  "evaluated",
  "mounting",
  "rendering",
  "mounted",
  "unmounting",
  "unmounted",
  "error"
] as const;

export type ModernGarfishStatus = typeof modernGarfishStatuses[number];

export interface OpenRuntimeGarfishReporterOptions {
  runtime?: OpenRuntimeCore;
  source?: string;
  bridge?: false | BridgeConnectOptions;
  host?: OpenRuntimeWindowHost;
}

export interface OpenRuntimeGarfishPluginOptions extends OpenRuntimeGarfishReporterOptions {
  reporter?: OpenRuntimeGarfishReporter;
}

export interface OpenRuntimeGarfishCustomLoaderOptions extends OpenRuntimeGarfishReporterOptions {
  reporter?: OpenRuntimeGarfishReporter;
  loader?: GarfishCustomLoader;
}

export interface OpenRuntimeGarfishReporter {
  registerApp(appInfo: GarfishAppInfoLike): void;
  updateApp(
    appInfo: GarfishAppInfoLike,
    status: ModernGarfishStatus,
    details?: OpenRuntimeGarfishUpdateDetails
  ): void;
  markProviderRenderCalled(appInfo: GarfishAppInfoLike, payload?: unknown): void;
  markProviderDestroyCalled(appInfo: GarfishAppInfoLike, payload?: unknown): void;
}

export interface OpenRuntimeGarfishUpdateDetails {
  lifecycle?: string;
  phase?: string;
  basename?: string;
  scriptUrl?: string;
  appInstance?: GarfishAppInstanceLike | null;
  execOptions?: GarfishExecOptionsLike;
  error?: RuntimeError;
  payload?: unknown;
}

export interface GarfishAppInfoLike {
  name?: unknown;
  entry?: unknown;
  activeWhen?: unknown;
  basename?: unknown;
  domGetter?: unknown;
  cache?: unknown;
  props?: unknown;
  [key: string]: unknown;
}

export interface GarfishAppInstanceLike {
  appId?: unknown;
  mounted?: unknown;
  display?: unknown;
  active?: unknown;
  appInfo?: GarfishAppInfoLike;
  [key: string]: unknown;
}

export interface GarfishExecOptionsLike {
  async?: unknown;
  defer?: unknown;
  noEntry?: unknown;
  isInline?: unknown;
  isModule?: unknown;
  [key: string]: unknown;
}

export interface GarfishProviderLike {
  render?: (payload: GarfishProviderRenderPayload) => unknown;
  destroy?: (payload: GarfishProviderDestroyPayload) => unknown;
  [key: string]: unknown;
}

export interface GarfishProviderRenderPayload {
  appName?: unknown;
  dom?: unknown;
  basename?: unknown;
  appRenderInfo?: unknown;
  props?: unknown;
  [key: string]: unknown;
}

export interface GarfishProviderDestroyPayload {
  appName?: unknown;
  dom?: unknown;
  appRenderInfo?: unknown;
  props?: unknown;
  [key: string]: unknown;
}

export interface GarfishLoaderResult {
  mount?: (payload: GarfishProviderRenderPayload) => unknown;
  unmount?: (payload: GarfishProviderDestroyPayload) => unknown;
}

export type GarfishCustomLoader = (
  provider: GarfishProviderLike,
  appInfo: GarfishAppInfoLike,
  basename?: string
) => GarfishLoaderResult | undefined | Promise<GarfishLoaderResult | undefined>;

export interface OpenRuntimeGarfishPlugin {
  name: string;
  version?: string;
  beforeRegisterApp?: (appInfo: GarfishAppInfoLike | GarfishAppInfoLike[]) => void;
  registerApp?: (apps: Record<string, GarfishAppInfoLike> | GarfishAppInfoLike[]) => void;
  beforeLoad?: (appInfo: GarfishAppInfoLike) => void;
  afterLoad?: (appInfo: GarfishAppInfoLike, appInstance?: GarfishAppInstanceLike | null) => void;
  errorLoadApp?: (error: unknown, appInfo: GarfishAppInfoLike) => void;
  beforeEval?: (
    appInfo: GarfishAppInfoLike,
    code?: string,
    env?: Record<string, unknown>,
    scriptUrl?: string,
    execOptions?: GarfishExecOptionsLike
  ) => void;
  afterEval?: (
    appInfo: GarfishAppInfoLike,
    code?: string,
    env?: Record<string, unknown>,
    scriptUrl?: string,
    execOptions?: GarfishExecOptionsLike
  ) => void;
  errorExecCode?: (
    error: unknown,
    appInfo: GarfishAppInfoLike,
    code?: string,
    env?: Record<string, unknown>,
    scriptUrl?: string,
    execOptions?: GarfishExecOptionsLike
  ) => void;
  beforeMount?: (appInfo: GarfishAppInfoLike, appInstance?: GarfishAppInstanceLike, cacheMode?: boolean) => void;
  afterMount?: (appInfo: GarfishAppInfoLike, appInstance?: GarfishAppInstanceLike, cacheMode?: boolean) => void;
  errorMountApp?: (error: unknown, appInfo: GarfishAppInfoLike) => void;
  beforeUnmount?: (appInfo: GarfishAppInfoLike, appInstance?: GarfishAppInstanceLike, cacheMode?: boolean) => void;
  afterUnmount?: (appInfo: GarfishAppInfoLike, appInstance?: GarfishAppInstanceLike, cacheMode?: boolean) => void;
  errorUnmountApp?: (error: unknown, appInfo: GarfishAppInfoLike) => void;
}

export type OpenRuntimeGarfishPluginFactory = (context: unknown) => OpenRuntimeGarfishPlugin;
