# Modern.js

Use this reference when diagnosing Modern.js route, loader, route component, SSR, hydration, or navigation state through OpenRuntime.

## Version Gate

Before recommending `@openruntime/modern-plugin`, run the resolver against the
project package file:

```bash
node skills/openruntime/scripts/resolve-integration.mjs <path-to-package.json>
```

Use the resolver output as the default decision. If the script cannot run,
read the project dependency version for `@modern-js/runtime`,
`@modern-js/plugin`, or `@modern-js/app-tools`.

Use `@openruntime/modern-plugin` only when at least one of these Modern
packages is `>=3.4.0`, or when the version string contains `preview`.

For supported versions, install the plugin and wire it in `src/modern.runtime.ts`
with a `bridge` option. This is the default Modern path:

```ts
import { defineRuntimeConfig } from "@modern-js/runtime";
import { openRuntimeModernPlugin } from "@openruntime/modern-plugin";

export default defineRuntimeConfig({
  plugins: [
    openRuntimeModernPlugin({
      bridge: {
        port: 17321,
      },
    }),
  ],
});
```

`@openruntime/modern-plugin` does not re-export `@openruntime/core` API. When
business code needs `getOpenRuntimeFromWindow`, `registerTarget`,
`updateSnapshot`, actions, or other Core APIs, install `@openruntime/core` as a
direct dependency too. Do not rely on the Modern plugin's transitive dependency.

Do not recommend `@openruntime/modern-plugin` by default for older non-preview
Modern/EdenX versions. Those versions can miss the hooks needed for current
route, loader, route component, SSR, and hydration state. A partial result such
as base targets or `modern:app` stuck at `rendering` is not enough to decide
route readiness or failure.

For older non-preview Modern/EdenX versions, use `@openruntime/core` directly
at a stable business point instead: register the smallest target that proves
the task, update it to `pending`, `ready`, or `error`, connect the Bridge, then
verify through `runtimes`, `targets`, `snapshot`, and `wait-for`.

Installing `@openruntime/core` is not enough by itself. The page must install a
runtime on `window` and call `connectBridge`, otherwise the CLI will not see a
connected runtime:

When `@openruntime/modern-plugin` is already wired but the `bridge` option is
missing, a browser-side connection can be used as a temporary fallback before
editing source code:

```bash
pnpm exec openruntime eval '(() => { const runtime = window.__OPEN_RUNTIME__; if (!runtime || typeof runtime.connectBridge !== "function") return { connected: false, reason: "missing window.__OPEN_RUNTIME__" }; runtime.connectBridge({ port: 17321 }); return { connected: true }; })()'
pnpm exec openruntime runtimes
```

Do not create an empty runtime from this eval path. If `window.__OPEN_RUNTIME__`
is missing or has no `connectBridge`, the page does not have a usable
OpenRuntime Core runtime; wire the Modern plugin with `bridge` for supported
versions, or wire the Core entrypoint for older versions. If the eval returns
`{ connected: true }` but `runtimes` stays empty, retry with the actual Bridge
port from `open` / `start` before editing source. If a runtime connects but
Modern targets are missing, check the Modern plugin wiring instead of adding an
empty Core runtime:

```ts
import { createOpenRuntime, installOpenRuntimeOnWindow } from "@openruntime/core";

const runtime = installOpenRuntimeOnWindow(createOpenRuntime());

runtime.connectBridge({
  port: 17321,
});
```

After installing `@openruntime/modern-plugin`, always verify that runtime state
is actually connected. Opening a page through the Bridge is not enough.

```bash
pnpm exec openruntime runtimes --bridge <bridge-url>
pnpm exec openruntime targets --bridge <bridge-url>
pnpm exec openruntime snapshot --bridge <bridge-url>
```

## Route / Loader / SSR / Hydration

Wait for a route:

```bash
pnpm exec openruntime wait-for modern:route ready --url <url> --where pathname=/orders --timeout 30000
```

Read the current route state:

```bash
pnpm exec openruntime snapshot --url <url> --id modern:route
```

`modern:route.data.matches` contains the current route chain, loader state, route component state, and route errors.

If the page exposes SSR or hydration state, read Modern.js targets together:

```bash
pnpm exec openruntime snapshot --url <url> --query modern
```

## Business Ready Helper

Modern.js projects can use the business ready helper from `@openruntime/modern-plugin` when a ready/error signal should be kept after debugging:

```ts
import {
  markOpenRuntimeReady,
  markOpenRuntimeReadyError,
  registerOpenRuntimeReady,
  unregisterOpenRuntimeReady,
} from "@openruntime/modern-plugin";
import { getOpenRuntimeFromWindow } from "@openruntime/core";
```
