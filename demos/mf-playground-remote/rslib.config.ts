import { pluginReact } from '@rsbuild/plugin-react';
import { defineConfig } from '@rslib/core';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import moduleFederationConfig from './module-federation.config';
import pkg from './package.json';

const shared = {
  dts: {
    bundle: false,
  },
};

export default defineConfig({
  lib: [
    {
      ...shared,
      format: 'mf',
      output: {
        // Published demos must keep their assets on the same immutable version.
        assetPrefix:
          process.env.NODE_ENV === 'production'
            ? `https://unpkg.com/${pkg.name}@${pkg.version}/dist/mf/`
            : undefined,
        distPath: {
          root: './dist/mf',
        },
      },
    },
  ],
  server: {
    port: 3001,
  },
  plugins: [
    pluginReact(),
    pluginModuleFederation(moduleFederationConfig),
  ],
});
