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
import { ModernDevServerRuntimeState } from "./dev-server-state.js";
import { ModernPluginRuntimeState } from "./runtime-state.js";
import type {
  ModernPluginApi,
  ModernRuntimePlugin,
  OpenRuntimeModernPluginOptions
} from "./types.js";

export function openRuntimeModernPlugin(
  options: OpenRuntimeModernPluginOptions = {}
): ModernRuntimePlugin {
  return {
    name: "@openruntime/modern-plugin",
    setup(api: ModernPluginApi) {
      if (api.onBeforeRender !== undefined) {
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

      if (options.devServer !== false && hasDevServerHooks(api)) {
        const devServerState = new ModernDevServerRuntimeState(options);
        api.onBeforeDev?.(() => {
          devServerState.markStarting();
        });
        api.onAfterCreateCompiler?.((event) => {
          devServerState.markCompilerCreated(event);
        });
        api.onAfterDev?.((event) => {
          devServerState.markServerStarted(event);
        });
        api.onDevCompileDone?.((event) => {
          devServerState.markCompileDone(event);
        });
        api.onFileChanged?.((event) => {
          devServerState.markFileChanged(event);
        });
        api.onBeforeRestart?.(() => {
          devServerState.markBeforeRestart();
        });
      }
    }
  };
}

function hasDevServerHooks(api: ModernPluginApi): boolean {
  return api.onBeforeDev !== undefined ||
    api.onAfterDev !== undefined ||
    api.onAfterCreateCompiler !== undefined ||
    api.onDevCompileDone !== undefined ||
    api.onFileChanged !== undefined ||
    api.onBeforeRestart !== undefined;
}
