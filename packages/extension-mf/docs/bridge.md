# Bridge lifecycle diagnostics

`openruntime mf bridge trace` explains the Bridge lifecycle evidence already exposed by the Module Federation Observability Plugin. It does not inspect Bridge internals, application props, router objects, or business state.

## Commands

```sh
openruntime mf bridge trace
openruntime mf bridge trace <remote-or-alias>
openruntime mf bridge trace <remote-or-alias> --mf <name>
openruntime mf bridge trace <remote-or-alias> --instance <instanceRef>
openruntime mf bridge trace <remote-or-alias> --instance <instanceRef> --bridge <bridgeId>
openruntime mf bridge trace <remote-or-alias> --instance <instanceRef> --operation <operationId>
openruntime mf bridge trace <remote-or-alias> --instance <instanceRef> --operation <operationId>
```

`--instance` always takes the session-scoped instanceRef shown by `openruntime mf status`. `--mf` matches the visible MF name. Duplicate names return candidates instead of selecting the first instance.

Without a remote or operation selector, the command returns an operation summary array. A remote selector can use its declared name or alias, but alias matching remains scoped to the owning MF instance. Several matching operations return candidates with instanceRef, bridgeId, operationId, side, operation, and a copyable command containing `--operation`.

## Correlation rules

The reusable analyzer groups Bridge evidence by instanceRef and operationId. Consumer and producer records with the same operationId can appear in one operation, while each side keeps its own timestamps, outcome, reason, error, and lifecycle evidence. Different operationId values are never merged because their remote or module names happen to match.

bridgeId identifies the Bridge instance. One bridgeId may therefore have several render, update, route-sync, and destroy operations.

When operationId is absent, only records in the same report, on the same side, with the same bridgeId, operation, and startedAt can share a fallback group. Records are never correlated across reports or sides without operationId. Such groups are marked `fallback`; records without even that identity remain `incomplete`.

## Evidence boundaries

The output keeps these facts separate:

| Fact | Required evidence |
| --- | --- |
| Operation called | `beforeBridgeOperation` |
| Producer execution observed | A producer-side Bridge lifecycle record |
| Render invocation observed | `bridgeRenderInvoked` |
| Operation returned | `afterBridgeOperation` or a public result with an outcome |
| Framework commit observed | `afterBridgeCommit` for that operation |
| Route sync observed | A route-sync lifecycle record |

A successful render return is not a commit. A commit is not proof that business data has loaded, the page is ready for a user, or the application is interactive. The command deliberately reports application readiness as not observed.

Route output is limited to the Observability Plugin's sanitized action, path, basename, and mechanism summary. The command does not reread query strings, hashes, tokens, props, or router objects. A route-sync signal alone does not prove that navigation completed.

## Capability and incomplete history

The command uses `state.capabilities.bridgeTrace` as the authority:

- `complete`: return the matching lifecycle operations normally.
- `partial`: return available operations and state, and warn that earlier lifecycle history may be missing.
- `unavailable`: return a structured unsupported result. This does not mean the page does not use Bridge.

Current Bridge state may still be available when historical tracing is unavailable. In that case, the command shows the current state and explicitly says that historical operations cannot be reconstructed. The capability reason is preserved as reported; the command does not guess a Bridge or runtime version requirement.

When observation started late, reopen the page with `openruntime open <url>`, reproduce the Bridge operation, and run the command again.
