# Shared runtime commands

The Shared commands analyze facts already exposed by the page's public Module Federation Observability reader. They do not scan source files, inspect lockfiles, validate `externals` or `transformImport`, or modify Module Federation configuration.

## Current status

```sh
divebell mf shared status [package] \
  [--scope <scope>] [--version <version>] [--verbose]
```

Status reads the sanitized merged global Shared registry and returns one `shared` object grouped as `scope -> package -> version`. It does not return an `instances` list. The optional positional package, `--scope`, and `--version` values are exact filters.

The default output includes only versions whose `loaded` value is true. It keeps safe fields such as `from`, `useIn`, loading state, scope, dependencies, strategy, and share configuration, while omitting `lib` and `get`.

`loading` is transitional evidence. It remains visible only while `loaded` is
false; after loading completes, both `mf status` and `mf shared status` omit it.

`--verbose` additionally includes unloaded versions and bounded `lib` / `get` source and location details. A package or version that exists but is not loaded therefore returns an empty `shared` object by default and appears with `--verbose`.

## Global shared registry in `mf status`

`divebell mf status` and `divebell mf shared status` use the same sanitized global Shared registry and the same default-versus-verbose rules. `mf status` returns the complete registry next to the instance list, while `mf shared status` can narrow it by package, scope, and version.

Verbose output includes bounded `lib` and `get` source text, generated file, line, and column, and the original source file, line, and column when a usable Source Map is available. These details are best effort: missing or inaccessible Source Maps leave the generated bundle location intact, while a function with no browser location simply omits the location field. Location failures never fail the status command.

## Registration, selection, and load trace

```sh
divebell mf shared trace [package] \
  [--mf <name>] [--instance <ref>] [--scope <scope>] \
  [--operation <id>] [--trace-id <id>]
```

Without `--mf` or `--instance`, Shared trace selects the first top-level consumer in instance creation order. A consumer already known as another consumer's producer is not top-level. If relationship evidence cannot identify a top-level consumer, the first created consumer is used. The command fails only when no consumer exists. `--mf` selects consumers by visible name, while `--instance` selects one exact current consumer.

Without a package, `mf shared trace` returns an operation summary list. With a package, one matching operation is shown in full. Several matches produce candidates containing `instanceRef`, MF name, package, scope, `operationId`, `traceId`, and a copyable command.

Correlation uses the strongest public identifier in this order:

1. `operationId`, isolated by instance and package.
2. `traceId`.
3. `requestId` when no stronger identifier exists.

Package name alone is never a correlation key. The same operation id observed in two instances remains two chains.

A full chain can include the trigger, required and requested versions, every candidate and provider, `compatible`, `rejectionReason`, selected version, selection or failure reason, `singleton`, `strictVersion`, `eager`, strategy, registration action, remote, expose, request ids, fallback, recovery, and final report outcome.

## Capability and version behavior

Trace checks `state.capabilities.sharedTrace` before reading history. An available capability is used even if the runtime version text is missing, unusual, or appears older.

Detailed Shared events require stable Module Federation runtime 2.5.0 or newer. When the capability is unavailable and its reason identifies an older known runtime, the command recommends upgrading to 2.5.0 or newer. When runtime version is missing, the command reports it as unknown and preserves the capability reason without claiming the runtime is too old.

An unavailable capability means the reader cannot provide Shared history; it does not mean that no Shared event happened. When history is partial, available operations are returned with an incomplete-chain warning. When the reader was injected after runtime startup, the command asks the user to reopen the page before reproducing the operation.
