import { createModuleFederationConfig } from '@module-federation/rsbuild-plugin';

export default createModuleFederationConfig({
  name: 'divebell_mf_playground_remote',
  exposes: {
    '.': './src/index.tsx',
  },
  shareStrategy: 'loaded-first',
  shared: {
    react: {
      singleton: true,
    },
    'react-dom': {
      singleton: true,
    },
  },
});
