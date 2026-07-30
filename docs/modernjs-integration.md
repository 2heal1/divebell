# Modern.js Integration (WIP)

> **WIP:** Do not adopt `@divebell/modern-plugin` in a regular project yet. The runtime integration depends on new Modern.js lifecycle hooks that have not been included in a published Modern.js version. Until a compatible release is available and verified, use browser evidence or expose the smallest stable application signal with [`@divebell/core`](runtime-sdk-api.md).

`@divebell/modern-plugin` is the planned official page-side integration for Modern.js. It turns lifecycle information that Modern.js already owns into stable Divebell facts, so a coding agent can inspect framework state instead of inferring it from DOM text, Console messages, or Network timing.

This package is a Modern.js runtime plugin, not a CLI Extension. The instructions below describe the intended integration for contributors testing against a Modern.js source checkout that contains the required hooks. They are not current installation guidance for application teams.

## What the plugin provides

The plugin registers and updates:

- `modern:app`: the overall Modern.js render state;
- `modern:route`: the current route, known route manifest, navigation state, and current route matches;
- loader, redirect, route-component, and route errors inside the current route matches;
- `modern:ssr`: server-rendering state when SSR information exists;
- `modern:hydration`: browser hydration state when Modern.js emits hydration events; and
- optional route-list and route-navigation actions.

The plugin reports framework lifecycle. A ready framework route does not prove that the page's business data or user journey is ready. Keep business-owned success conditions in a business target or verify them with matching page and request evidence.

## Planned integration

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

No published Modern.js version is currently declared compatible. Do not infer compatibility from a version number or a `preview` label. Once Modern.js publishes the required hooks and the integration is verified against that release, this guide will replace the WIP notice with an explicit supported version range.

Route actions are opt-in because navigation changes page state:

```ts
divebellModernPlugin({
  injectRouteListAction: true,
  injectRouteNavigateAction: true,
});
```

## Contributor verification

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

The same package also provides `@divebell/modern-plugin/chunk-map` for build-time Chunk Map generation. That entry does not use the unreleased Modern.js runtime lifecycle hooks and is not blocked by the runtime integration's WIP status. Use it only when a task needs to map browser execution back to source files and dependencies; see [Code-Usage Analysis](code-usage-analysis.md).

For complete target fields, route actions, Garfish helpers, and business-ready helpers, see the [`@divebell/modern-plugin` package guide](../packages/modern-plugin/README.md).
