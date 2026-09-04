# Optimize First-Screen Code Usage

Use this mode only after the analysis reference has produced trusted matching
scope, first-screen coverage, and coverage-disabled readiness. The default
target is a **70% aggregate execution ratio** for matched target-app chunks:
`sum(usedBytes) / sum(totalBytes)`. It is an exit condition, not a display
metric.

There are two independent lanes:

- **Usage lane:** defer unexecuted code through a route or interaction boundary
  until the target is reached. Only this lane closes the target gap.
- **Topology lane:** consolidate genuinely fragmented, high-execution chunks
  with matching route ownership, cache life, and initial-size budget. This can
  reduce request/loader overhead but never advances the 70% status.

## State artifact

Create `<report-dir>/code-usage-optimization-state.json` before taking a code
action, and update it only after a transition completes. Keep it with coverage,
experience, Chunk Map, and A/B artifacts so another agent can resume without
rediscovering the decision history.

```json
{
  "version": 1,
  "state": "BASELINE_CAPTURED",
  "goal": { "aggregateExecutionRatio": 0.7 },
  "buildEvidence": { "mode": "production|local-analysis", "proof": "" },
  "baseline": { "totalBytes": 0, "usedBytes": 0, "ratio": 0, "byteGap": 0 },
  "usageCandidates": [],
  "topologyCandidates": [],
  "history": []
}
```

Candidate rows carry `rank`, `exclusivePotentialSavingsBytes`, `owner`,
`boundary`, `requiredRegression`, `status`, `decisionEvidence`, and actual
byte/ratio/ready deltas after A/B. Valid statuses are `pending`, `tracing`,
`accepted`, `rejected`, and `decomposition-required`.

## Transitions

| Current state | Required evidence | Next state |
| --- | --- | --- |
| `INIT` | URL, account, workflow, cache policy, and ready spec are fixed. Browser app assets match the Chunk Map build. With a local proxy, prove a locally served response by a dev marker or asset identity and hash or byte-compare it to the local asset; the original CDN hostname may be preserved by the proxy. | `ENVIRONMENT_VERIFIED` |
| `ENVIRONMENT_VERIFIED` | Coverage and coverage-disabled experience are captured separately with the same ready spec; target-app matching scope is reported. | `BASELINE_CAPTURED` |
| `BASELINE_CAPTURED` | Record `T`, `U`, `U/T`, and `max(0, T - U / targetRatio)`; create an exclusive chunk ledger ordered by `potentialSavingsBytes`. | `USAGE_BACKLOGGED` |
| `USAGE_BACKLOGGED` | Trace the highest-impact pending boundary to actual static imports, route/feature owner, and its required later-path regression. A mixed chunk becomes `decomposition-required`, never silently skipped. | `BOUNDARY_TRACED` |
| `BOUNDARY_TRACED` | Rebuild and A/B test the candidate with identical scope, ready spec, and required later path. | `CANDIDATE_VALIDATED` |
| `CANDIDATE_VALIDATED` | Record actual bytes, ratio, target gap, status, and next highest-impact item. | `TARGET_MET` or `USAGE_BACKLOGGED` |

`TARGET_MET` requires a rebuilt ratio at or above target plus all required
regressions. A successful small A/B below target always returns to
`USAGE_BACKLOGGED`.

Use `PAUSED` for a timebox, unavailable environment, or user-requested stop.
Use `BLOCKED` only after every remaining high-impact unused-byte bucket has a
non-overlapping owner, a concrete reason it cannot safely leave the phase, and
the next evidence or change required. Neither means the target was met.

## Usage lane

Let `T` be matched target-app bytes and `U` executed bytes. The baseline gap is
`max(0, T - U / targetRatio)`: the optimistic number of zero-execution bytes
that must leave the phase if `U` stays unchanged. For a mutually exclusive
candidate with potential `P`, record `U / (T - P)` as a planning upper bound,
not a build prediction.

Work in descending `exclusivePotentialSavingsBytes` order, not implementation
ease. Source/package rows overlap their chunk and cannot enter the ledger. A
lower-ranked candidate can proceed only after every larger one has an owner and
a status of `tracing`, `decomposition-required`, `rejected`, or `pending` with
an explicit external dependency.

For a mixed main/shared chunk, create a decomposition item before small
cleanup. Find a real boundary: non-current route implementation, route
guard/store, feature telemetry or generated client, optional drawer/editor, or
application-owned broad import. Coverage ranges are never dynamic-import
boundaries.

An accepted deferral must improve the selected objective without breaking the
recorded first screen or deferred route/interaction. Compare matched
total/used/unused bytes, ratio, supported raw/gzip/brotli values, request
count, mapping scope, repeated ready samples, and the later business result.
A raw-byte reduction that moves the ratio away from target is not usage-lane
progress unless the user separately chose a network-byte objective.

## Topology lane

Evaluate consolidation independently. Every member must be small relative to
the measured initial-JS budget, substantially executed before the same ready
point, owned by one route/entry, and have compatible cache lifetime. The merge
must not pull low-use code or another route into the initial graph.

Show current and proposed raw/gzip/brotli size, request count, combined usage
ratio, parent/entry relations, cache-owner evidence, and repeated ready
samples. Fewer requests under HTTP/2/3 are a hypothesis until A/B confirms the
net effect.

For Rspack production builds, keep `splitChunks.chunks` set to `all` plus
`default` and `defaultVendors` unless measured evidence requires otherwise.
`splitChunks` only changes topology: it cannot defer static modules, tree-shake
coverage ranges, or change JavaScript execution order. Avoid a fixed global
`name`, broad forced vendor group, disabled defaults, and casual `enforce: true`.
Use `idHint` for naming and measured `maxInitialSize`, `maxSize`, or focused
cache groups only to subdivide a still-required oversized chunk.

## Local-analysis mode

Use local analysis only when an authenticated reverse-proxy page cannot use a
production build. Enable external JS source maps, the Chunk Map plugin, and an
analysis-only `dev.writeToDisk` flag only in that environment; point `--assets`
at the local static base; prove local serving by response/dev-server identity
and content (the proxy may retain the original CDN URL); and set
`buildEvidence.mode` to `local-analysis`.

Local-analysis A/B can compare the same dev build, but must label HMR/module
topology and offline gzip/brotli as non-production. Confirm with a production
build before merging a chunking change.

## Terminal report

Begin with `TARGET_MET`, `BLOCKED`, `PAUSED`, or `CANCELLED`. Include current
ratio, target, byte gap, a mutually exclusive remaining-unused-byte ledger,
and next owner/action for every row. Keep usage-lane and topology-lane results
in separate tables. Never call `PAUSED` or `BLOCKED` complete.
