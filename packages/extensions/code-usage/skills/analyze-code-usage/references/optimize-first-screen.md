# Optimize First-Screen Code Usage

Use this mode only after the analysis reference has produced trusted matching
scope, first-screen coverage, and coverage-disabled readiness. The default
target is a **70% aggregate execution ratio** for matched target-app chunks:
`sum(usedBytes) / sum(totalBytes)`. This is the usage exit condition. Preserve
the user's other goals too: when the request also requires a first-screen
speedup, reaching 70% alone does not complete it.

There are two independent lanes:

- **Usage lane:** remove proven dead or duplicated code through elimination or
  tree-shaking, or defer non-first-screen features (including executed
  initialization) through route/interaction boundaries, until the target is reached.
- **Topology lane:** consolidate genuinely fragmented, high-execution chunks
  with matching route ownership, cache life, and initial-size budget. This can
  reduce request/loader overhead; request merging alone is not usage progress,
  but verified duplicate-code removal counts under the usage lane's net-byte
  and ratio evidence.

## State artifact

Create `<report-dir>/code-usage-optimization-state.json` before taking a code
action, and update it only after a transition completes. Keep it with coverage,
experience, Chunk Map, and A/B artifacts so another agent can resume without
rediscovering the decision history.

```json
{
  "version": 1,
  "state": "BASELINE_CAPTURED",
  "goal": {
    "aggregateExecutionRatio": 0.7,
    "firstScreenBenefit": { "required": true, "metric": "ready.durationMs", "acceptance": "" }
  },
  "buildEvidence": { "mode": "production|local-analysis", "proof": "" },
  "baseline": { "totalBytes": 0, "usedBytes": 0, "ratio": 0, "byteGap": 0 },
  "upperBounds": {
    "mathematical": null,
    "ownerConstrained": null,
    "confirmedClosures": null
  },
  "usageCandidates": [],
  "topologyCandidates": [],
  "history": []
}
```

Set `firstScreenBenefit.required` from the user's request. When required,
record the fixed metric, cache policy, and a meaningful gain criterion before
candidate A/B; do not choose an easier metric or threshold after the result.
Candidate rows carry `rank`, `exclusivePotentialSavingsBytes` (observed
unexecuted bytes, not a savings forecast), `owner`,
`boundary`, `requiredRegression`, `status`, `decisionEvidence`, and actual
byte/ratio/ready deltas after A/B. Valid statuses are `pending`, `tracing`,
`accepted`, `rejected`, and `decomposition-required`.

## Transitions

| Current state | Required evidence | Next state |
| --- | --- | --- |
| `INIT` | URL, account, workflow, cache policy, and ready spec are fixed. Prove local/production serving and require `phase.contentIdentity.verified === true` (all target-app instances exact/embedded; zero mismatch/unverified) using [analysis capture §4](analyze.md#4-record-coverage). URL/hash/HTTP equality alone cannot replace this runtime gate. | `ENVIRONMENT_VERIFIED` |
| `ENVIRONMENT_VERIFIED` | Coverage and coverage-disabled experience are captured separately with the same ready spec; target-app matching scope and verified runtime identity are preserved. | `BASELINE_CAPTURED` |
| `BASELINE_CAPTURED` | Record `T`, `U`, `U/T`, and the unused-only scenario gap `max(0, T - U / targetRatio)`; order the exclusive ledger by observed unexecuted bytes (`potentialSavingsBytes`). | `USAGE_BACKLOGGED` |
| `USAGE_BACKLOGGED` | Trace the highest-impact pending boundary to actual static imports, route/feature owner, and its required later-path regression. A mixed chunk becomes `decomposition-required`, never silently skipped. | `BOUNDARY_TRACED` |
| `BOUNDARY_TRACED` | Rebuild and A/B test the candidate with identical scope, ready spec, and required later path. | `CANDIDATE_VALIDATED` |
| `CANDIDATE_VALIDATED` | Record actual bytes, ratio, target gap, status, and next highest-impact item. | `TARGET_MET` or `USAGE_BACKLOGGED` |

`TARGET_MET` requires the rebuilt ratio at or above target with the same runtime
identity gate (never a source-less fallback after capture failure), all required
regressions, and every user-requested performance criterion. For a requested
first-screen benefit, use repeated, interleaved A/B loads with coverage disabled
throughout each load; show all samples, median and spread, and verify that the
gain exceeds measurement noise. Identical ready specs and unchanged matching
scope are necessary, but a deadline-dominated fallback is not proof of benefit.
When bytes fall but speedup remains unproven, inspect the same ready metric's
critical path using resource timings or a coverage-disabled CPU trace. Executed
bytes are not CPU duration; distinguish transfer, initialization and required
data/render work before the next latency claim. Do not wait for 70% to diagnose
this gap, change ready after seeing results, or report `TARGET_MET`.
A successful small A/B below target always returns to `USAGE_BACKLOGGED`.

Use `PAUSED` for a timebox, unavailable environment, or user-requested stop.
Use `BLOCKED` only after every remaining high-impact unused-byte bucket has a
non-overlapping owner, a concrete reason it cannot safely leave the phase, and
the next evidence or change required. Record checked consumers, attempted or
ruled-out alternative boundaries, and the specific missing authority, contract,
or capability. Labels such as “shared”, “third-party”, or “hard to change” are
not blockers. Neither terminal state means the target was met.

## Usage lane

Let `T` be matched target-app bytes, `U` executed bytes, and `P` a candidate's
observed unexecuted bytes. `max(0, T - U / targetRatio)` and `U / (T - P)` are
unused-only planning scenarios: they assume removal of unexecuted bytes with
`U` unchanged, no added bytes or build rebalancing, and a positive remaining
denominator. They are not general savings bounds or build predictions.

Whole-feature deferral can also remove executed initialization. With signed
net reductions `ΔT = T_before - T_after` and `ΔU = U_before - U_after`, the new
ratio is `(U - ΔU) / (T - ΔT)`. Reaching target `r` requires
`ΔT - ΔU / r >= T - U / r` when remaining bytes are positive. Count added code
against removed code; neither net reduction follows from coverage alone.
Trace the complete dependency closure, then rebuild and recapture both values.

## Required upper-bound analysis

After the baseline and before proposing implementation work, report a concrete,
auditable ceiling in decimal KB (`1 KB = 1,000 bytes`). Do not answer only with
a list of opportunities. Produce these separate scenarios:

1. **Coverage mathematical ceiling.** If all currently unexecuted bytes vanished
   while `U` stayed fixed, the ratio would be 100%. Label this as a mathematical
   identity, never an engineering forecast.
2. **Owner-constrained ceiling.** Partition mapped bytes by `owner.kind` into
   application, third-party, and unknown/generated/runtime. Under an immutable
   third-party policy, initially count only application-owned unexecuted bytes:
   `R_owner = U / (T - A_unused)`. Report unknown bytes separately; if showing
   `U / (T - A_unused - X_unused)`, label it an audit ceiling pending ownership
   resolution.
3. **Confirmed-closure ceiling.** Add only complete, non-overlapping dependency
   closures that application code can move behind an approved route,
   visibility, or interaction boundary. For each closure record `ΔT`, `ΔU`,
   `Δunused = ΔT - ΔU`, shared retainers, user-visible timing change, and proof
   that its bytes are not already counted by another row. Calculate the combined
   scenario with `(U - sum(ΔU)) / (T - sum(ΔT))`.

Always show the unused-only byte gap for the requested target:
`G(r) = max(0, T - U / r)`. After applying an owner bucket or closure set, use
the signed target contribution `ΔT - ΔU / r`; a closure that removes heavily
executed code can reduce first-screen bytes while making the usage ratio worse.
Keep ratio ceiling and transfer/CPU benefit as separate conclusions.

The owner-constrained result is itself optimistic: a source's unexecuted
coverage ranges may share a module with required code and may not form a legal
dynamic-import or tree-shaking boundary. Therefore present both:

- the **owner ceiling**, assuming every application-owned unexecuted byte is
  perfectly separable; and
- the **engineering envelope**, based only on traced module/feature closures.

Do not count third-party internal unused ranges as removable merely because the
application imports the package. Third-party bytes enter a confirmed closure
only when the application can defer the entire imported component or feature
without modifying, patching, forking, aliasing to a rewrite, or build-time
rewriting that package. Source, package, module, and chunk rows overlap; choose
one byte partition and reconcile its sum to `T`. Assign unmapped residue once.

When a target exceeds the owner-constrained ceiling, state that directly and
quantify the remaining unused-only equivalent:
`G(r) - A_unused`. Name the additional product or architecture condition needed
to cross it, such as delaying a visible control, changing route/guard timing,
or obtaining a smaller upstream package. Do not imply that normal business
source cleanup can reach the target.

Work in descending observed unexecuted-byte order (`exclusivePotentialSavingsBytes`),
not implementation ease. Source/package rows overlap their chunk and cannot
enter the ledger. A
lower-ranked candidate can proceed only after every larger one has a traced
boundary and a measured rejection, completed decomposition into exclusive
children, or a concrete blocker with the missing evidence/dependency recorded.
Merely writing `tracing` or `decomposition-required` does not justify skipping it.

For a mixed main/shared chunk, create a decomposition item before small
cleanup. Find a real boundary: non-current route implementation, route
guard/store, feature telemetry or generated client, optional drawer/editor, or
application-owned broad import. Coverage ranges are never dynamic-import
boundaries. Account for children by generated file and non-overlapping mapped
ranges; reconcile total and executed bytes to the parent, with shared ownership
and unmapped residue explicitly assigned once or kept as separate rows. Package
names are attribution, not proof of a removable dependency closure. Replace
the parent with these exclusive children and rerank them by unexecuted bytes;
do not add parent, source and package totals together.

Trace all first-screen retainers of the chosen implementation, including
shared-package consumers and compatibility re-exports. Removing one unused
instance or import may save almost nothing when another eager path keeps the
same class. For elimination, verify constructor, argument and module side
effects before adding a purity annotation. A pure unused constructor can disappear
while its eager module import remains; inspect generated imports as well as the
instance before recording savings. For deferral, move application-owned
client/state/helper imports behind existing feature boundaries while retaining
shared transport and state identity; a required first-screen client cannot be
saved by loading it immediately before its first required request. Changes to
generated output, endpoint contracts or library internals need their own scope
decision, not an implicit expansion of an import-boundary fix.

For hidden UI, distinguish visibility from mounting: an async component still
loads immediately if it is mounted with `show=false`. Preserve the existing
first-open watchers, initialization promises, destroy-on-close versus keep-alive
behavior, permissions,
and exposure telemetry; test cold loading, retry after failure, and invalidated
intent after navigation or owner changes. A false-to-true watcher may require
hidden mounting and initialization to finish before opening. Do not defer a
visible trigger's required behavior together with its heavy editor. Prefer one
cohesive feature entry to many tiny child imports, and check whether enum-only
imports or UI barrels still retain the supposedly deferred implementation.

Check the rebuilt byte gate before full experience trials. If the proposed
closure remains in the initial graph, record the residual retaining paths and
reject or revise the candidate; do not claim its attributed size as savings or
repeat timing runs to find a favorable result. Candidates that pass this gate
still require runtime identity, later-path regression and A/B acceptance.

An accepted usage deferral must actually reduce matched first-screen bytes
without breaking the recorded first screen or deferred route/interaction.
Count new dependencies, duplicated helpers and loader overhead against the
removed bytes. A higher ratio caused by executing/loading more code, changing
the matching denominator, or postponing first-screen-required work past the
ready boundary is not progress. Compare matched
total/used/unused bytes, ratio, supported raw/gzip/brotli values, request
count, mapping scope, repeated ready samples, and the later business result.
A useful measured first-screen improvement can be retained while the usage
gap remains open; it cannot close the 70% gate by itself.

## Topology lane

Evaluate consolidation independently. Every member must be small relative to
the measured initial-JS budget, substantially executed before the same ready
point, owned by one route/entry, and have compatible cache lifetime. The merge
must not pull low-use code or another route into the initial graph.

Show current and proposed raw/gzip/brotli size, request count, combined usage
ratio, parent/entry relations, cache-owner evidence, and repeated ready
samples. Fewer requests under HTTP/2/3 are a hypothesis until A/B confirms the
net effect.

Recompute the whole initial asset set after each boundary change: a smaller
largest chunk may redistribute code into more initial requests. Match actual
loader call sites, not only chunk IDs or named groups, when proving common
consumption; record routes that need only a subset before proposing a merge.

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
ratio, target, byte gap, the three upper-bound scenarios, a mutually exclusive
remaining-unused-byte ledger, and next owner/action for every row. Show totals
and deltas in decimal KB and percentages, retaining exact bytes in the state
artifact. Keep usage-lane and topology-lane results in separate tables. Never
call `PAUSED` or `BLOCKED` complete.
