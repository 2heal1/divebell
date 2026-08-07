# @divebell/extension-mf

Read safe Module Federation multi-instance state, captured loading evidence, and producer-module performance from the page. The extension provides eight external commands and bounded, serializable MF and browser evidence.

## Commands

```text
divebell mf status [name] [--role <consumer|producer>] [--instance <ref>] [--verbose]
divebell mf module-info [remote] [--mf <name>] [--instance <ref>]
divebell mf module-perf [remote/expose] [--report] [--mf <name>] [--instance <ref>]
divebell mf remote status <remote> [--mf <name>] [--instance <ref>]
divebell mf remote trace [remote/expose] [--preload] [--mf <name>] [--instance <ref>] [--trace-id <id>]
divebell mf shared status [package] [--scope <scope>] [--version <version>] [--verbose]
divebell mf shared trace [package] [--mf <name>] [--instance <ref>] [--scope <scope>] [--operation <id>] [--trace-id <id>]
divebell mf bridge trace [remote] [--mf <name>] [--instance <ref>] [--bridge-id <id>] [--operation <id>]
```

All commands return structured output by default; `--json` is not required.
Compatibility details, and the capability details still used by Remote and
Bridge traces, are omitted from successful command output. When evidence is
incomplete or unavailable, state and trace commands keep the useful reason in
`warnings` and the next step in `recommendedActions`. `module-perf` instead
uses its existing outcome, status, match, unobserved, and evidence fields.

The package also includes an Agent Skill that explains how to choose a command,
resolve ambiguous results, and interpret every returned field. Print its path
without running a page command:

```sh
divebell mf --skill
```

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

Remote and Shared trace commands analyze facts exposed through the page's safe
public Observability reader. Their separate command paths keep the target type
explicit; there is no generic `mf trace` mode. `mf status` additionally reads a
bounded, sanitized snapshot of `__FEDERATION__.__SHARE__`; promises, module
values, instance ids, and executable function objects are not returned.
`complete` means the required evidence is complete. `partial` returns the
evidence that exists and states that earlier history can be missing. Shared
trace reports `not-found` when no captured operation matches. For commands that
still use capability declarations, `unavailable` means the current reader
cannot provide that history. `unknown` means the available evidence is
insufficient to reach a conclusion; it does not mean success or absence.

## Install

Installing the package only registers the `divebell mf` commands. It does not
enable MF diagnostics for the current page. Every page you want to inspect must
be opened with the bare `--mf` flag.

1. Install the extension:

```sh
divebell extensions add @divebell/extension-mf
```

2. Open the target page with MF diagnostics enabled:

```sh
divebell open https://example.com --mf
```

3. Run an MF command against that page:

```sh
divebell mf status
```

If the page was opened with an ordinary `divebell open`, the extension is still
installed, but its MF commands refuse to run and ask you to reopen the page with
`divebell open <url> --mf`.

The bare `--mf` flag on `divebell open` enables MF diagnostics. It is different
from `--mf <name>` on some `divebell mf` commands, which only selects an MF
instance by its visible name and cannot enable diagnostics after the page has
opened.

Before navigation, the extension installs a matching MF debug Runtime,
global Observability Plugin, and bounded page-performance and Manifest
collector. Future MF instances use that constructor, so the target project can
expose the newer Remote, Shared, and
Bridge diagnostics even when its installed Runtime does not contain those
hooks. A page that was already open cannot have complete earlier loading
history.

The current CLI uses the plural `extensions` command. The older singular form
`divebell extension add @divebell/extension-mf` is not supported by this
repository version.

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

## Diagnose a page

The packaged [Inspect Module Federation Skill](skills/inspect-module-federation/SKILL.md)
is the authoritative command workflow, result-field reference, and diagnosis
guide. It is included in every published extension package, so it stays aligned
with the installed command version.

To locate the installed copy from the CLI:

```sh
divebell mf --skill
```

Open the page with `--mf`, reproduce the relevant user path, then use the
Skill to select the smallest command and interpret the result. This includes
`module-perf --report` and its report-level recommendations.

## Collection modes and compatibility

- `injected`: this extension installed its bundled collector before MF runtime startup.
- `application`: the page exposes one compatible application Observability reader; it is preferred over the injected reader.
- `unavailable`: `--mf` was enabled, but no compatible public reader is present. Inspect the injection details, then reopen the page.

Every command checks the report schema. Remote and Bridge traces also use the
reader's capability declarations. Shared trace relies on the bundled injected
Runtime and collector, and treats an empty match as `not-found`. Partial
history, late collection, incompatible readers, several application readers,
expired instance references, child-frame-only results, and unavailable trace
data are reported explicitly with a next action. The commands do not fall back
to `__FEDERATION__.__INSTANCES__`, `moduleInfo`, `moduleCache`, `options.id`, or
other private runtime objects. The only additional global read is the sanitized
`__SHARE__` snapshot used by `mf status` and `mf shared status`.

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
