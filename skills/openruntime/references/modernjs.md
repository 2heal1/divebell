# Modern.js

Use this reference when diagnosing Modern.js route, loader, route component, SSR, hydration, or navigation state through OpenRuntime.

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
```
