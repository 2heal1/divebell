---
name: divebell-runtime
description: >-
  Add, modify, review, or verify application-side Divebell Runtime SDK
  integration with @divebell/core. Use when the task involves creating or
  reusing a Runtime, registering Targets or Actions, updating Snapshots,
  exposing application-internal facts, or designing waitable business state.
  Do not use merely to consume an existing Runtime from a CLI Extension.
---

# Divebell Runtime SDK Integration

Use this Skill to integrate `@divebell/core` into an application correctly.

## References

Before adding or changing Runtime SDK integration, read
`references/integration.md` in full.

Read the relevant section of `references/api.md` when exact fields, types, or
return values are needed.

## Workflow

1. Inspect the application for an existing Runtime, framework plugin, or nearby
   integration before creating anything.
2. Confirm that the required fact cannot be represented reliably through the
   page, Console, Network, or an existing Extension.
3. Reuse the existing Runtime, or install and initialize one shared Runtime.
4. Model only the required Targets, Snapshots, and optional Actions.
5. Connect updates to the real application lifecycle without changing business
   behavior.
6. Verify the Runtime through Divebell CLI on the same page and business path.

## Rules

- Runtime SDK is optional. Do not add it only to demonstrate Divebell usage.
- Reuse an existing Runtime; do not create competing instances from multiple
  application entry points.
- Model one stable capability or result per Target.
- Keep Target IDs stable, unique, and readable.
- A Snapshot contains the current fact, not a complete DOM, API response, or
  business object.
- Put structured failures in `error`; use `dependsOn` only for current blockers.
- Events describe history; they do not replace the current Snapshot.
- Actions must be explicit, small, deterministic, and assigned an appropriate
  risk.
- Successful Action execution does not prove the expected business result.
  Verify the corresponding Target state with Snapshot or `waitFor`.
- Do not expose secrets or unrelated internal data.
- Do not change APIs, routes, business state, or rendering branches merely to
  make observability easier.

## Extension boundary

A Divebell Extension may consume an existing Runtime through
`options.divebell`.

Developing that Extension belongs to the `divebell-extension` Skill. This Skill
owns only the application-side Runtime contract and integration.

## Completion

Report:

- Which Runtime initialization, Targets, Snapshots, or Actions changed.
- Why each exposed fact requires Runtime SDK.
- How the connected Runtime and resulting state were verified.
- Any checks that could not be completed.
