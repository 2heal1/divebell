---
name: openruntime
description: >-
  Use, customize, evaluate, or troubleshoot OpenRuntime/@openruntime. OpenRuntime
  is an extensible web development and debugging tool for Coding Agents. Use
  openruntime/opr to reuse authenticated browser profiles and sessions, interact
  with pages, inspect Console, Network, performance, memory, code execution, and
  Runtime evidence, invoke Extension commands, verify changes, and develop
  Extensions, automation scripts, or Runtime Core integrations. Use when a task
  explicitly mentions OpenRuntime, asks to use its CLI or Extensions, or needs
  OpenRuntime evidence for a real web development debugging workflow.
---

# OpenRuntime

Use OpenRuntime to help Coding Agents reproduce, diagnose, and verify issues in
real, authorized, and repeatable web scenarios. Let the Coding Agent change the
code; use OpenRuntime to prepare and reuse browser context, provide debugging
capabilities, and preserve verification evidence.

First decide whether the user wants to use capabilities, troubleshoot and fix
an issue, or customize capabilities. Then read only the corresponding workflow.
Do not preload every reference merely because a task involves OpenRuntime. Do
not require an ordinary page to integrate Runtime Core before using OpenRuntime.

## Choose a workflow

### Try the official Quick Start

Read `references/quickstart.md` when the user asks to try, demo, evaluate, or
quickly understand OpenRuntime and has not supplied another target page. Use the
public playground; do not clone this repository or ask for application source.
Complete the browser, Runtime Core, and recovery stages before offering the
optional code-usage or memory stage.

### Use capabilities

Read `references/use-cli.md` when the task involves any of the following:

- Explain OpenRuntime capabilities, commands, or options.
- Inspect or prepare authentication state, a test account, or the current
  browser session.
- Invoke a built-in or Extension command for a query, page interaction, or
  specialized check.
- Read the current page, Console, Network, runtime, target, snapshot, event, or
  action.
- Run a page action or wait without diagnosing and fixing a failure.

When an ordinary command fails, first correct its input, authentication state,
or page context from the structured error. Switch to troubleshooting only when
the user asks for a fix or the original task cannot continue without one.

### Troubleshoot and fix

Read `references/troubleshoot.md` when the user asks to use OpenRuntime to
diagnose, fix, or verify a web page issue. Reuse existing authentication state
and page sessions where possible. Start with browser evidence or an Extension
that matches the issue, then use structured state when the page already
provides relevant Runtime information.

Continue diagnosing an ordinary page when no runtime is connected. Add Runtime
Core, a framework plugin, or a business signal only when browser-visible
evidence is not reliable enough, the user explicitly requests integration, or
the capability is worth reusing.

### Customize capabilities

Read `references/integrate.md` when the task involves any of the following:

- Develop or modify an OpenRuntime Extension, including test-account setup,
  environment preparation, specialized diagnostics, or verification commands.
- Write an automation script that owns a complete browser workflow.
- Integrate Runtime Core, the Modern plugin, MF observability, or Garfish into a
  project.
- Register or design targets, snapshots, events, actions, `waitFor` conditions,
  or durable business verification signals.

Do not enter the troubleshooting workflow when there is no actual failure.
Implement only the requested customization; do not redesign the entire
application as a side effect.

## Handle multi-intent tasks

- Keep the user's final goal as the primary workflow. When an OpenRuntime query
  is only one step, return to the primary workflow immediately afterward.
- Switch explicitly to troubleshooting when a capability query reveals a real
  failure and fixing it is part of the user's goal.
- Reuse an existing Profile when authentication is missing during diagnosis, or
  request only the minimum necessary input. Do not make the user log in
  repeatedly.
- Continue with browser evidence or an Extension when Runtime information is
  unavailable. Switch to integration only when application-internal facts are
  genuinely required.
- When the user requests both integration and diagnosis, prioritize the real
  failure. Integrate only what is needed for current evidence or durable reuse.

## Common rules

- Use the globally installed `openruntime` or `opr` command. Do not add
  `@openruntime/cli` to the user's application. If the command is unavailable,
  ask the user to install it with
  `npm install --global @openruntime/cli` before continuing.
- To confirm current commands or Extension commands, first run the available
  `openruntime --help` or `opr --help`. Run
  `openruntime <command> --help` for command-specific options and details.
  Trust actual help output instead of guessing from stale documentation.
- Find Extension commands under `Extensions` or `External Extensions` in help.
  Use one only when its description clearly matches the task.
- If help reports that a command has a skill, run
  `openruntime <command> --skill`, read the returned file in full, and follow it
  before invoking the command. That command skill governs only its subtask.
- For protected pages, inspect the current open context and available
  agent-browser Profile or state first. Reuse the correct account, page, and
  session. When authorization is missing, request only the minimum access
  needed for the task.
- Prefer structured state and declared actions when the page already exposes a
  relevant target or action. Without Runtime information, use page results,
  Console, Network, screenshots, and specialized Extensions normally. Do not
  modify an application merely to manufacture evidence.
- Verify changes with the same account, environment, and user path as the
  original issue. Choose the most reliable available evidence for the task; do
  not force every task to use a business target or one fixed verify command.
- Use Bridge connections, target registration, snapshot updates, and events
  only to expose facts. Do not change APIs, routes, business state, or rendering
  branches through observability wiring.
- Reuse the original authentication state, session, and page context after a
  change. Stop the browser only when the full workflow is complete or the task
  owns the browser lifecycle.
- Store and use authentication state and debugging artifacts only in trusted
  environments because they may contain sensitive information.

## Load references on demand

- Official hosted playground and first-use walkthrough:
  `references/quickstart.md`
- CLI queries, accounts, page interactions, and Extension commands:
  `references/use-cli.md`
- Diagnosis, fixes, and post-change verification:
  `references/troubleshoot.md`
- Extensions, automation scripts, and Runtime integration:
  `references/integrate.md`
- Page-side `@openruntime/core` API: `references/core.md`
- Modern.js integration, routes, and loaders: `references/modernjs.md`
- Module Federation observability, remotes, and shared dependencies:
  `references/module-federation.md`
- Garfish sub-application lifecycle and custom loaders:
  `references/garfish.md`
