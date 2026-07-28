# Modern.js Integration

Chinese version: [Modern.js 接入指南](modernjs-integration.zh-CN.md)

`@divebell/modern-plugin` is the official page-side integration for Modern.js. It turns lifecycle information that Modern.js already owns into stable Divebell facts, so a coding agent can inspect framework state instead of inferring it from DOM text, Console messages, or Network timing.

This package is a Modern.js runtime plugin, not a CLI Extension. Install it in the application and register it in `src/modern.runtime.ts`. Divebell still works without the plugin; add it when a task needs framework-internal route, loader, SSR, or hydration evidence.

## What the plugin provides

The plugin registers and updates:

- `modern:app`: the overall Modern.js render state;
- `modern:route`: the current route, known route manifest, navigation state, and current route matches;
- loader, redirect, route-component, and route errors inside the current route matches;
- `modern:ssr`: server-rendering state when SSR information exists;
- `modern:hydration`: browser hydration state when Modern.js emits hydration events; and
- optional route-list and route-navigation actions.

The plugin reports framework lifecycle. A ready framework route does not prove that the page's business data or user journey is ready. Keep business-owned success conditions in a business target or verify them with matching page and request evidence.

## Add the integration

Install the package:

```bash
pnpm add @divebell/modern-plugin
```

Register it in `src/modern.runtime.ts`:

```ts
import { defineRuntimeConfig } from "@modern-js/runtime";
import { divebellModernPlugin } from "@divebell/modern-plugin";

export default defineRuntimeConfig({
  plugins: [
    divebellModernPlugin({
      bridge: {
        port: 17321,
      },
    }),
  ],
});
```

The current integration guidance uses this plugin for Modern.js `>=3.4.0` and preview versions, where the required framework hooks are available. For an older version, expose the smallest stable business signal with [`@divebell/core`](runtime-sdk-api.md) instead of attempting to reconstruct missing framework lifecycle through browser heuristics.

Route actions are opt-in because navigation changes page state:

```ts
divebellModernPlugin({
  injectRouteListAction: true,
  injectRouteNavigateAction: true,
});
```

## Verify the integration

Open the page through the CLI, then confirm that a Runtime and the Modern.js targets are present:

```bash
divebell open http://localhost:3000/
divebell runtimes
divebell targets --query modern
divebell snapshot --query modern
```

Wait for a concrete route when the task depends on navigation:

```bash
divebell wait-for modern:route ready \
  --where pathname=/orders \
  --timeout 30000
```

If the page contains more than one Runtime, select the intended instance as described in [Browser Connections and Multiple Runtimes](runtime-connections.md).

## Related capabilities

The same package also provides `@divebell/modern-plugin/chunk-map` for build-time Chunk Map generation. Use that separate entry only when a task needs to map browser execution back to source files and dependencies; see [Code-Usage Analysis](code-usage-analysis.md).

For complete target fields, route actions, Garfish helpers, and business-ready helpers, see the [`@divebell/modern-plugin` package guide](../packages/modern-plugin/README.md).
