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

export const modernPluginPackageInfo = createPackageInfo(
  "@openruntime/modern-plugin",
  "modern.js plugin"
);
