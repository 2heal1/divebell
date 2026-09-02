# Bridge result fields

## Selection

Without a Remote or operation selector, `bridge trace` returns an operation
summary. Several matching operations produce `candidates`; several same-name
instances can produce `instanceCandidates`. Run one returned copyable command
before interpreting a detailed lifecycle.

`operationId` identifies one render, update, destroy, or route-sync operation.
`bridgeId` identifies the Bridge instance and can appear in many operations.

## Operation fields

- `instance`: owning MF instance.
- `operationId`, `bridgeId`, `bridgeIds`: operation and Bridge identities.
- `operations`: observed render, update, destroy, or route-sync kinds.
- `frameworks`: observed React or Vue Bridge implementations.
- `moduleName`, `remote`, `expose`: module context.
- `startedAt`, `endedAt`, `duration`: captured timing.
- `outcome`: `success`, `error`, `skipped`, `mixed`, or `pending`.
- `association`: how evidence was joined.
- `producerObserved`: producer-side evidence exists.
- `called`: a before-operation signal exists.
- `returned`: an after-operation or public result exists.
- `commitObserved`: framework commit signal exists for this operation.
- `routeSyncObserved`: route-sync lifecycle evidence exists.
- `applicationReadiness`: always `not-observed`; Bridge evidence does not prove
  business readiness.
- `sides`: consumer and producer evidence kept separately.

Association meanings:

- `operation-id`: evidence was joined by the exact operation id.
- `fallback`: operation id was absent and only tightly scoped evidence from the
  same report and side could be joined.
- `incomplete`: there was not enough identity to build a full association.

## Side and evidence fields

Each side keeps its own framework, operation, Bridge id, timing, outcome,
reason, error, lifecycle booleans, and `evidence` array. Consumer success does
not imply that producer execution was observed.

Lifecycle signal meanings:

- `called`: the operation hook was entered.
- `render-invoked`: a producer render invocation was observed.
- `returned`: the operation returned.
- `commit`: a framework commit was observed.
- `observed`: another Bridge lifecycle fact was captured.

A successful render return is not a framework commit. A commit is not proof
that data loaded, navigation completed, the page is interactive, or the user
workflow is ready. Route-sync evidence describes a sanitized route action only;
it does not prove navigation completion.

Some MF runtimes do not expose `afterBridgeCommit`. Divebell normalizes a
missing raw `commitObserved` state field to `false`; interpret it only as "no
commit signal observed", not as evidence that the framework failed to commit.

## Current states

`currentStates` is current Bridge state, separate from historical operations.
`summaryOnly` means the reader has only aggregate state. Other fields can
include the last operation, current status, and whether any commit or route-sync
signal was observed. Do not reconstruct missing history from current state.
