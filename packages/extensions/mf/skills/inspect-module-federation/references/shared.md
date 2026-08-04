# Shared result fields

## Choose status or trace

- `shared status [package]` answers what is in the current global Shared
  registry.
- `shared trace [package]` answers which registration, selection, and loading
  operations were captured over time.

Package, scope, version, operation, trace, MF name, and instance filters use
exact equality. They are not regular expressions, prefix searches, or fuzzy
matches. `react` does not match `react-dom`; `react$` searches for a package
literally named `react$`.

## `shared status`

The `shared` object is grouped as:

```text
scope -> package -> version -> entry
```

Entry fields:

- `from`: provider that registered the version.
- `useIn`: consumers currently recorded as using it.
- `loaded`: whether a usable Shared value is loaded.
- `loading`: a transitional load is in progress. It is omitted after `loaded`
  becomes true.
- `scope`: scopes recorded on the entry.
- `deps`: declared dependencies.
- `eager`, `strategy`: loading mode and version-selection strategy.
- `shareConfig.requiredVersion`: required range, or `false` when no range is
  enforced.
- `shareConfig.singleton`: one effective version should be shared in the scope.
- `shareConfig.strictVersion`: reject an incompatible version instead of using
  it.
- `shareConfig.eager`, `shareConfig.layer`: remaining share configuration.
- `lib`, `get`: bounded function source and generated/original location, shown
  only with `--verbose` when available.

Default output includes loaded versions only. `--verbose` also includes
unloaded versions. An empty default result can therefore mean the package is
registered but not loaded; retry with `--verbose` before claiming absence.

Treat this status as registry inventory. Multiple registered or unloaded
versions, singleton declarations, and different required ranges do not by
themselves prove a conflict, fallback, compatibility problem, or performance
problem. Diagnose a Shared problem from one selected `shared trace` that shows
the selected provider and final result together with a rejection, failure,
fallback, recovery, or other concrete outcome. In a performance diagnosis,
follow Shared only when `module-perf` identifies `get` or Shared resolution as
the relevant path and the selected Shared operation matches the same trace,
instance, Remote, or expose context.

## `shared trace` result

Top-level fields:

- `filters`: exact selectors applied by the command.
- `selection.kind` and `selection.matchCount`: whether zero, one, or several
  operations matched.
- `operations`: matching registration or load chains.
- top-level `candidates`: choices for selecting one operation when selection is
  ambiguous.
- `warnings`, `recommendedActions`: limitations and recovery steps.

`ambiguous` means several operations for the exact package matched. A page can
legitimately register the same package many times and later load it, so one
package often has many operations. It does not mean fuzzy matching and does not
by itself mean a Shared conflict. Run one returned candidate `command`, usually
with `--operation`, before interpreting a complete chain.

## Operation identity and context

- `instanceRef`, `mfName`, `package`, `scopes`: owning instance and Shared key.
- `operationId`: strongest identity for one registration or load operation.
- `traceIds`: reports contributing evidence to the operation.
- `requestIds`: supporting request correlations.
- `startedAt`, `updatedAt`: captured time range.
- `trigger`: observed source such as runtime, build, or another lifecycle path.
- `remote`, `expose`: Remote request context when the Shared load occurred while
  loading an expose.

The grouper correlates by exact operation id first, then trace id, then request
id when stronger identifiers are absent. Package name alone never joins two
operations. The same operation id in different instances remains separate.

## Version request and result

- `requiredVersion`: requested compatible range. `false` means no range
  requirement.
- `requestedVersion`: concrete requested or candidate version when reported.
- `availableVersions`: versions observed in the relevant scope.
- `selectedVersion`: version actually selected; absence means no selection was
  observed.
- `provider`: provider of the selected version.
- `selectionReason`: runtime reason for choosing it.
- `failureReason`: reason selection or loading failed.
- `singleton`, `strictVersion`, `eager`, `strategy`: request-side selection
  settings when reported.
- `fallback`: an alternative path was used.
- `recovered`: the operation recovered after an earlier failure.
- `finalResult.status`, `outcome`, `reason`: final report result.
- `finalResult.errorCode`, `errorName`, `errorMessage`: sanitized failure facts.

Read `finalResult` first, then check `selectedVersion` and `provider`, then
compare the inner candidates and their rejection reasons.

## Two different candidate lists

The name `candidates` appears at two levels:

1. Top-level `candidates` are matching operation choices created because the
   command was ambiguous. They identify `instanceRef`, package, scope,
   `operationId`, `traceId`, and a copyable selection command.
2. `operations[].candidates` are Shared versions/providers considered by the
   runtime inside one selected load operation.

Do not compare the top-level list as though it were version selection. Do not
use an inner provider candidate to select a CLI operation.

Inner candidate fields:

- `scope`, `version`, `provider`: candidate identity.
- `loaded`, `loading`: current load state when evaluated.
- `singleton`, `eager`, `strategy`: candidate configuration.
- `compatible`: whether compatibility was established. Missing means unknown,
  not false.
- `rejectionReason`: why it was not selected, for example version mismatch,
  an existing singleton, custom resolver choice, not loaded, or lower priority.

## Registrations

`registrations` contains observed registration decisions only. It is not a list
of every Shared load. A load operation normally describes its work through
inner `candidates`, `selectedVersion`, `provider`, reasons, and `finalResult`
while `registrations` remains empty.

A registration can originate from runtime registration lifecycle paths,
including container share-scope initialization. It does not prove that
application code directly called the public `registerShared` API.

Registration fields:

- `registrationId`: identity of the registration decision.
- `action`: what happened to the candidate.
- `reason`: runtime reason; preserve this exact value in the diagnosis.
- `trigger`: lifecycle path that initiated the registration.
- `scope`: affected share scope.
- `candidate`: the attempted registration.
- `effective`: the entry that remained effective when different from the
  candidate.

Action meanings:

- `registered`: the candidate became a new effective entry.
- `replaced`: the candidate replaced an existing effective entry.
- `reused`: an existing equivalent entry was reused.
- `ignored`: the candidate did not become effective; inspect `reason` and
  `effective` to see why and which entry was kept.

Several `ignored` registrations can be normal when multiple containers offer
the same singleton after an already loaded entry has been preserved. Count
them as registration attempts, not repeated loads and not automatic proof of a
bug.
