---
name: inspect-module-federation
description: Inspect and explain Module Federation runtime evidence returned by the Divebell MF Extension or a custom command alias. Use when an Agent needs to diagnose MF instances, remotes, shared dependencies, Bridge lifecycle, loading history, ambiguous selections, registrations, candidates, version choice, fallbacks, or incomplete observations from status, module-info, remote trace, shared trace, or bridge trace output.
---

# Inspect Module Federation

Use the command that returned this Skill as the authority for the installed
Extension. It may be `divebell mf` or a custom alias. Keep that CLI and
top-level command unchanged throughout the task.

## Establish the command and page

1. Run `<cli> <mf-command> --help` and use only commands listed there.
2. Open or reopen the target page through the same CLI before reproducing the
   problem. Enable MF collection with `--mf`, for example:

   ```text
   <cli> open <url> --mf
   ```

   The default external command is `divebell open <url> --mf`.

3. Reuse the required account, environment, and user path. Never bypass an
   authorization boundary.
4. Do not install the CLI or Extension into the application project. These
   commands inspect evidence already collected from the page.

If a command reports late injection, partial history, or no page context,
reopen the page with `--mf`, reproduce the operation, and retry before drawing
conclusions.

## Choose the smallest useful command

- Use `status` to list current MF instances and loaded Shared entries.
- Use `module-info [remote]` for the current declaration and resolved metadata
  of one Remote.
- Use `remote status <remote>` for a compact current Remote result.
- Use `remote trace [remote/expose]` for a Remote load or preload timeline.
- Use `shared status [package]` for the current Shared registry.
- Use `shared trace [package]` for registration, version selection, and loading
  history.
- Use `bridge trace [remote]` for render, update, destroy, route-sync, and commit
  evidence.

Start broad only when the target is unknown. Once the output supplies a
copyable candidate command, run that exact command instead of comparing several
chains by eye.

## Read every result in this order

1. Read `warnings`, `recommendedActions`, capability, and completeness first.
2. Read `selection` before any operation. `ambiguous` means several exact
   records matched; it does not mean fuzzy package-name matching.
3. If candidates are returned, run one candidate's copyable `command` to select
   a single instance, trace, or operation.
4. For one trace, read the final result first, then work backward through the
   selected provider or lifecycle stages to the rejected alternatives and
   trigger.
5. Keep current state separate from captured history. A missing historical
   event is not proof that the operation never happened.
6. State what the evidence proves, what it does not prove, and the exact command
   used to select it.

## Load the relevant field reference

- For selection, warnings, identifiers, timestamps, and evidence limits, read
  [common fields](references/common.md).
- For `status` and `module-info`, read
  [current state and module information](references/state.md).
- For `shared status` or `shared trace`, especially `registrations`,
  `candidates`, `ambiguous`, or version choice, read
  [Shared fields](references/shared.md).
- For `remote status`, ordinary load trace, or preload trace, read
  [Remote fields](references/remote.md).
- For `bridge trace`, read [Bridge fields](references/bridge.md).

Read only the references needed for the output in front of you.
