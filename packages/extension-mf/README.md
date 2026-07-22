# @openruntime/extension-mf

Read safe Module Federation multi-instance state from the MF Observability Plugin in the page. The extension provides `mf status` and `mf module-info`; it does not read Module Federation private globals or add built-in CLI commands.

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
  createCompatibilitySummary,
  createModuleInfoResult,
  createStatusResult,
  filterRelationshipsForInstances,
  listRemoteCandidates,
  readMfObservability,
  selectConsumer,
  selectRemote,
  selectStatusInstances,
  type BrowserObservabilitySnapshot,
  type ConsumerSelectors,
  type StatusSelectors
} from "@openruntime/extension-mf/core";
```

The reusable layer accepts snapshots and plain selectors. It returns structured candidates and recommended action types, without writing output or embedding `openruntime mf` commands. A Vmok extension can therefore use the same facts and render its own `openruntime vmok` guidance.

The package root remains the default OpenRuntime extension entry and keeps the existing named public exports for compatibility. New integrations should use `@openruntime/extension-mf/core` for reusable capabilities and types. Command routing, formatting, and output adapters are intentionally private.
