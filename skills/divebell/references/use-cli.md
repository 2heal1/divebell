# Use the Divebell CLI for One-Off Tasks

Read this file only after the root `SKILL.md` routes the task to **Use
capabilities**. Complete one information query, page interaction, or declared
action, then return to the user's original workflow.

Do not run the troubleshooting workflow. Do not modify application source,
add a Divebell integration, register a `business:*` target, or perform final
business verification for an ordinary query.

## Contents

- [Discover Current Capabilities](#1-discover-current-capabilities)
- [Determine the Minimum Required Context](#2-determine-the-minimum-required-context)
- [Run the Smallest Matching Command](#3-run-the-smallest-matching-command)
- [Return to the Primary Workflow](#4-return-to-the-primary-workflow)
- [Switch to Troubleshooting Only When Necessary](#5-switch-to-troubleshooting-only-when-necessary)
- [Routing Examples](#routing-examples)

## 1. Discover Current Capabilities

Start with the CLI help that is actually available in the current environment:

```bash
divebell --help
```

If the command is unavailable, ask the user to install Divebell globally:

```bash
npm install --global @divebell/cli
```

Do not add `@divebell/cli` to the application.
Top-level help discovers first-level commands. After finding a relevant command,
read its scoped help:

```bash
divebell <command> --help
```

Trust the actual help output:

- Use the top-level command description to decide whether it matches the task.
- Use the command's own usage and description to confirm arguments and ordering.
  Consult examples only when that help includes them.
- Discover commands injected by the current machine or project under
  `External Extensions`.
- Use an Extension command only when its description clearly matches the task.
  Do not infer behavior from a command name, file path, or memory.

When a command section reports `Skill: available for <command>`, first run:

```bash
divebell <command> --skill
```

Pass only the first-level command name, without subcommands or business
arguments. The command returns the absolute path to its `SKILL.md` without
executing business logic. Read that skill in full and follow it before invoking
the command; do not guess from the filename or an excerpt.

A command-provided skill governs only that command subtask. After the command
finishes, return here and continue the user's original workflow. Do not expand
it into a full Divebell investigation unless it provides page-failure
evidence that must be fixed.

When the user asks only what capabilities exist or how to use a command, answer
from help. Do not execute commands that change page, account, or business state
merely to explain a feature.

## 2. Determine the Minimum Required Context

Choose the smallest preparation step from help and command output:

- Run page-independent commands directly, such as help or listing imported
  authentication profiles.
- Page commands operate on the current page created by the latest
  `divebell open <url>`. Reuse the correct page when it already exists. If no
  page exists and the user supplied a target URL, run
  `divebell open <url>` first.
- When a required URL, account, option, or other input is missing, request only
  that missing input and do not broaden the task.
- `targets`, `snapshot`, `events`, `actions`, `input-options`, `run-action`,
  `wait-for`, and `verify` need a selectable connected runtime. For an ordinary
  query against a page without integration, do not change source without
  authorization. Report that Runtime evidence is unavailable, or switch to the
  integration workflow only when integration is already part of the user's
  goal.

Do not start Bridge manually unless help, an error, or the user's task
explicitly requires Bridge diagnosis. The CLI normally prepares Bridge
automatically.

## 3. Run the Smallest Matching Command

Start with one command that best matches the task. Do not run several similar
queries in parallel. Continue from structured output:

- `status=ok`: read the result and finish this subtask.
- `status=needs_input`: use the supplied options or prompt to provide the
  missing input, then continue the same command.
- `status=error`: use `code`, `message`, `hint`, and `retryable` to correct the
  input, authentication state, or page context first.

Retry safe input or context errors after applying the explicit correction. Do
not automatically treat a missing command, invalid argument, missing page,
login requirement, or empty result as an application failure.

Run read-only commands directly. Run commands that may change page, account, or
business state only when the user's request already includes that action.
Inspect the action's risk, enabled state, and input options first; do not widen
its scope.

## 4. Return to the Primary Workflow

After obtaining the query or action result:

1. Extract only what is useful to the user's original task.
2. Briefly record which Divebell capability was used, whether a
   command-provided skill applied, and whether the command succeeded.
3. Resume the user's original workflow immediately without entering diagnosis,
   source changes, or business verification.

Do not run `divebell stop` merely to clean up a temporary query; the primary
workflow may still reuse the page and Bridge. Stop only when the user asks to
end the session or the current task owns the complete browser lifecycle.

## 5. Switch to Troubleshooting Only When Necessary

Return to the root `SKILL.md` and read `references/troubleshoot.md` only when
one of these conditions applies:

- The user explicitly asks to find and fix the problem.
- A command provides page or Runtime failure evidence, and the user's final
  goal cannot be completed without fixing it.
- The user asks for business-level verification after the current failure is
  fixed.

After switching, begin with troubleshooting access and real-page preparation.
Reuse the correct authentication state and open context. Do not treat a
successful capability query as final verification.

## Routing Examples

- "Run the current project's memory check with Divebell, then continue
  fixing it": inspect help, read the command skill, invoke the matching
  Extension command, and extract its result. Switch to troubleshooting only if
  the result proves a failure and fixing it is part of the goal.
- "Which account commands does Divebell provide?": inspect help and explain
  the commands without importing, exporting, or clearing anything.
- "Read the actions declared by the current page": run the `actions` query. If
  no runtime is connected, report that the evidence is unavailable; do not add
  a Divebell integration without authorization.
- "A remote keeps failing to load. Use Divebell to find the cause and fix
  it": enter the troubleshooting workflow directly.
