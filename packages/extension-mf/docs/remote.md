# Remote loading evidence

The remote commands analyze the public `RuntimeState` and `RuntimeReport` values already captured by the Module Federation Observability Plugin. They never make a new remote request or execute application code.

## Commands

```text
openruntime mf trace [remote/expose] [--mf <name>] [--instance <ref>] [--trace-id <id>]
openruntime mf remote check <remote> [--mf <name>] [--instance <ref>]
openruntime mf preload trace [remote] [--mf <name>] [--instance <ref>] [--trace-id <id>]
```

All commands return the versioned structured result objects by default.

Successful command output omits the internal compatibility and capability summaries. If collection is incomplete or unavailable, the reason remains in `warnings` and the recovery step remains in `recommendedActions`.

## Ordinary remote trace

`mf trace` orders evidence into these fixed stages:

1. request start
2. remote match
3. manifest or snapshot resolution
4. remote entry resource loading
5. container initialization
6. expose lookup
7. factory execution
8. final result

Each stage contains its observed status, timestamps, duration, remote, expose, safe URL, HTTP status, MIME type, redirect state, cache/recovery/timeout flags, resource results, and safe error summary. A stage with a start event and no later completion is `pending`. A stage with no related record is `unknown`; it is never promoted to success from a later unrelated stage.

The `mf trace` and `mf preload trace` commands format absolute start and end times as `YYYY-MM-DD HH:mm:ss.SSS UTC`. Durations remain numeric milliseconds.

The top-level trace outcome comes from the captured report. A recovered trace remains `recovered`, while its original failed resource stays in the resource list.

With no target, the command returns a summary array sorted by start time. Every item includes its page-session `instanceRef` and `traceId`. A target that matches several concurrent reports requires `--trace-id` and returns copyable candidates.

## Remote check

`mf remote check` combines current consumer state with previously observed ordinary remote reports. It reports:

- whether the remote was declared by the selected consumer;
- whether a current consumer-to-producer relationship exists;
- manifest and remote entry resource evidence;
- HTTP status, MIME type, redirects, and duration;
- container initialization and expose outcomes;
- cache, recovery, timeout, and trace ids.

The check does not fetch a manifest or remote entry, execute a script, initialize a container, or call an expose/factory. A declaration without a captured load has outcome `unknown` and recommends reopening or reproducing the page path.

## Preload trace

`mf preload trace` accepts only reports and resources identified as `preloadRemote`. Its stages are preload target, manifest resolution, resource requests, and final result. Ordinary `loadRemote` events are excluded, including when the remote name, expose, URL, or request id is the same.

## Selection and ambiguity

- `--instance` selects the exact current `instanceRef`.
- `--mf` selects a consumer by its visible MF name.
- Duplicate names return candidate `--instance` commands.
- Remote names and aliases are both accepted.
- A full remote name or alias is matched before parsing an expose suffix, so `@scope/catalog/Button` resolves remote `@scope/catalog` and expose `./Button`.
- Reports remain separated by `traceId`; concurrent loads are not merged by remote name.
- A missing `--trace-id` on several matching reports returns candidate `--trace-id` commands.

The current public report schema always supplies a report `traceId`. Request ids remain visible as supporting identity, but are never used to merge two trace reports.

## Completeness

The result uses `state.capabilities.remoteTrace` and page history timing:

- `complete`: the capability and captured history are complete.
- `partial`: existing evidence is returned, with a warning that earlier stages may be missing. Partial history, partial capability, late injection, or late-bound instances produce this state.
- `unavailable`: the result explicitly says the current reader cannot support remote tracing and recommends upgrading/configuring observability and reopening the page. It is not reported as an empty successful check.

If the extension was installed after Module Federation had already started, reopen the page with `openruntime open <url>` before reproducing the load.

## Public reuse

The package's `@openruntime/extension-mf/core` entry exports the pure selectors and result builders:

```ts
import {
  buildRemoteTrace,
  createRemoteCheckResult,
  createRemoteTraceResult,
  selectRemoteCheck,
  selectRemoteTrace
} from "@openruntime/extension-mf/core";
```

These functions accept plain snapshots and selectors. They do not write CLI output or access a browser. Command-specific candidate rendering stays outside the reusable layer, so another extension can present the same evidence with its own command prefix.

URLs and errors are limited to the safe public reader fields and receive another redaction pass before output. Response bodies, headers, cookies, tokens, factories, containers, and raw runtime objects are not included.
