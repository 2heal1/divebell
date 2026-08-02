# Common result fields

## Command identity

Examples in raw output may say `mf`, but an Extension can expose the same
analyzer under another top-level command. Use the CLI and command that returned
the Skill. Candidate `command` values in presented output are already rewritten
for that command and are safer than rebuilding selectors manually.

## Selection

Read `selection` before interpreting returned records.

- `list` or `summary`: no single target was requested; the records are an
  inventory, not one combined chain.
- `detail` or `operation`: exactly one record matched and can be interpreted as
  one chain.
- `ambiguous` or `candidates`: several exact records matched. Select one using
  a returned candidate command.
- `not-found`: no captured record matched all supplied selectors. This is not
  proof that the operation never occurred.
- `unsupported`: the current reader cannot provide the requested evidence.

`matchCount` counts matching records or operations. It is not a package-name
similarity score.

## Candidate lists

A top-level `candidates` or `instanceCandidates` array resolves command
ambiguity. Each entry identifies a possible instance, trace, or operation and
may include a copyable `command`. Do not merge these entries or treat them as
runtime provider choices.

Some detailed operations also have their own `candidates` field. That inner
field describes runtime alternatives considered inside the selected operation.
The command-level and operation-level lists answer different questions.

## Identifiers

- `instanceRef`: exact page-session identity for one MF instance. Prefer it over
  a duplicated visible name.
- `traceId`: identity of one captured report or request trace.
- `operationId`: identity of one logical Shared or Bridge operation.
- `requestId`: supporting request correlation. It is not interchangeable with
  an operation or trace id.
- `bridgeId`: identity of one Bridge instance; it can have many operations.

Identifiers are scoped to the observed page session. Do not compare them across
page reopenings as stable business identifiers.

## Time and outcome

`startedAt` and `updatedAt` or `endedAt` locate the observation in time.
`duration` is milliseconds. A missing end time usually means pending or partial
evidence, not zero duration.

Keep these result states distinct:

- `success`: the observed operation completed successfully.
- `error`: it completed with an error.
- `recovered`: an earlier failure occurred, but the operation recovered.
- `pending`: no final completion was observed yet.
- `unknown`: current evidence cannot establish the result.
- `unavailable`: the reader cannot provide this evidence.

## Completeness and warnings

- `complete`: the reader and captured history cover the requested evidence.
- `partial`: return available facts, but earlier or later stages may be absent.
- `unavailable`: do not interpret an empty result as success or absence.

Always preserve `warnings` in the diagnosis and execute applicable
`recommendedActions`. A late-injection or partial-history warning usually
requires reopening with `--mf` and reproducing the exact user path.

## Evidence limits

The Extension reads sanitized public runtime state and reports. It does not scan
source configuration, lockfiles, response bodies, cookies, factories, or
business state. Use source and browser evidence separately when the runtime
result alone cannot answer ownership or application-readiness questions.
