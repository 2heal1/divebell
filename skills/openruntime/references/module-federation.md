# Module Federation

Use this reference when diagnosing Module Federation remote, expose, shared, preload, or observability report state through OpenRuntime.

MF consumers should use `@module-federation/observability-plugin`. The plugin records remote, expose, shared, preload, and report data that OpenRuntime can expose as targets and actions.

If a project uses Module Federation, Vmok, or a remote/shared/expose based micro-frontend setup, and the task is to diagnose remote, expose, shared, or loading-chain behavior, first check whether the consumer already has the observability plugin wired. Look for `@module-federation/observability-plugin` in package files and for runtime plugin wiring in the MF consumer config.

If `targets` or `snapshot` has no `mf:*` targets and source edits are allowed, add and wire the observability plugin before relying on OpenRuntime for MF state. If source edits are not allowed, state that MF observability is missing and fall back to console, network, runtime error codes, and MF config evidence.

## Browser Runtime Setup

```bash
pnpm add @module-federation/observability-plugin
```

```ts
import { createInstance } from "@module-federation/runtime";
import { ObservabilityPlugin } from "@module-federation/observability-plugin";

createInstance({
  name: "runtime_host",
  remotes: [
    {
      name: "remote1",
      entry: "https://example.com/mf-manifest.json",
    },
  ],
  plugins: [
    ObservabilityPlugin({
      level: "verbose",
      browser: {
        enabled: true,
        scope: "runtime_host",
      },
    }),
  ],
});
```

## Targets

Start from MF targets:

```bash
pnpm exec openruntime targets --url <url> --type mf.remote
pnpm exec openruntime targets --url <url> --type mf.remote.expose
pnpm exec openruntime targets --url <url> --type mf.shared
```

Wait for a concrete expose rather than only the remote summary:

```bash
pnpm exec openruntime wait-for mf:remote:<remoteName>:expose:<exposeName> ready --url <url> --timeout 10000
```

Diagnose shared dependencies:

```bash
pnpm exec openruntime snapshot --url <url> --query <sharedName>
pnpm exec openruntime wait-for mf:shared:<sharedName>:<version>:<shareScope> loaded --url <url> --timeout 10000
pnpm exec openruntime wait-for mf:shared:<sharedName>:<version>:<shareScope> error --url <url> --timeout 10000
```

## Report Actions

If MF observability registered report actions, read detailed reports through OpenRuntime:

```bash
pnpm exec openruntime run-action --url <url> mf:list-reports --payload '{"remote":"<remoteName>"}'
pnpm exec openruntime run-action --url <url> mf:get-report --payload '{"traceId":"<trace-id>"}'
```
