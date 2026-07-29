# Customize and Integrate Divebell

Read this file only after the root `SKILL.md` routes the task to **Customize
capabilities**. Make the new capability discoverable, queryable, or executable
through the CLI, and verify it with checks that match the change.

When there is no failure to fix, do not run the troubleshooting state machine
or require proof that an unrelated problem was fixed.

## Contents

- [Identify the Customization Type](#1-identify-the-customization-type)
- [Integrate a Project](#2-integrate-a-project)
- [Design Targets, Snapshots, and Events](#3-design-targets-snapshots-and-events)
- [Design Actions](#4-design-actions)
- [Develop a CLI Extension](#5-develop-a-cli-extension)
- [Write an Automation Script](#6-write-an-automation-script)
- [Verify Completion](#7-verify-completion)

## 1. Identify the Customization Type

Determine which capability the user wants:

- **Extension**: add test-account selection, environment preparation, stack
  detection, specialized diagnosis, a verification command, or a command skill.
- **Automation script**: let the script open, wait for, interact with, and query
  pages, then stop the browser and Bridge only when appropriate.
- **Project integration**: connect a page runtime to Bridge and expose stable
  application-internal facts.
- **Business capability**: add a target, snapshot, event, action, or durable
  waitable business state.

Implement only the requested type. Prefer an Extension when the capability can
live outside the page and is worth reusing. Integrate a project or business
signal only when application-internal facts are required. Do not redesign an
application's Runtime integration as a side effect of adding one external
command.

## 2. Integrate a Project

Inspect existing Divebell initialization, framework configuration,
dependencies, and nearby code first. Do not create a duplicate runtime or
install competing integration paths.

For page-side internal facts, use `@divebell/core` and read `runtime-sdk.md`.
Use browser evidence or an installed Extension when page-side integration is
not necessary.

Do not infer or install optional integrations from framework dependencies.
Discover installed Extension commands through `divebell --help` and follow
their command skill when one is available. When the user explicitly selects a
separately distributed page-side package, follow that package's own
documentation after confirming it is installed or in scope.

Connect through source or a supported plugin only. Do not use browser `eval` to
create a temporary Bridge connection and claim the project is integrated.

## 3. Design Targets, Snapshots, and Events

Read `runtime-sdk.md` and preserve these boundaries:

- Use a target to answer "what can be referenced or waited for on this page?"
- Use a snapshot to answer "what is its current state?"
- Use an event to answer "how did state and actions change?"
- Let each integration declare the target's `type` and `statuses`; do not assume
  Runtime SDK provides a fixed set.
- Register a target before updating its snapshot, and record only the data
  needed to prove the current fact.
- Put `dependsOn` in the snapshot to describe current dependencies or blockers.
- Do not infer facts from the DOM, Console, or Network and present them as
  business state declared by the page.

Add a `business:*` target only when the goal needs a stable business
verification signal. Runtime integration, command development, and feature
explanation do not need a fake business target to satisfy troubleshooting
rules.

## 4. Design Actions

Read the action sections in `runtime-sdk.md`:

- Declare only stable actions that the page permits an Agent to execute.
- Define risk, enabled state, and input constraints clearly.
- Let `runAction` execute the action and record action events only. Do not make
  it update snapshots automatically.
- Verify action results through a target and `waitFor`; do not treat the action
  return value as final state.

## 5. Develop a CLI Extension

A page command operates only on the current page created by the latest
`divebell open <url>`. It must not open, navigate, close, or replace the
browser session, and it must not select Bridge or Runtime itself.

An Extension may provide test-account selection, environment preparation,
stack detection, performance, memory, code-usage analysis, and team-specific
verification workflows. Agents invoke these capabilities through CLI commands;
Extension implementations use the Extension API through
`options.divebell`.

When the repository contains CLI Extension development documentation, prefer
`docs/cli-extensions.md` or its localized equivalent. Implement the following:

- Declare commands, hooks, and skills in the Extension entry point. Load command
  implementations on demand with `await import()`.
- Provide accurate command descriptions and examples so
  `divebell --help` exposes real usage.
- Validate that the current page exists, its URL is supported, and required
  input is complete.
- Use consistent output for success, missing input, and expected errors. Keep
  progress text out of data-command output.
- Reuse stable, relevant targets and actions already exposed by the page.
  Without Runtime information, use the browser API normally; do not require an
  application integration before reading a page.
- Load only trusted external Extensions.

When a complex command needs dedicated multi-step instructions, domain
knowledge, or reference material, give it at most one local `SKILL.md`:

- Distribute the command, `SKILL.md`, and referenced resources in the same
  command directory.
- Point the command definition's `skill.path` to the existing `SKILL.md` by
  absolute path.
- Ensure `divebell --help` reports that the command has a skill.
- Ensure `divebell <command> --skill` prints only the path and does not
  execute business logic.
- Reserve `--skill` for skill discovery; do not reuse it as a business option.
- Keep a command skill focused on that command. Do not copy the complete
  Divebell troubleshooting workflow into it.

The default external Extension directory is `~/.divebell/extensions`. During
in-repository development and testing, point `DIVEBELL_EXTENSIONS_DIR` to a
version-controlled temporary directory instead of overwriting a user's existing
Extensions.

## 6. Write an Automation Script

Write an independent automation script only when the workflow must own the
complete browser lifecycle. Prefer a page command when the task operates on an
already-open page.

When the repository contains automation documentation, read
`docs/cli-automation-scripts.md` or its localized equivalent. Structure the
workflow as follows:

1. Accept inputs such as URL, session, and timeout.
2. Open the page and wait until it is operable.
3. Perform page interactions or declared actions.
4. Verify the result with a matching Extension, Runtime state, or explicit page
   result.
5. Output one stable result object.
6. Stop only when the script owns this browser lifecycle.

## 7. Verify Completion

Run checks that match the change:

- **Runtime SDK integration**: run typecheck/build, start the application, run
  `divebell open`, confirm that a runtime is connected, and read at least one
  target or snapshot provided by the new integration.
- **Target or action**: query the new definition and state. Run actions with
  representative input and verify the result through a target and `waitFor`.
- **Page command**: run definition validation and related tests, then load the
  command through `DIVEBELL_EXTENSIONS_DIR`. Confirm that help discovers it,
  and run one successful path plus one invalid-input or unsupported-page path.
  When the command declares a skill, also confirm that `--skill` returns the
  correct absolute path without executing business logic.
- **Automation script**: run the complete workflow with a real or
  representative URL, then inspect the exit code and final output.

Return to the root `SKILL.md` and switch to
`references/troubleshoot.md` only when validation reveals a real failure and the
user's goal includes fixing it.
