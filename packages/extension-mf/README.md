# @openruntime/extension-mf

Read safe Module Federation multi-instance state and captured loading evidence from the MF Observability Plugin in the page. The extension provides eight external commands; it does not read Module Federation private globals or add built-in CLI commands.

## Commands

```text
openruntime mf status [name] [--role <consumer|producer>] [--instance <ref>] [--json]
openruntime mf module-info [remote] [--mf <name>] [--instance <ref>] [--json]
openruntime mf trace [remote/expose] [--mf <name>] [--instance <ref>] [--trace-id <id>] [--json]
openruntime mf remote check <remote> [--mf <name>] [--instance <ref>] [--json]
openruntime mf preload trace [remote] [--mf <name>] [--instance <ref>] [--trace-id <id>] [--json]
openruntime mf shared status [package] [--mf <name>] [--instance <ref>] [--scope <scope>] [--json]
openruntime mf shared trace [package] [--mf <name>] [--instance <ref>] [--scope <scope>] [--operation <id>] [--trace-id <id>] [--json]
openruntime mf bridge trace [remote] [--mf <name>] [--instance <ref>] [--bridge <id>] [--operation <id>] [--json]
```

`--mf` selects the visible Module Federation name. `--instance` selects the exact, session-scoped `instanceRef` reported by `mf status`. Several frames or runtimes can use the same visible name, so a command that needs one context returns candidates instead of silently choosing the first one. Copy the candidate command containing `--instance`; do not reuse an instanceRef after reopening the page.

All commands analyze only facts already exposed through the page's safe public Observability reader. They do not inspect private globals or infer missing activity. `complete` means the required evidence is complete. `partial` returns the evidence that exists and states that earlier history can be missing. `unavailable` means the current reader or runtime cannot provide the capability. `unknown` means the available evidence is insufficient to reach a conclusion; it does not mean success or absence.

## Install

```sh
openruntime extensions add @openruntime/extension-mf
```

The current CLI uses the plural `extensions` command. The older singular form `openruntime extension add @openruntime/extension-mf` is not supported by this repository version.

After installing or updating the extension, reopen the page with `openruntime open`. Before navigation, the extension installs a matching MF debug Runtime constructor and global Observability Plugin. Future MF instances use that constructor, so the target project can expose the newer Remote, Shared, and Bridge diagnostics even when its installed Runtime does not contain those hooks. A page that was already open cannot have complete earlier loading history.

```sh
openruntime open https://example.com
```

This behavior is enabled by default. Disable the whole MF debug injection for one open command with:

```sh
openruntime open https://example.com --mf-debug=false
```

The published package contains both browser bundles and has no runtime npm dependencies. The target project does not need to add these preview packages to its own dependencies. If the application already exposes a compatible Observability reader, that application reader is used instead. If the same debug Runtime version or global Observability Plugin is already present, the extension keeps it instead of adding a duplicate.

## Sync the browser collector

The checked-in Runtime, Runtime Core, and Observability Plugin all use the same preview release:

```sh
0.0.0-feat-operate-openruntime-20260722064424
```

Install that exact set in a temporary tooling project, then pass all three package roots:

```sh
pnpm run sync:mf-observability -- \
  --package-root /path/to/node_modules/@module-federation/observability-plugin \
  --runtime-package-root /path/to/node_modules/@module-federation/runtime \
  --runtime-core-package-root /path/to/node_modules/@module-federation/runtime-core
```

The sync command rejects the input unless all three package versions are exactly equal to that preview release and Runtime depends on that exact Runtime Core version. It builds the injected debug class from Runtime Core's public entry and the global plugin from Observability Plugin's public Chrome entry. The preview packages were published from MF commit `54e733342953e3f384282078aa518c7f87cd1724`.

Use check mode in CI or before publishing. It regenerates everything in memory and fails when any checked-in asset is stale without modifying the repository:

```sh
pnpm run check:mf-observability -- \
  --package-root /path/to/node_modules/@module-federation/observability-plugin \
  --runtime-package-root /path/to/node_modules/@module-federation/runtime \
  --runtime-core-package-root /path/to/node_modules/@module-federation/runtime-core
```

The generated collector and build metadata are included in the published extension. The extension still has no runtime npm dependencies and the target page does not resolve packages or request a CDN at runtime.

The injected debug Runtime and Observability Plugin are one matched pair. Do not update only one bundle.

## `mf status`

```sh
openruntime mf status
openruntime mf status host
openruntime mf status --role consumer
openruntime mf status --instance mf-2
openruntime mf status --json
```

Without selectors, the command returns all observed instances and their flat relationships. It includes each session-scoped `instanceRef`, realm/frame scope, name, versions, roles and evidence, remotes, loaded producers, shared and Bridge summaries, capabilities, completeness, warnings, and recovery actions.

When a name matches more than one instance, the command returns candidates such as:

```text
openruntime mf status --instance "mf-2"
```

It never selects the first same-name instance.

## `mf module-info`

```sh
openruntime mf module-info
openruntime mf module-info catalog
openruntime mf module-info catalog --mf host
openruntime mf module-info catalog --instance mf-1
openruntime mf module-info catalog --instance mf-1 --json
```

The command first selects a confirmed consumer. It automatically selects only when exactly one consumer exists. With several consumers, duplicate names, or ambiguous remotes, it returns copyable candidate commands.

Output distinguishes `declared` from `loaded` and reports only what the public reader can confirm: the consumer and producer references, manifest and remote entry details, snapshot source, global name, type, public paths, observed exposes, shared summary, dependent remotes, cache state, first observed loading time, capabilities, completeness, and warnings. Missing historical evidence remains unknown rather than being inferred from array order.

## Remote loading commands

```sh
openruntime mf trace
openruntime mf trace shop/Button --instance mf-1 --trace-id mf-trace-1
openruntime mf remote check shop --mf host
openruntime mf preload trace shop --instance mf-1
```

`mf trace` shows the captured ordinary `loadRemote` chain from request start through remote matching, manifest or snapshot resolution, remote entry loading, container initialization, expose lookup, factory execution, and final result. With no target it lists trace summaries; each summary keeps its `instanceRef` and `traceId`.

`mf remote check` checks the remote declaration, current relationship, manifest and remote entry facts, observed resource results, HTTP/MIME/redirect evidence, container initialization, exposes, cache, recovery, and timeout state. It only analyzes existing page evidence. It does not request a manifest or remote entry, execute a remote entry, or call container code.

`mf preload trace` uses only `preloadRemote` evidence. Ordinary `loadRemote` resources are excluded even when both operations target the same remote.

Remote names and aliases are accepted. For `remote/expose`, the full remote name or alias is matched before the expose suffix is parsed, including scoped remote names that contain `/`. Same-name instances and concurrent traces are never reduced to the first result; candidate output includes copyable `--instance` or `--trace-id` commands.

See [docs/remote.md](docs/remote.md) for the result fields, evidence boundaries, and complete compatibility behavior.

## Shared state and loading chains

```sh
openruntime mf shared status
openruntime mf shared status react --mf host --scope default
openruntime mf shared status react --instance mf-1 --json

openruntime mf shared trace
openruntime mf shared trace react --instance mf-1
openruntime mf shared trace react --instance mf-1 --operation loadShare-42
openruntime mf shared trace react --trace-id mf-trace-42 --json
```

`mf shared status` reads only the current `shareScopes` state and keeps every matching instance separate, including duplicate MF names. It groups packages by instance and share scope, and reports available and loaded versions, providers, loading flags, strategy, and conflicts that current versions still confirm.

`mf shared trace` explains registration, selection, and loading history. It correlates by `operationId` first and falls back to `traceId` or `requestId`; it never combines concurrent loads merely because they use the same package name. When a package matches several operations, the result contains instance, package, scope, operation, and a copyable command for each candidate.

See [docs/shared.md](docs/shared.md) for capability, version, ambiguity, and partial-history behavior.

## `mf bridge trace`

```sh
openruntime mf bridge trace
openruntime mf bridge trace catalog
openruntime mf bridge trace shop --instance mf-1
openruntime mf bridge trace catalog --instance mf-1 --bridge bridge-1 --operation bridge-op-1
openruntime mf bridge trace catalog --instance mf-1 --operation bridge-op-1 --json
```

Without a remote or operation selector, the command returns a summary of the observed Bridge operations. A remote selector accepts the configured remote name or alias within each MF instance. When more than one operation matches, the result lists the instanceRef, bridgeId, operationId, side, operation, and a copyable command that includes `--operation`. Same-name MF instances and same-name remotes remain isolated by instanceRef.

Operations are correlated by operationId within one MF instance. Consumer and producer evidence can share one operation while retaining their side. Missing operationId values are never correlated across reports or sides; those records remain independent and are marked as incomplete associations.

The output distinguishes an operation call, render invocation, operation return, and framework commit. A successful render return does not imply that commit was observed. Even a commit does not establish that the page is rendered for the user, business data is ready, or the application is interactive. Route-sync output uses only the already-sanitized route summary and does not claim final navigation success.

`bridgeTrace` capability controls historical output. `partial` returns available operations with a missing-history warning. `unavailable` returns a structured unsupported result instead of claiming that the page does not use Bridge. If current Bridge state exists, it is still shown while historical operations remain unavailable. Reopen the page before reproducing the operation when observation was installed late.

See [docs/bridge.md](docs/bridge.md) for lifecycle correlation and evidence boundaries.

## Collection modes and compatibility

- `injected`: this extension installed its bundled collector before MF runtime startup.
- `application`: the page exposes one compatible application Observability reader; it is preferred over the injected reader.
- `unavailable`: no compatible public reader is present. Reopen the page with `openruntime open <url>` or configure the MF Observability Plugin in the application.

Every command checks the report schema and capabilities. Partial history, late collection, incompatible readers, several application readers, expired instance references, child-frame-only results, and unavailable trace data are reported explicitly with a next action. The commands do not fall back to `__FEDERATION__.__INSTANCES__`, `moduleInfo`, `moduleCache`, share scopes, `options.id`, or other private runtime objects.

## Public API for other extensions

Other extensions can reuse the safe reader, selection rules, and result builders from the package's public `core` entry. They do not need to invoke the MF command or import a file under `dist`.

```ts
import {
  MfCoreError,
  collectBridgeOperations,
  createCompatibilitySummary,
  createBridgeTraceResult,
  createModuleInfoResult,
  createRemoteCheckResult,
  createRemoteTraceResult,
  createSharedStatusResult,
  createSharedTraceResult,
  createStatusResult,
  filterRelationshipsForInstances,
  groupSharedTraceOperations,
  listBridgeCurrentStates,
  listRemoteCandidates,
  readMfObservability,
  selectConsumer,
  selectBridgeTrace,
  selectRemote,
  selectRemoteCheck,
  selectRemoteTrace,
  selectSharedInstances,
  selectStatusInstances,
  type BrowserObservabilitySnapshot,
  type BridgeTraceResult,
  type ConsumerSelectors,
  type StatusSelectors
} from "@openruntime/extension-mf/core";
```

The reusable layer accepts snapshots and plain selectors. It returns structured candidates and recommended action types, without writing output or embedding `openruntime mf` commands. A Vmok extension can therefore use the same facts and render its own `openruntime vmok` guidance.

The public report types preserve the safe Remote resource results, Shared selection and registration details, and Bridge operation/state summaries emitted by the Observability Plugin. Bridge, Remote, and Shared commands consume the same `BrowserObservabilitySnapshot`, report, resource, Shared, and Bridge facts from this entry, so other extensions can reuse the result builders, grouping, and selection rules without invoking the CLI or adding another browser reader.

The reader intentionally omits response headers and bodies, cookies, tokens, factories, containers, props, routers, arbitrary metadata, and raw runtime objects. The current public report also does not provide Remote response contents, Shared factory identity, Bridge props/router objects, or business-data readiness. Bridge commit and route-sync evidence is available, but application readiness still needs an explicit business signal. Missing facts should remain unknown rather than being inferred by commands.

The package root remains the default OpenRuntime extension entry and keeps the existing named public exports for compatibility. New integrations should use `@openruntime/extension-mf/core` for reusable capabilities and types. Command routing, formatting, and output adapters are intentionally private.
