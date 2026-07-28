# Module Federation

Use this reference when diagnosing Module Federation remote, expose, shared, preload, or observability report state through OpenRuntime.

## Contents

- [Browser Runtime Setup](#browser-runtime-setup)
- [Targets](#targets)
- [Report Actions](#report-actions)

MF consumers should use `@module-federation/observability-plugin`. The plugin records remote, expose, shared, preload, and report data that OpenRuntime can expose as targets and actions.

Prefer the resolver when a project package file is available:

```bash
node skills/openruntime/scripts/resolve-integration.mjs <path-to-package.json>
```

When the task depends on MF remote, expose, shared, preload, or loading-chain
evidence, this resolver is a required first check whenever the
consumer package file is available. State whether it was executed, which
package file it read, and whether its `@module-federation/observability-plugin`
recommendation was installed and wired. If it cannot be executed or the
recommendation cannot be applied, state that as the reason MF observability is
unavailable before using fallback browser evidence.

Do not apply a Module Federation version gate for this recommendation. The
resolver should return `@module-federation/observability-plugin` for MF
without adding `@openruntime/core`. If the project uses Module Federation or
remote/shared/expose based loading, treat missing `mf:*` OpenRuntime state as a
signal to wire observability when source edits are allowed.

After the observability plugin is installed or already wired, use
`workflow.mjs connected` to check whether the page runtime is connected. Do not
use browser `eval` for a temporary Bridge connection; edit the page runtime source or
Modern runtime configuration instead, then rerun the connected check. If source
edits are not allowed, mark runtime evidence unavailable and use browser
fallback evidence explicitly. If a runtime connects but no `mf:*` target
appears, wire the observability plugin in the MF consumer source instead of
relying on DOM evidence.

If a project uses Module Federation or a remote/shared/expose based
micro-frontend setup, first check whether the consumer already has the
observability plugin wired. Look for `@module-federation/observability-plugin`
in package files and for runtime plugin wiring in the MF consumer config.

If `targets` or `snapshot` has no `mf:*` targets and source edits are allowed,
add and wire the observability plugin before relying on OpenRuntime for MF
state. If source edits are not allowed, state that MF observability is missing
and only then use console, network, runtime error codes, and MF config evidence
as ordinary browser fallback evidence.

When using `openruntime verify` on `mf:*` targets, treat a ready result as
runtime-layer evidence only. It proves the remote, expose, shared dependency,
or report target state; it does not prove the consuming business UI rendered.
If no business target exists, `verify` may run one lightweight visibility
check, but that check is browser evidence and should not be labeled as MF
structured evidence.

Do not infer shared `pending`, `loaded`, `error`, or provider selection from
`window.__FEDERATION__` alone. That global proves the MF runtime exists, but it
is not the observability report. For shared dependency conclusions, use one of:

- an OpenRuntime `mf.shared` / `mf.shared.conflict` target
- an MF observability report read through OpenRuntime actions or the MF
  observability reader
- a clearly labeled ordinary-browser fallback based on console, network,
  runtime error codes, and source/config evidence, with the missing
  observability reason stated

If none of these are available, stop short of a root-cause claim about shared
state and treat the missing evidence as the blocker.

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
openruntime targets --url <url> --type mf.remote
openruntime targets --url <url> --type mf.remote.expose
openruntime targets --url <url> --type mf.shared
```

Wait for a concrete expose rather than only the remote summary:

```bash
openruntime wait-for mf:remote:<remoteName>:expose:<exposeName> ready --url <url> --timeout 10000
```

Diagnose shared dependencies:

```bash
openruntime snapshot --url <url> --query <sharedName>
openruntime wait-for mf:shared:<sharedName>:<version>:<shareScope> loaded --url <url> --timeout 10000
openruntime wait-for mf:shared:<sharedName>:<version>:<shareScope> error --url <url> --timeout 10000
```

## Report Actions

If MF observability registered report actions, read detailed reports through OpenRuntime:

```bash
openruntime run-action --url <url> mf:list-reports --payload '{"remote":"<remoteName>"}'
openruntime run-action --url <url> mf:get-report --payload '{"traceId":"<trace-id>"}'
```
