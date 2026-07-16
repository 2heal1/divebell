import {
  OpenRuntimeChunkMapRspackPlugin,
  type OpenRuntimeChunkMapPluginOptions
} from "@openruntime/rspack-plugin";

export type { OpenRuntimeChunkMapPluginOptions } from "@openruntime/rspack-plugin";
export { OpenRuntimeChunkMapRspackPlugin } from "@openruntime/rspack-plugin";

export interface ModernCliPluginApiLike {
  modifyRspackConfig(handler: (config: RspackConfigLike) => void): void;
}

export interface ModernCliPluginLike {
  name: string;
  post?: string[];
  setup(api: ModernCliPluginApiLike): void;
}

interface RspackConfigLike {
  plugins?: unknown[];
}

export function openRuntimeChunkMapPlugin(
  options: OpenRuntimeChunkMapPluginOptions = {}
): ModernCliPluginLike {
  return {
    name: "@openruntime/modern-plugin/chunk-map",
    post: ["@modern-js/app-tools"],
    setup(api) {
      api.modifyRspackConfig((config) => {
        config.plugins = [
          ...(config.plugins ?? []),
          new OpenRuntimeChunkMapRspackPlugin({
            ...options,
            generator: "@openruntime/modern-plugin"
          })
        ];
      });
    }
  };
}
