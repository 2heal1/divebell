# @openruntime/modern-plugin

`@openruntime/modern-plugin` lets a Modern.js app expose framework runtime
state to OpenRuntime. It records information that Modern.js already knows:
application render state, current route state, SSR state, hydration state, and
optional business ready state.

The plugin does not decide whether a business page is usable. Framework targets
only describe framework lifecycle. Business readiness should use the business
ready helpers described below.

## Usage

Add the plugin in `src/modern.runtime.ts`:

```ts
import { openRuntimeModernPlugin } from "@openruntime/modern-plugin";

export default openRuntimeModernPlugin({
  bridge: {
    port: 17321,
  },
});
```

Then use the OpenRuntime CLI against the page:

```sh
pnpm exec openruntime targets --url http://localhost:19081/
pnpm exec openruntime snapshot --url http://localhost:19081/
pnpm exec openruntime wait-for modern:route ready --url http://localhost:19081/ --where pathname=/orders
```

## Targets

### `modern:app`

Type: `modern.app`

This is the top-level Modern.js runtime signal for the current page. Use it as
the quick "is the framework page currently healthy" check.

Statuses:

- `initializing`: the plugin has been installed, but rendering has not started.
- `rendering`: Modern.js is rendering or route work is still in progress.
- `ready`: the current framework route is ready and no hydration error is
  active.
- `error`: a framework-level failure was observed. The snapshot data points to
  the failed target, usually `modern:route` or `modern:hydration`.

Common snapshot data:

- `routeCount`: number of known Modern.js routes.
- `basename`: router basename when Modern.js provides it.
- `failedTargetId`: failed target id when the app is in `error`.
- `failedStatus`: failed target status, usually `error`.
- `reason`: short reason such as `route-loader-error`,
  `route-component-error`, `route-error`, or hydration fallback reason.
- `pathname`: current pathname when the failure is route-related.
- `errorRouteIds`: route ids that currently carry route errors.
- `hydrationEventType`: hydration event type when hydration failed.

### `modern:route`

Type: `modern.route`

This is the single route target. It represents the current route state and keeps
the route manifest on the target definition.

Statuses:

- `idle`: no current route match has been observed yet.
- `loading`: navigation, loader, or redirect work is still in progress.
- `ready`: the current route match is stable and has no known route error.
- `error`: a route loader, route module, or router error was observed.

Target data from `targets`:

- `routes`: route manifest for known routes.
- `routes[].routeId`: stable OpenRuntime route id. When a pathname is known,
  this is the pathname, such as `/orders`.
- `routes[].path`: Modern.js route path segment.
- `routes[].pathname`: resolved pathname when available.
- `routes[].modernRouteId`: original Modern.js route id.
- `routes[].parentRouteId`: parent route id for nested routes.
- `routes[].index`: whether this is an index route.
- `routes[].hasLoader`: whether the route has a real data loader.
- `routes[].hasRouteComponent`: whether the route declares a route component or
  lazy module.
- `routes[].hasLazyModule`: whether the route uses a lazy module.

Snapshot data from `snapshot`:

- `pathname`: current browser pathname.
- `navigation`: current router navigation state.
- `matches`: current matched route chain only. Old route matches are not kept
  after navigation.
- `matches[].loader`: real data loader state when known:
  `loading`, `success`, `redirect`, or `error`.
- `matches[].routeComponent`: shown only when the route component module failed;
  the value is `error`.
- `matches[].error`: route-specific error details.
- `errorRouteIds`: route ids that currently have errors.

`modern:route` does not create separate loader or route component targets.
Loader and route component details stay inside the current `matches` array so a
snapshot describes the current route instead of a history of every visited
route.

Common waits:

```sh
pnpm exec openruntime wait-for modern:route ready --where pathname=/orders
pnpm exec openruntime wait-for modern:route error --where pathname=/broken
```

### `modern:ssr`

Type: `modern.ssr`

This target is registered only when SSR data exists or SSR work is observed. A
CSR-only page normally does not have `modern:ssr`.

Statuses:

- `unknown`: SSR target was registered before detailed state was available.
- `rendering`: the server render has started and has not finished yet.
- `server-rendered`: server render completed and produced SSR payload.
- `fallback`: Modern.js fell back to client render.
- `invalidated`: browser hydration showed the SSR result could not be reused.
- `error`: SSR output is not usable because the server-rendered route failed.

Common snapshot data:

- `environment`: `server` or `browser`.
- `runtimeId`: OpenRuntime runtime id injected during SSR.
- `renderId`: render id injected during SSR.
- `requestPathname`: pathname for the SSR request when available.
- `requestUrl`: full SSR request URL when available.
- `renderMode`: Modern.js render mode, such as `string` or `stream`.
- `renderLevel`: Modern.js hydration/render level when available.
- `reason`: fallback or invalidation reason when available.
- `failedTargetId`: failed target id when SSR becomes `error`.
- `failedStatus`: failed target status.

Common wait:

```sh
pnpm exec openruntime wait-for modern:ssr server-rendered --where environment=server
```

### `modern:hydration`

Type: `modern.hydration`

This target is registered only when Modern.js emits hydration events. A CSR-only
page normally does not have `modern:hydration`. If SSR failed before hydration,
the plugin suppresses this target so a failed SSR page is not shown as
hydration success.

Statuses:

- `running`: client hydration has started.
- `success`: client hydration completed successfully.
- `fallback`: Modern.js downgraded to client render.
- `error`: hydration failed or emitted a recoverable hydration error.

Common snapshot data:

- `type`: Modern.js hydration event type.
- `renderLevel`: Modern.js render level when available.
- `renderMode`: Modern.js render mode when available.
- `reason`: hydration fallback or recoverable-error reason.

When hydration enters `error`, `modern:ssr` becomes `invalidated` and
`modern:app` becomes `error`. Later hydration success events do not overwrite
the earlier hydration failure.

## Business Ready Target

The package also exports helpers for business-owned readiness:

- `registerOpenRuntimeReady`
- `markOpenRuntimeReady`
- `markOpenRuntimeReadyError`
- `unregisterOpenRuntimeReady`

These helpers use target ids shaped as `business:ready:<id>` and type
`business.ready`.

Statuses:

- `pending`: business target is registered but not ready yet.
- `ready`: business code marked the target as ready.
- `error`: business code marked the target as failed.

Business targets are owned by business code. If a route unmounts the business
component, the component should call `unregisterOpenRuntimeReady` so stale
business targets do not stay in later route snapshots.

Example:

```ts
import {
  markOpenRuntimeReady,
  registerOpenRuntimeReady,
  unregisterOpenRuntimeReady,
} from "@openruntime/modern-plugin";
import { getOpenRuntimeFromWindow } from "@openruntime/core";

const runtime = getOpenRuntimeFromWindow();

if (runtime) {
  registerOpenRuntimeReady({
    runtime,
    id: "checkout",
  });
  markOpenRuntimeReady(runtime, "checkout", {
    screen: "checkout",
  });
}

// When the owning page or component unmounts:
if (runtime) {
  unregisterOpenRuntimeReady(runtime, "checkout");
}
```
