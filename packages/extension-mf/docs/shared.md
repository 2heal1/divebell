# Shared runtime commands

The Shared commands analyze facts already exposed by the page's public Module Federation Observability reader. They do not scan source files, inspect lockfiles, validate `externals` or `transformImport`, or modify Module Federation configuration.

## Current status

```sh
openruntime mf shared status [package] \
  [--mf <name>] [--instance <ref>] [--scope <scope>]
```

Status uses `state.instances[].shareScopes` as its source of truth. Without `--mf` or `--instance`, it returns every observed instance. `--mf` may return several same-name instances and always preserves their `instanceRef`; `--instance` is exact. Results are grouped by instance and scope and include every current version, loaded versions, provider, `loaded`, `singleton`, `eager`, and strategy.

Historical reports are not converted into current state. A historical singleton conflict is included only when the current scope still contains every version named by that conflict.

The command checks `state.capabilities.sharedState`:

- `complete`: returns the current facts normally.
- `partial`: returns the available facts with a warning.
- `unavailable`: returns a structured unsupported result with the capability reason and recovery action.

## Registration, selection, and load trace

```sh
openruntime mf shared trace [package] \
  [--mf <name>] [--instance <ref>] [--scope <scope>] \
  [--operation <id>] [--trace-id <id>]
```

Without a package, trace returns an operation summary list. With a package, one matching operation is shown in full. Several matches produce candidates containing `instanceRef`, MF name, package, scope, `operationId`, `traceId`, and a copyable command.

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
