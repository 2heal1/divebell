import { createPackageInfo } from "@openruntime/core";

export { openRuntimeModernPlugin } from "./plugin/create-plugin.js";
export type {
  ModernRuntimePlugin,
  ModernRuntimePluginApi,
  OpenRuntimeModernPluginOptions
} from "./plugin/types.js";
export type {
  ModernDataRouter,
  ModernHydrationEvent,
  ModernNavigateOptions,
  ModernRenderContext,
  ModernRouteComponentEvent,
  ModernRouteLoaderEvent,
  ModernRouteMatch,
  ModernRouteObject,
  ModernRouterCreatedEvent,
  ModernRouterLocation,
  ModernRouterState,
  ModernRouterStateChangeEvent,
  ModernStreamSsrExtender
} from "./modern/events.js";
export {
  markOpenRuntimeReady,
  markOpenRuntimeReadyError,
  registerOpenRuntimeReady,
  unregisterOpenRuntimeReady
} from "./business/ready.js";
export type { RegisterOpenRuntimeReadyOptions } from "./business/ready.js";
export {
  createOpenRuntimeGarfishCustomLoader,
  createOpenRuntimeGarfishPlugin
} from "./garfish/plugin.js";
export { createOpenRuntimeGarfishReporter } from "./garfish/reporter.js";
export {
  modernGarfishStatuses,
  modernGarfishTargetIds,
  modernGarfishTargetTypes
} from "./garfish/types.js";
export type {
  GarfishAppInfoLike,
  GarfishAppInstanceLike,
  GarfishCustomLoader,
  GarfishExecOptionsLike,
  GarfishLoaderResult,
  GarfishProviderLike,
  ModernGarfishStatus,
  OpenRuntimeGarfishCustomLoaderOptions,
  OpenRuntimeGarfishPlugin,
  OpenRuntimeGarfishPluginFactory,
  OpenRuntimeGarfishPluginOptions,
  OpenRuntimeGarfishReporter,
  OpenRuntimeGarfishReporterOptions
} from "./garfish/types.js";

export const modernPluginPackageInfo = createPackageInfo(
  "@openruntime/modern-plugin",
  "modern.js plugin"
);
