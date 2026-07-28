import {
  handleBeforeRender,
  handleHydration,
  handleRouteComponent,
  handleRouteLoader,
  handleRouterCreated,
  handleRouterStateChange,
  isServerRenderContext
} from "../modern/handlers.js";
import { createDivebellStreamSsrExtender } from "../modern/stream-ssr.js";
import { ModernPluginRuntimeState } from "./runtime-state.js";
import type {
  ModernRuntimePlugin,
  ModernRuntimePluginApi,
  DivebellModernPluginOptions
} from "./types.js";

export function divebellModernPlugin(
  options: DivebellModernPluginOptions = {}
): ModernRuntimePlugin {
  return {
    name: "@divebell/modern-plugin",
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
      api.extendStreamSSR?.(() => createDivebellStreamSsrExtender());
    }
  };
}
