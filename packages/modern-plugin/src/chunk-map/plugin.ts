import {
  DivebellChunkMapRspackPlugin,
  type DivebellChunkMapPluginOptions
} from "@divebell/rspack-plugin";

export type { DivebellChunkMapPluginOptions } from "@divebell/rspack-plugin";
export { DivebellChunkMapRspackPlugin } from "@divebell/rspack-plugin";

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

export function divebellChunkMapPlugin(
  options: DivebellChunkMapPluginOptions = {}
): ModernCliPluginLike {
  return {
    name: "@divebell/modern-plugin/chunk-map",
    post: ["@modern-js/app-tools"],
    setup(api) {
      api.modifyRspackConfig((config) => {
        config.plugins = [
          ...(config.plugins ?? []),
          new DivebellChunkMapRspackPlugin({
            ...options,
            generator: "@divebell/modern-plugin"
          })
        ];
      });
    }
  };
}
