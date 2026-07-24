# Remote loading evidence

The remote commands analyze the public `RuntimeState` and `RuntimeReport` values already captured by the Module Federation Observability Plugin. They never make a new remote request or execute application code.

## Commands

```text
openruntime mf trace [remote/expose] [--mf <name>] [--instance <ref>] [--trace-id <id>]
openruntime mf remote check <remote> [--mf <name>] [--instance <ref>]
openruntime mf preload trace [remote] [--mf <name>] [--instance <ref>] [--trace-id <id>]
```

All commands return structured JSON by default.

Successful command output omits the internal compatibility and capability summaries. If collection is incomplete or unavailable, the reason remains in `warnings` and the recovery step remains in `recommendedActions`.

## Ordinary remote trace

`mf trace` returns a compact result and orders its `lifecycle` array into these
fixed stages:

1. request start
2. remote match
3. manifest or snapshot resolution
4. remote entry resource loading
5. container initialization
6. expose lookup
7. factory execution
8. final result

Each trace identifies the instance, target, and operation (`loadRemote`), then
shows the overall result and the lifecycle stages. An observed stage contains
its result, readable start and end times, duration, and the lifecycle hooks that
started and ended it. Cache, recovery, timeout, and safe error details appear
only when relevant. Resource loading details appear only on stages that
actually contain a related manifest, remote entry, script, style, or other
resource request.

The `mf trace` and `mf preload trace` commands format absolute start and end times as `YYYY-MM-DD HH:mm:ss.SSS UTC`. Durations remain numeric milliseconds.

The top-level trace outcome comes from the captured report. A recovered trace remains `recovered`, while its original failed resource stays in the resource list.

For an ordinary load, `preload` reports whether a matching `preloadRemote`
trace was captured for the same instance and remote. `timing` is
`before-load` when preload finished before the load started, or `overlapping`
when it was still running. `not-observed` means no matching preload report was
captured; it does not prove that no preload happened before collection began.

With no target, the command returns trace items sorted by start time. Every item
includes its page-session `instance.ref` and `traceId`. A target that matches
several concurrent reports requires `--trace-id` and returns copyable
candidates.

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

`mf preload trace` identifies its operation as `preloadRemote` and accepts only
reports and resources from that operation. Its lifecycle order is preload
target, manifest resolution, resource requests, and final result. Ordinary
`loadRemote` events are excluded, including when the remote name, expose, URL,
or request id is the same.

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
