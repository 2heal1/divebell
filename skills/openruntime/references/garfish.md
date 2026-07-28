# Garfish

Use this reference when diagnosing Garfish sub-application loading, script execution, provider render calls, mount/unmount state, or runtime errors through OpenRuntime.

Garfish is a singleton in the host page. The host application should register the OpenRuntime Garfish plugin before `Garfish.run()` or before the first `Garfish.loadApp()`. A sub-application cannot reliably register the host page's global Garfish plugin.

When the app also uses Module Federation, run `resolve-integration` and wire
`@module-federation/observability-plugin` when source edits are allowed. The
Garfish plugin explains host/sub-application lifecycle; MF observability is
still needed for remote, expose, shared, and report evidence.

## Setup

Use the Garfish helpers from `@openruntime/modern-plugin`.

```ts
import {
  createOpenRuntimeGarfishCustomLoader,
  createOpenRuntimeGarfishPlugin,
  createOpenRuntimeGarfishReporter,
} from "@openruntime/modern-plugin";

const reporter = createOpenRuntimeGarfishReporter();

export const garfishOptions = {
  plugins: [createOpenRuntimeGarfishPlugin({ reporter })],
  customLoader: createOpenRuntimeGarfishCustomLoader({ reporter }),
};
```

If the project already has a `customLoader`, keep it and wrap it:

```ts
const reporter = createOpenRuntimeGarfishReporter();

export const garfishOptions = {
  plugins: [createOpenRuntimeGarfishPlugin({ reporter })],
  customLoader: createOpenRuntimeGarfishCustomLoader({
    reporter,
    loader: existingCustomLoader,
  }),
};
```

The lifecycle plugin records Garfish state. The custom loader only records that `provider.render` or `provider.destroy` was called. It does not prove business UI is ready. Business readiness should still be exposed by the sub-application or a stable parent target.

## Targets

Aggregate target:

```bash
openruntime snapshot --id modern:garfish
openruntime snapshot --query garfish
```

Per-app target:

```bash
openruntime snapshot --id modern:garfish:app:<appName>
openruntime wait-for modern:garfish:app:<appName> mounted --timeout 30000
openruntime wait-for modern:garfish:app:<appName> error --timeout 30000
```

Statuses:

- `idle`: no Garfish app has been observed yet.
- `registered`: the app was registered.
- `loading`: Garfish started loading the app.
- `loaded`: Garfish loaded the app instance.
- `evaluating`: a sub-application script started executing.
- `evaluated`: a sub-application script executed.
- `mounting`: Garfish started mounting the app.
- `rendering`: `provider.render` was called through the OpenRuntime custom loader.
- `mounted`: Garfish mount completed.
- `unmounting`: Garfish started unmounting or `provider.destroy` was called.
- `unmounted`: Garfish unmount completed.
- `error`: load, script execution, mount, or unmount failed.

## Diagnosis

Start from the app target:

```bash
openruntime snapshot --query <appName>
openruntime events --target-id modern:garfish:app:<appName> --limit 50
```

If `modern:garfish:app:<appName>` is `error`, use the target error and recent events as the primary evidence. Do not keep clicking or waiting for UI elements that depend on the failed sub-application.

If the app target is `mounted` but the business component is still missing, Garfish has done its part. Add or inspect a business target inside the sub-application or a stable parent component to prove the business-ready state.
