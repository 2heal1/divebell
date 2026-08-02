# Remote result fields

## `remote status <remote>`

Read the selected `consumer` first, then the `remote` object:

- `name`, `alias`: declared Remote identity.
- `declared`: present in the selected consumer configuration.
- `loaded`: current producer relationship or successful load evidence exists.
- `loadedExposes`: exposes from captured successful or recovered ordinary
  loads. An empty list does not prove the Remote was unused.
- `relationship`: `resolved`, `ambiguous`, `unresolved`, or `unknown`.
- `producerInstanceRef`, `candidateProducerInstanceRefs`: resolved or possible
  producer instances.
- `latestResult`: latest captured ordinary load result.
- `latestTraceId`: exact trace to inspect next.

When `proxy` is present:

- `target`: configured version or sanitized manifest URL.
- `matchedBy`: Remote name or alias.
- `applied`: `true`, `false`, or `unknown` based on current public evidence.
- `loadedFrom`: observed manifest URL when available.
- `error`: proxy setup failure before MF started.

The proxy field applies to the current page-open operation only.

## `remote trace [remote/expose]`

Without a target, treat `traces` as a summary list. If several traces match a
target, select one returned `--trace-id` candidate.

Trace fields:

- `traceId`, `requestId`, `instanceRef`, `instanceName`: exact identity and
  context.
- `kind`: `load` or `preload`.
- `remote`, `expose`: selected target.
- `outcome`: `success`, `error`, `pending`, or `recovered`.
- `startedAt`, `endedAt`, `duration`: captured timing.
- `cached`, `recovered`, `timeout`: cross-stage summary flags.
- `stages`: ordered lifecycle evidence.
- `preload`: matching preload evidence for an ordinary load.
- `error`: final sanitized error.

Ordinary load stages are request, Remote match, manifest, remote entry,
container initialization, expose lookup, factory execution, and final result.
Preload stages are target, manifest, resource requests, and final result.

For each stage:

- `status`: `success`, `error`, `pending`, or `unknown`.
- `startedBy`, `endedBy`: lifecycle hooks that supplied the boundaries.
- `cached`, `recovered`, `timeout`: stage facts.
- `resources`: matching manifest, remote entry, script, style, or other request
  evidence.
- `error`: sanitized stage error.

Read the final failed or recovered stage first, then move backward to the first
stage that stopped being successful. A recovered trace keeps its original
failed resource; do not report it as a clean first-attempt success.

`preload.status: not-observed` means no matching preload report was captured.
It does not prove that no preload happened before collection began.
