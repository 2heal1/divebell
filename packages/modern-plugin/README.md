# @divebell/modern-plugin (WIP)

> **WIP:** Do not adopt the runtime integration in a regular project yet. It
> depends on Modern.js lifecycle hooks that have not been included in a
> published Modern.js version. Use `@divebell/core` for stable application
> signals until a compatible Modern.js release is available and verified.
> The build-time `@divebell/modern-plugin/chunk-map` entry does not use those
> runtime hooks and remains available.

`@divebell/modern-plugin` is intended to let a Modern.js app expose framework runtime
state to Divebell. It records information that Modern.js already knows:
application render state, current route state, SSR state, hydration state, and
optional business ready state.

The plugin does not decide whether a business page is usable. Framework targets
only describe framework lifecycle. Business readiness should use the business
ready helpers described below.

## Planned Usage

The following setup is only for contributors testing against a Modern.js source
checkout that contains the required hooks. Add the plugin in
`src/modern.runtime.ts`:

```ts
import { divebellModernPlugin } from "@divebell/modern-plugin";

export default divebellModernPlugin();
```

### Reuse the implementation under another distribution

Use the supported factory when another Modern.js distribution needs the same
runtime integration under its own plugin identity and Runtime source:

```ts
import { createModernPlugin } from "@divebell/modern-plugin";

export const edenxModernPlugin = createModernPlugin({
  name: "@edenx/divebell-plugin",
  source: "edenx"
});
```

The returned `edenxModernPlugin` accepts the same per-app options as
`divebellModernPlugin`. Its configured source is used by targets, snapshots,
events, actions, and SSR context. The target ids and types remain `modern:*`
because they describe the same Modern.js framework facts. The package root
continues to expose `divebellModernPlugin` with the
`@divebell/modern-plugin` name and `modern.js` source.

Open the page with the CLI so it can connect every registered runtime, then query it:

```sh
divebell open http://localhost:19081/
divebell targets --url http://localhost:19081/
divebell snapshot --url http://localhost:19081/
divebell wait-for modern:route ready --url http://localhost:19081/ --where pathname=/orders
```

For pages that expose multiple Runtime instances, including micro-frontend
children, see [Browser Connections and Multiple Runtimes](../../docs/runtime-connections.md).

For SSR state that must be sent before hydration, the plugin still accepts
`bridge: { port: 17321 }` as an optional server-side setting.

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
- `routes[].routeId`: stable Divebell route id. When a pathname is known,
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
divebell wait-for modern:route ready --where pathname=/orders
divebell wait-for modern:route error --where pathname=/broken
```

## Optional Route Actions

The Modern.js plugin does not register route actions by default. Enable them
explicitly when the page should expose route list and route navigation actions
to Agents:

```ts
divebellModernPlugin({
  injectRouteListAction: true,
  injectRouteNavigateAction: true,
});
```

### `modern.route.list`

Enabled by `injectRouteListAction`.

This safe action returns the same known route manifest stored on the
`modern:route` target.

```sh
divebell run-action modern.route.list
```

### `modern.route.navigate`

Enabled by `injectRouteNavigateAction`.

This state-changing action navigates through the Modern.js router. The `to`
input only accepts routes known by the current `modern:route` route manifest:

```sh
divebell run-action modern.route.navigate --payload '{"to":"/orders"}'
divebell wait-for modern:route ready --where pathname=/orders
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
- `runtimeId`: Divebell runtime id injected during SSR.
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
divebell wait-for modern:ssr server-rendered --where environment=server
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

## Garfish Targets

The package also exports Garfish helpers for Modern.js host
applications that use Garfish:

- `createDivebellGarfishReporter`
- `createDivebellGarfishPlugin`
- `createDivebellGarfishCustomLoader`

Garfish is a singleton in the host page. Register the Divebell Garfish
plugin in the host application before `Garfish.run()` or before the first
`Garfish.loadApp()`:

```ts
import {
  createDivebellGarfishCustomLoader,
  createDivebellGarfishPlugin,
  createDivebellGarfishReporter,
} from "@divebell/modern-plugin";

const reporter = createDivebellGarfishReporter();

export const garfishOptions = {
  plugins: [createDivebellGarfishPlugin({ reporter })],
  customLoader: createDivebellGarfishCustomLoader({ reporter }),
};
```

If the host already has a `customLoader`, pass it through `loader` so
Divebell can wrap it instead of replacing it.

### `modern:garfish`

Type: `modern.garfish`

Aggregate Garfish sub-application state for the current page.

### `modern:garfish:app:<name>`

Type: `modern.garfish.app`

Per-sub-application state. The target records Garfish lifecycle state and
whether `provider.render` / `provider.destroy` was called through the
Divebell custom loader.

Statuses:

- `idle`: no Garfish app has been observed yet.
- `registered`: the app was registered.
- `loading`: Garfish started loading the app.
- `loaded`: Garfish loaded the app instance.
- `evaluating`: a sub-application script started executing.
- `evaluated`: a sub-application script executed.
- `mounting`: Garfish started mounting the app.
- `rendering`: `provider.render` was called through the Divebell custom
  loader.
- `mounted`: Garfish mount completed.
- `unmounting`: Garfish started unmounting or `provider.destroy` was called.
- `unmounted`: Garfish unmount completed.
- `error`: load, script execution, mount, or unmount failed.

Common waits:

```sh
divebell wait-for modern:garfish:app:orders mounted
divebell events --target-id modern:garfish:app:orders --limit 50
```

## Business Ready Target

The package also exports helpers for business-owned readiness:

- `registerDivebellReady`
- `markDivebellReady`
- `markDivebellReadyError`
- `unregisterDivebellReady`

These helpers use target ids shaped as `business:ready:<id>` and type
`business.ready`.

Statuses:

- `pending`: business target is registered but not ready yet.
- `ready`: business code marked the target as ready.
- `error`: business code marked the target as failed.

Business targets are owned by business code. If a route unmounts the business
component, the component should call `unregisterDivebellReady` so stale
business targets do not stay in later route snapshots.

Example:

```ts
import {
  markDivebellReady,
  registerDivebellReady,
  unregisterDivebellReady,
} from "@divebell/modern-plugin";
import { getDivebellFromWindow } from "@divebell/core";

const runtime = getDivebellFromWindow();

if (runtime) {
  registerDivebellReady({
    runtime,
    id: "checkout",
  });
  markDivebellReady(runtime, "checkout", {
    screen: "checkout",
  });
}

// When the owning page or component unmounts:
if (runtime) {
  unregisterDivebellReady(runtime, "checkout");
}
```
