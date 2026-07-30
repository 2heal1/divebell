# @divebell/extension-mf

Read safe Module Federation multi-instance state and captured loading evidence from the MF Observability Plugin in the page. The extension provides seven external commands and a bounded, serializable view of the MF global share table.

## Commands

```text
divebell mf status [name] [--role <consumer|producer>] [--instance <ref>] [--verbose]
divebell mf module-info [remote] [--mf <name>] [--instance <ref>]
divebell mf remote status <remote> [--mf <name>] [--instance <ref>]
divebell mf remote trace [remote/expose] [--preload] [--mf <name>] [--instance <ref>] [--trace-id <id>]
divebell mf shared status [package] [--scope <scope>] [--version <version>] [--verbose]
divebell mf shared trace [package] [--mf <name>] [--instance <ref>] [--scope <scope>] [--operation <id>] [--trace-id <id>]
divebell mf bridge trace [remote] [--mf <name>] [--instance <ref>] [--bridge-id <id>] [--operation <id>]
```

All commands return structured output by default; `--json` is not required. Compatibility and capability summaries are used internally but are omitted from successful command output. When evidence is incomplete or unavailable, the useful reason remains in `warnings` and the next step remains in `recommendedActions`.

On MF commands, `--mf <name>` selects the visible Module Federation name. On
`divebell open`, the bare `--mf` flag enables the bundled MF diagnostics.
`--instance` selects the exact, session-scoped `instanceRef` reported by
`mf status`. The Observability Plugin assigns this reference to an instance
object for the current page session; it is not an MF global key and is not used
to index `__SHARE__`. Several frames or runtimes can use the same visible name,
so a command that needs one context returns candidates instead of silently
choosing the first one. Copy the candidate command containing `--instance`; do
not reuse an instanceRef after reopening the page.

## Stack detection

When the current page has a running Module Federation instance,
`divebell stack` returns a `module-federation` detection with `command: "mf"`.
An empty debug injection is not treated as an MF application. Extensions created
with a custom `commandName` return that command name instead.

Remote and Shared trace commands analyze facts exposed through the page's safe public Observability reader. Their separate command paths keep the target type explicit; there is no generic `mf trace` mode. `mf status` additionally reads a bounded, sanitized snapshot of `__FEDERATION__.__SHARE__`; promises, module values, instance ids, and executable function objects are not returned. `complete` means the required evidence is complete. `partial` returns the evidence that exists and states that earlier history can be missing. `unavailable` means the current reader or runtime cannot provide the capability. `unknown` means the available evidence is insufficient to reach a conclusion; it does not mean success or absence.

## Install

```sh
divebell extensions add @divebell/extension-mf
```

The current CLI uses the plural `extensions` command. The older singular form `divebell extension add @divebell/extension-mf` is not supported by this repository version.

After installing or updating the extension, add `--mf` when opening a page that needs MF debugging. Before navigation, the extension installs a matching MF debug Runtime constructor and global Observability Plugin. Future MF instances use that constructor, so the target project can expose the newer Remote, Shared, and Bridge diagnostics even when its installed Runtime does not contain those hooks. A page that was already open cannot have complete earlier loading history.

```sh
divebell open https://example.com --mf
```

MF debugging is opt-in. An ordinary `divebell open` does not inject the debug
Runtime or Observability Plugin. MF commands require the current page to have
been opened with `--mf`.

### Proxy remotes while opening

Use `--mf-proxy` to replace a remote before Module Federation starts. The key
can be the configured remote name or alias. A version target replaces the
remote's version, while an HTTP(S) manifest URL replaces its entry.

```sh
divebell open https://example.com \
  --mf-proxy 'mf-doc=1.2.3' \
  --mf-proxy 'playground=https://cdn.example.com/playground/mf-manifest.json'
```

`--mf-proxy` also accepts an absolute or relative path to a local JSON file:

```sh
divebell open https://example.com --mf-proxy ./mf-proxy.json
```

The recommended file shape is:

```json
{
  "overrides": {
    "mf-doc": "1.2.3",
    "playground": "https://cdn.example.com/playground/mf-manifest.json"
  }
}
```

A flat object containing the same remote-to-target pairs is also accepted.
Inline rules and JSON files can be repeated and mixed. Defining the same
remote more than once is an error. JSON file values must be strings, and the
argument must be a local file path rather than an HTTP URL.

The proxy applies only to that `open` operation. The next ordinary
`divebell open` restores the browser's previous proxy settings before the
page starts, so an earlier Divebell proxy does not remain active. Existing
proxy settings that Divebell did not create are preserved and restored.
`--mf-proxy` is independent from debug collection. Add `--mf` as well only
when the same page also needs the injected MF diagnostics.

After the page opens, use `mf remote status <remote>` to check the optional
`proxy` field. It reports the configured target, whether the rule matched the
remote name or alias, and whether the registered or actually loaded remote
reflects that target. For URL proxies, `loadedFrom` contains the observed
manifest URL when loading evidence exists, so a stale embedded snapshot cannot
be reported as a successful proxy. `unknown` means the public page state did
not expose enough evidence for a direct comparison.

The published package contains both browser bundles and has no runtime npm dependencies. The target project does not need to add these preview packages to its own dependencies. If the application already exposes a compatible Observability reader, that application reader is used instead. If the same debug Runtime version or global Observability Plugin is already present, the extension keeps it instead of adding a duplicate.

## Sync the browser collector

The checked-in Runtime, Runtime Core, and Observability Plugin are built from
one Module Federation source revision. Their package versions can differ
because the Runtime and Observability Plugin are released independently.

By default, download the packages from the latest stable Module Federation
release and regenerate all checked-in assets:

```sh
pnpm run sync:mf-observability
```

Pass `--tag` to use a specific npm dist-tag:

```sh
pnpm run sync:mf-observability -- --tag next
```

The command resolves that tag independently for all three packages, verifies
their npm provenance points to one Module Federation source revision, and
installs those exact published versions before generating the assets. The
default tag is `latest`. Generation fails when the selected Observability
Plugin does not expose the reader interface required by this extension.
The currently checked-in assets use `next` because the current `latest`
Observability Plugin does not yet expose that interface.

For unreleased local changes, build the three packages and pass their package
roots instead:

```sh
pnpm run sync:mf-observability -- \
  --package-root /path/to/node_modules/@module-federation/observability-plugin \
  --runtime-package-root /path/to/node_modules/@module-federation/runtime \
  --runtime-core-package-root /path/to/node_modules/@module-federation/runtime-core
```

The sync command confirms that all three package roots come from the same local
repository. Runtime and Runtime Core must use the same version, and Runtime
must depend on that Runtime Core version or its local workspace package. It
builds the injected debug class from Runtime Core's public entry and the global
plugin from Observability Plugin's public Chrome entry.

Use check mode in CI or before publishing. It regenerates everything in memory and fails when any checked-in asset is stale without modifying the repository:

```sh
pnpm run check:mf-observability
pnpm run check:mf-observability -- --tag next
```

Local package roots are also supported in check mode:

```sh
pnpm run check:mf-observability -- \
  --package-root /path/to/node_modules/@module-federation/observability-plugin \
  --runtime-package-root /path/to/node_modules/@module-federation/runtime \
  --runtime-core-package-root /path/to/node_modules/@module-federation/runtime-core
```

The generated collector and build metadata are included in the published extension. The extension still has no runtime npm dependencies and the target page does not resolve packages or request a CDN at runtime.

The injected debug Runtime and Observability Plugin are one matched pair. Do not update only one bundle.

The checked-in Vmok Proxy SDK is also fixed and self-contained. Update it only
from a reviewed local `@vmok/proxy-sdk` package root:

```sh
pnpm run sync:vmok-proxy -- \
  --package-root /path/to/node_modules/@vmok/proxy-sdk

pnpm run check:vmok-proxy -- \
  --package-root /path/to/node_modules/@vmok/proxy-sdk
```

Its package version and bundle hash are recorded in
`assets/proxy-sdk-build.json`; the browser never downloads a latest-version
Proxy SDK from a CDN.

## `mf status`

```sh
divebell mf status
divebell mf status host
divebell mf status --role consumer
divebell mf status --instance mf-2
divebell mf status --verbose
```

Without selectors, the command returns a compact current-state view. Each instance contains only its session-scoped `instanceRef`, visible name, role, active flag, and the current instances that consume it.

The top-level `shared` object is grouped as `scope -> package -> version`. It traverses the values of `__FEDERATION__.__SHARE__[instanceId]`, merges duplicate scope maps, and omits the instance ids. Each version keeps safe Shared fields such as `from`, `useIn`, loading state, scope, dependencies, strategy, and share configuration. By default, only versions with `loaded === true` or a `lib` function are returned.

`loading` is shown only while a version has not finished loading. Once
`loaded` is true, `loading` is omitted from both `mf status` and
`mf shared status`.

Function details use two output levels:

| Output | Loaded versions | Unloaded versions | `lib` / `get` details |
| --- | --- | --- | --- |
| default | yes | no | omitted |
| `--verbose` | yes | yes | bounded function source text, generated file URL and line/column, plus original source file and line/column when a usable Source Map is available |

The default command does not collect function locations. With `--verbose`, the generated bundle location remains present when an original source location is found. Location collection is best effort. Native functions, anonymous evaluation scripts, an unavailable browser debugging connection, missing Source Maps, oversized Source Maps, or inaccessible Source Maps can leave some location fields absent. Failure to locate one function does not fail `mf status`. URL credentials, queries, and fragments are removed from returned locations, and function objects are never returned.

When a name matches more than one instance, the command returns candidates such as:

```text
divebell mf status --instance "mf-2"
```

It never selects the first same-name instance.

## `mf module-info`

```sh
divebell mf module-info
divebell mf module-info catalog
divebell mf module-info catalog --mf host
divebell mf module-info catalog --instance mf-1
```

The command first selects a confirmed consumer. It automatically selects only when exactly one consumer exists. With several consumers, duplicate names, or ambiguous remotes, it returns copyable candidate commands.

The positional `remote` is optional only when the selected consumer has exactly one declared or loaded remote. It matches that consumer's configured remote name or alias; it does not select an MF producer instance by the producer's visible name. When the remote relationship is known, the result includes the matching `producerInstanceRef`.

Output distinguishes `declared` from `loaded` and reports only what the public reader can confirm: the consumer and producer references, manifest and remote entry details, snapshot source, global name, type, public paths, observed exposes, shared summary, dependent remotes, cache state, and first observed loading time. Missing historical evidence remains unknown rather than being inferred from array order; useful gaps and next steps remain in `warnings` and `recommendedActions`.

## Remote loading commands

```sh
divebell mf remote status shop --mf host
divebell mf remote trace
divebell mf remote trace shop/Button --instance mf-1 --trace-id mf-trace-1
divebell mf remote trace shop --preload --instance mf-1
```

`mf remote status` returns a compact current view: whether the selected consumer declared the remote, whether the remote itself has loaded, which exposes have been observed loading successfully, whether a current consumer-to-producer relationship exists, the latest observed result, and its `traceId`. `loadedExposes` contains only exposes from successful or recovered loads; failed attempts are not counted. When the current page was opened with `--mf-proxy`, the optional `proxy` object also reports the target, name/alias match, whether the proxy actually applied, and the observed manifest URL as `loadedFrom` when available. It only analyzes existing page evidence and does not make a request or execute remote code. Detailed resources and lifecycle stages stay in `mf remote trace`.

`mf remote trace` returns a compact lifecycle for the captured `loadRemote` operation:
request, remote match, manifest or snapshot resolution, remote entry loading,
container initialization, expose lookup, factory execution, and final result.
Each observed phase shows its result, readable start and end times, duration,
and the lifecycle hooks that opened and closed it. Related resource loading
details appear only on phases that have them. With no target it lists trace
items in start-time order; each item keeps its `instance.ref` and `traceId`.

Absolute trace times are returned as `YYYY-MM-DD HH:mm:ss.SSS UTC`. Durations remain numeric milliseconds.

An ordinary load also includes matching preload evidence. It distinguishes a
preload that finished before loading from one that overlapped loading.
`not-observed` means that no matching preload report was captured, not that
preloading definitely did not happen.

`mf remote trace --preload` identifies the operation as `preloadRemote` and displays its
own lifecycle: target selection, manifest resolution, resource requests, and
final result. It uses only preload evidence. Ordinary `loadRemote` resources
are excluded even when both operations target the same remote.

Remote names and aliases are accepted. For `remote/expose`, the full remote name or alias is matched before the expose suffix is parsed, including scoped remote names that contain `/`. Same-name instances and concurrent traces are never reduced to the first result; candidate output includes copyable `--instance` or `--trace-id` commands.

See [docs/remote.md](docs/remote.md) for the result fields, evidence boundaries, and complete compatibility behavior.

## Shared state and loading chains

```sh
divebell mf shared status
divebell mf shared status react --scope default
divebell mf shared status react --scope default --version 18.3.1
divebell mf shared status react --verbose

divebell mf shared trace
divebell mf shared trace react --instance mf-1
divebell mf shared trace react --instance mf-1 --operation loadShare-42
divebell mf shared trace react --trace-id mf-trace-42
```

`mf shared status` returns the same `scope -> package -> version` structure as the top-level `shared` field in `mf status`. It reads the merged global Shared registry and does not return an `instances` list. The optional package, `--scope`, and `--version` selectors are exact filters. By default, only loaded versions are returned and `lib` / `get` details are omitted. `--verbose` additionally returns unloaded versions and bounded function source/location details.

`mf shared trace` explains registration, selection, and loading history. Without `--mf` or `--instance`, it selects the first top-level consumer in instance creation order; if relationship evidence cannot identify a top-level consumer, it selects the first created consumer. It reports an error only when no consumer exists. Use `--mf` to choose by visible name or `--instance` to choose one exact current consumer.

Shared trace correlation uses `operationId` first and falls back to `traceId` or `requestId`; it never combines concurrent loads merely because they use the same package name. When a package matches several operations, the result contains instance, package, scope, operation, and a copyable command for each candidate.

See [docs/shared.md](docs/shared.md) for capability, version, ambiguity, and partial-history behavior.

## `mf bridge trace`

```sh
divebell mf bridge trace
divebell mf bridge trace catalog
divebell mf bridge trace shop --instance mf-1
divebell mf bridge trace catalog --instance mf-1 --bridge-id bridge-1 --operation bridge-op-1
divebell mf bridge trace catalog --instance mf-1 --operation bridge-op-1
```

Without a remote or operation selector, the command returns a summary of the observed Bridge operations. A remote selector accepts the configured remote name or alias within each MF instance. When more than one operation matches, the result lists the instanceRef, bridgeId, operationId, side, operation, and a copyable command that includes `--operation`. Same-name MF instances and same-name remotes remain isolated by instanceRef.

Operations are correlated by operationId within one MF instance. Consumer and producer evidence can share one operation while retaining their side. Missing operationId values are never correlated across reports or sides; those records remain independent and are marked as incomplete associations.

The output distinguishes an operation call, render invocation, operation return, and framework commit. A successful render return does not imply that commit was observed. Even a commit does not establish that the page is rendered for the user, business data is ready, or the application is interactive. Route-sync output uses only the already-sanitized route summary and does not claim final navigation success.

`bridgeTrace` capability controls historical output. `partial` returns available operations with a missing-history warning. `unavailable` returns a structured unsupported result instead of claiming that the page does not use Bridge. If current Bridge state exists, it is still shown while historical operations remain unavailable. Reopen the page before reproducing the operation when observation was installed late.

See [docs/bridge.md](docs/bridge.md) for lifecycle correlation and evidence boundaries.

## Collection modes and compatibility

- `injected`: this extension installed its bundled collector before MF runtime startup.
- `application`: the page exposes one compatible application Observability reader; it is preferred over the injected reader.
- `unavailable`: `--mf` was enabled, but no compatible public reader is present. Inspect the injection details, then reopen the page.

Every command checks the report schema and capabilities. Partial history, late collection, incompatible readers, several application readers, expired instance references, child-frame-only results, and unavailable trace data are reported explicitly with a next action. The commands do not fall back to `__FEDERATION__.__INSTANCES__`, `moduleInfo`, `moduleCache`, `options.id`, or other private runtime objects. The only additional global read is the sanitized `__SHARE__` snapshot used by `mf status` and `mf shared status`.

## Public API for other extensions

Other extensions can reuse the safe reader, selection rules, and result builders from the package's public `core` entry. They do not need to invoke the MF command or import a file under `dist`.

```ts
import {
  MfCoreError,
  collectBridgeOperations,
  createCompatibilitySummary,
  createBridgeTraceResult,
  createModuleInfoResult,
  createRemoteStatusResult,
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
  selectRemoteStatus,
  selectRemoteTrace,
  selectSharedInstances,
  selectStatusInstances,
  type BrowserObservabilitySnapshot,
  type BridgeTraceResult,
  type ConsumerSelectors,
  type StatusSelectors
} from "@divebell/extension-mf/core";
```

The reusable layer accepts snapshots and plain selectors. It returns structured candidates and recommended action types, without writing output or embedding `divebell mf` commands. Use it when another Extension needs a custom command surface or workflow.

The public report types preserve the safe Remote resource results, Shared selection and registration details, and Bridge operation/state summaries emitted by the Observability Plugin. Bridge, Remote, and Shared commands consume the same `BrowserObservabilitySnapshot`, report, resource, Shared, and Bridge facts from this entry, so other extensions can reuse the result builders, grouping, and selection rules without invoking the CLI or adding another browser reader.

The reader intentionally omits response headers and bodies, cookies, tokens, factories, containers, props, routers, arbitrary metadata, and raw runtime objects. The current public report also does not provide Remote response contents, Shared factory identity, Bridge props/router objects, or business-data readiness. Bridge commit and route-sync evidence is available, but application readiness still needs an explicit business signal. Missing facts should remain unknown rather than being inferred by commands.

The package root remains the default Divebell extension entry and keeps the existing named public exports for compatibility. New integrations should use `@divebell/extension-mf/core` for reusable capabilities and types. Command routing, formatting, and output adapters are intentionally private.

## Create a branded command entry

Use the supported Extension factory when another distribution needs the complete command surface under a different top-level command:

```ts
import { createMfExtension } from "@divebell/extension-mf/extension";

export default createMfExtension({
  name: "vmok",
  commandName: "vmok",
  displayName: "Vmok",
  description: "Inspect Vmok applications."
});
```

The configured name is used consistently by top-level and command help, validation guidance, structured command results, and copyable candidate commands. The default package entry continues to register `divebell mf`.

External Extension packages installed through `divebell extensions add` must remain self-contained. A branded distribution should bundle this implementation and its injection assets into its own published archive instead of declaring a runtime dependency.
