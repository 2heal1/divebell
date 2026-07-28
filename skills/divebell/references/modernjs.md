# Modern.js

Use this reference when diagnosing Modern.js route, loader, route component, SSR, hydration, or navigation state through Divebell.

## Contents

- [WIP Gate](#wip-gate)
- [Contributor-Only Plugin Setup](#contributor-only-plugin-setup)
- [Route, Loader, SSR, and Hydration](#route--loader--ssr--hydration)
- [Business Ready Helper](#business-ready-helper)

## WIP Gate

`@divebell/modern-plugin` runtime integration is WIP. It depends on Modern.js
lifecycle hooks that have not been included in a published Modern.js version.
Do not recommend, install, or wire the runtime plugin in a regular project yet.
Do not infer compatibility from a version number or a `preview` label.

Run the resolver against the project package file:

```bash
node skills/divebell/scripts/resolve-integration.mjs <path-to-package.json>
```

The resolver intentionally selects `@divebell/core` for every detected
Modern.js version while the plugin is WIP. Use browser evidence when it is
enough. When stable page-side state is required, install `@divebell/core`,
register the smallest target that proves the task, update it to `pending`,
`ready`, or `error`, install the runtime on `window`, then verify through
`runtimes`, `targets`, `snapshot`, and `verify`. Use `wait-for` only when a
concrete target state must be awaited before final business verification.

Installing `@divebell/core` is not enough by itself. The page must install a
runtime on `window`. `divebell open` connects every registered runtime and
reconnects them after reloads.

If `workflow.mjs connected` reports no connected runtime, use its `nextAction`
snippet. During the WIP period it must select the Runtime SDK entrypoint, not
the Modern plugin. If source edits are not allowed, mark runtime evidence
unavailable and use browser fallback evidence explicitly.

Do not treat partial Modern targets or `modern:app` stuck at `rendering` as
proof of route readiness or failure. Projects that already wired the plugin
deliberately for contributor testing must use a Modern.js source checkout that
contains the required hooks.

## Contributor-Only Plugin Setup

Use this setup only when the task explicitly develops or validates the WIP
plugin against such a Modern.js source checkout:

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
`updateSnapshot`, actions, or other Runtime SDK APIs, install `@divebell/core`
as a direct dependency too. Do not rely on the Modern plugin's transitive
dependency.

When `@divebell/modern-plugin` is already wired, reopen the page with
`divebell open <url>` before diagnosing a missing connection. Do not add
page-side Bridge connection code.

If a runtime connects but Modern targets are missing, check the Modern plugin
wiring and confirm that the source checkout contains all required hooks. Do not
add an empty Runtime SDK instance and claim that the Modern integration works.

After wiring `@divebell/modern-plugin` for contributor testing, always verify
that runtime state is actually connected by opening the page through the CLI
first.

```bash
divebell open <app-url> --bridge <bridge-url>
divebell runtimes --bridge <bridge-url>
divebell targets --bridge <bridge-url>
divebell snapshot --bridge <bridge-url>
```

## Route / Loader / SSR / Hydration

The commands in this section apply only to the contributor setup above or to a
project where the WIP plugin is already deliberately wired. For normal
projects, these Modern targets are not currently available.

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

Contributor projects testing the WIP plugin can use its business ready helper
when a ready/error signal should be kept after debugging. Normal projects
should declare the same stable signal directly through `@divebell/core` until
the Modern plugin is released as supported:

```ts
import {
  markDivebellReady,
  markDivebellReadyError,
  registerDivebellReady,
  unregisterDivebellReady,
} from "@divebell/modern-plugin";
import { getDivebellFromWindow } from "@divebell/core";
```
