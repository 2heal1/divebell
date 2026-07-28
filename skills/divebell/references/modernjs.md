# Modern.js

Use this reference when diagnosing Modern.js route, loader, route component, SSR, hydration, or navigation state through Divebell.

## Contents

- [Version Gate](#version-gate)
- [Route, Loader, SSR, and Hydration](#route--loader--ssr--hydration)
- [Business Ready Helper](#business-ready-helper)

## Version Gate

Before recommending `@divebell/modern-plugin`, run the resolver against the
project package file:

```bash
node skills/divebell/scripts/resolve-integration.mjs <path-to-package.json>
```

Use the resolver output as the default decision. If the script cannot run,
read the project dependency version for `@modern-js/runtime`,
`@modern-js/plugin`, or `@modern-js/app-tools`.

Use `@divebell/modern-plugin` only when at least one of these Modern
packages is `>=3.4.0`, or when the version string contains `preview`.

For supported versions, install the plugin and wire it in `src/modern.runtime.ts`
with a `bridge` option. This is the default Modern path:

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

`@divebell/modern-plugin` does not re-export `@divebell/core` API. When
business code needs `getDivebellFromWindow`, `registerTarget`,
`updateSnapshot`, actions, or other Core APIs, install `@divebell/core` as a
direct dependency too. Do not rely on the Modern plugin's transitive dependency.

Do not recommend `@divebell/modern-plugin` by default for older non-preview
Modern.js versions. Those versions can miss the hooks needed for current
route, loader, route component, SSR, and hydration state. A partial result such
as base targets or `modern:app` stuck at `rendering` is not enough to decide
route readiness or failure.

For older non-preview Modern.js versions, use `@divebell/core` directly
at a stable business point instead: register the smallest target that proves
the task, update it to `pending`, `ready`, or `error`, install it on `window`, then
open the page with the CLI and verify through `runtimes`, `targets`, `snapshot`, and `verify`. Use `wait-for`
only when you need to wait for a concrete target state before the final
business verification.

Installing `@divebell/core` is not enough by itself. The page must install a
runtime on `window`. `divebell open` connects every registered runtime and
reconnects them after reloads.

When `@divebell/modern-plugin` is already wired, reopen the page with
`divebell open <url>` before diagnosing a missing connection. Do not add
page-side Bridge connection code.

If `workflow.mjs connected` reports no connected runtime, use its `nextAction`
snippet. For supported Modern versions, wire the Modern plugin.
For older versions, wire the Core entrypoint. If source edits are not allowed,
mark runtime evidence unavailable and use browser fallback evidence explicitly.
If a runtime connects but Modern targets are missing, check the Modern plugin
wiring instead of adding an empty Core runtime:

```ts
import { createDivebell, installDivebellOnWindow } from "@divebell/core";

const runtime = installDivebellOnWindow(createDivebell());
```

After installing `@divebell/modern-plugin`, always verify that runtime state
is actually connected by opening the page through the CLI first.

```bash
divebell open <app-url> --bridge <bridge-url>
divebell runtimes --bridge <bridge-url>
divebell targets --bridge <bridge-url>
divebell snapshot --bridge <bridge-url>
```

## Route / Loader / SSR / Hydration

Wait for a route:

```bash
divebell wait-for modern:route ready --url <url> --where pathname=/orders --timeout 30000
```

Read the current route state:

```bash
divebell snapshot --url <url> --id modern:route
```

`modern:route.data.matches` contains the current route chain, loader state, route component state, and route errors.

If the page exposes SSR or hydration state, read Modern.js targets together:

```bash
divebell snapshot --url <url> --query modern
```

## Business Ready Helper

Modern.js projects can use the business ready helper from `@divebell/modern-plugin` when a ready/error signal should be kept after debugging:

```ts
import {
  markDivebellReady,
  markDivebellReadyError,
  registerDivebellReady,
  unregisterDivebellReady,
} from "@divebell/modern-plugin";
import { getDivebellFromWindow } from "@divebell/core";
```
