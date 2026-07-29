import { createPackageInfo } from "@divebell/core";

export {
  createModernPlugin,
  divebellModernPlugin
} from "./plugin/create-plugin.js";
export type {
  CreateModernPluginOptions,
  ModernRuntimePlugin,
  ModernRuntimePluginFactory,
  ModernRuntimePluginApi,
  DivebellModernPluginOptions,
  DivebellServerBridgeOptions
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
  markDivebellReady,
  markDivebellReadyError,
  registerDivebellReady,
  unregisterDivebellReady
} from "./business/ready.js";
export type { RegisterDivebellReadyOptions } from "./business/ready.js";
export {
  createDivebellGarfishCustomLoader,
  createDivebellGarfishPlugin
} from "./garfish/plugin.js";
export { createDivebellGarfishReporter } from "./garfish/reporter.js";
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
  DivebellGarfishCustomLoaderOptions,
  DivebellGarfishPlugin,
  DivebellGarfishPluginFactory,
  DivebellGarfishPluginOptions,
  DivebellGarfishReporter,
  DivebellGarfishReporterOptions
} from "./garfish/types.js";

export const modernPluginPackageInfo = createPackageInfo(
  "@divebell/modern-plugin",
  "modern.js plugin"
);
