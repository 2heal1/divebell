import {
  handleBeforeRender,
  handleHydration,
  handleRouteComponent,
  handleRouteLoader,
  handleRouterCreated,
  handleRouterStateChange,
  isServerRenderContext
} from "../modern/handlers.js";
import { createOpenRuntimeStreamSsrExtender } from "../modern/stream-ssr.js";
import { ModernPluginRuntimeState } from "./runtime-state.js";
import type {
  ModernRuntimePlugin,
  ModernRuntimePluginApi,
  OpenRuntimeModernPluginOptions
} from "./types.js";

export function openRuntimeModernPlugin(
  options: OpenRuntimeModernPluginOptions = {}
): ModernRuntimePlugin {
  return {
    name: "@openruntime/modern-plugin",
    setup(api: ModernRuntimePluginApi) {
      const state = new ModernPluginRuntimeState(options);
      state.getRuntime();

      api.onBeforeRender((context) => {
        handleBeforeRender(
          isServerRenderContext(context) ? new ModernPluginRuntimeState(options) : state,
          context
        );
      });
      api.onHydration?.((event) => {
        handleHydration(state, event);
      });
      api.onRouterCreated?.((event) => {
        handleRouterCreated(state, event);
      });
      api.onRouterStateChange?.((event) => {
        handleRouterStateChange(state, event);
      });
      api.onRouteLoader?.((event) => {
        handleRouteLoader(state, event);
      });
      api.onRouteComponent?.((event) => {
        handleRouteComponent(state, event);
      });
      api.extendStreamSSR?.(() => createOpenRuntimeStreamSsrExtender());
    }
  };
}
