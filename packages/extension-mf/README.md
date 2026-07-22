# @openruntime/extension-mf

Read safe Module Federation multi-instance state and captured loading evidence from the MF Observability Plugin in the page. The extension provides `mf status`, `mf module-info`, `mf bridge trace`, `mf trace`, `mf remote check`, and `mf preload trace`; it does not read Module Federation private globals or add built-in CLI commands.

## Install

```sh
openruntime extensions add @openruntime/extension-mf
```

The current CLI uses the plural `extensions` command. The older singular form `openruntime extension add @openruntime/extension-mf` is not supported by this repository version.

After installing or updating the extension, reopen the page with `openruntime open`. The extension installs its bundled observability collector before navigation; a page that was already open cannot have complete earlier loading history.

```sh
openruntime open https://example.com
```

The published package contains the browser collector and has no runtime npm dependencies. The target project does not need to install the MF Observability Plugin for injected mode. If the application already exposes a compatible Observability reader, that application reader is used instead.

## Sync the browser collector

The bundled IIFE is generated from the Observability Plugin package's public `./chrome-devtool` export. Pass the root of a local `@module-federation/observability-plugin` package explicitly:

```sh
pnpm run sync:mf-observability -- \
  --package-root /path/to/module-federation/packages/observability-plugin
```

The sync command resolves the public JavaScript entry from `package.json`, bundles it into a self-contained browser IIFE, updates the installer version from that same package manifest, and records the package version, source commit, public entry, and bundle hash. It does not read a private source entry.

Use check mode in CI or before publishing. It regenerates everything in memory and fails when any checked-in asset is stale without modifying the repository:

```sh
pnpm run check:mf-observability -- \
  --package-root /path/to/module-federation/packages/observability-plugin
```

The generated collector and build metadata are included in the published extension. The extension still has no runtime npm dependencies and the target page does not resolve packages or request a CDN at runtime.

The injected collector must match the Module Federation Runtime and Bridge code used by the page. Updating only this IIFE cannot add resource, Shared, or Bridge hooks to an older Runtime.

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

It never selects the first same-name instance. An `instanceRef` is valid only for the current page observation session and frame/realm; do not save or reuse it after reopening the page.

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
  createStatusResult,
  filterRelationshipsForInstances,
  listBridgeCurrentStates,
  listRemoteCandidates,
  readMfObservability,
  selectConsumer,
  selectBridgeTrace,
  selectRemote,
  selectRemoteCheck,
  selectRemoteTrace,
  selectStatusInstances,
  type BrowserObservabilitySnapshot,
  type BridgeTraceResult,
  type ConsumerSelectors,
  type StatusSelectors
} from "@openruntime/extension-mf/core";
```

The reusable layer accepts snapshots and plain selectors. It returns structured candidates and recommended action types, without writing output or embedding `openruntime mf` commands. A Vmok extension can therefore use the same facts and render its own `openruntime vmok` guidance.

The public report types preserve the safe Remote resource results, Shared selection and registration details, and Bridge operation/state summaries emitted by the Observability Plugin. Bridge and Remote commands consume `BrowserObservabilitySnapshot`, `RuntimeReport`, `RuntimeReportEvent`, `RuntimeResource`, `RuntimeShared`, `RuntimeBridgeInfo`, and `RuntimeBridgeState` from this entry, so other extensions can reuse the same facts without invoking the CLI. Future Shared commands should use the corresponding public types instead of adding another browser reader.

The reader intentionally omits response headers and bodies, cookies, tokens, factories, containers, props, routers, arbitrary metadata, and raw runtime objects. The current public report also does not provide Remote response contents, Shared factory identity, Bridge props/router objects, or business-data readiness. Bridge commit and route-sync evidence is available, but application readiness still needs an explicit business signal. Missing facts should remain unknown rather than being inferred by commands.

The package root remains the default OpenRuntime extension entry and keeps the existing named public exports for compatibility. New integrations should use `@openruntime/extension-mf/core` for reusable capabilities and types. Command routing, formatting, and output adapters are intentionally private.
