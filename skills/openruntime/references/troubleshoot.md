# Troubleshoot and Fix with OpenRuntime

Read this file only after the root `SKILL.md` routes the task to **Troubleshoot
and fix**. Gather evidence, change source, and verify the result with the same
account, environment, and user path as the real issue while minimizing manual
login, authorization, and handoff.

OpenRuntime does not require a page to integrate Runtime Core first. Browser
capabilities and Extensions are the normal path. Use Runtime information as an
additional source only when the page already exposes relevant state.

## Contents

- [Workflow](#1-workflow)
- [PREPARE_ACCESS](#2-prepare_access)
- [OPEN_PAGE](#3-open_page)
- [DISCOVER](#4-discover)
- [OBSERVE](#5-observe)
- [PATCH](#6-patch)
- [VERIFY](#7-verify)
- [BLOCKED Boundary](#8-blocked-boundary)
- [References](#9-references)

## 1. Workflow

```text
PREPARE_ACCESS
      ↓
OPEN_PAGE
      ↓
DISCOVER
      ↓
OBSERVE
      ↓
PATCH
      ↓
VERIFY
      └── failure ──> OBSERVE
```

Base every step on actual command output, page results, diagnostic artifacts,
or test results. Do not replace verification with "it should be fixed." Stop
collecting duplicate evidence once the result is sufficient.

## 2. PREPARE_ACCESS

Confirm the target URL, environment, and login requirement. For a protected
page, inspect the current session and available Chrome Profiles first:

```bash
pnpm exec openruntime profiles
```

Reuse an existing login state for the target site and confirm that the account
and permissions match the task. When no suitable state exists:

- Load a user-provided agent-browser state with `open --state`.
- Reuse a local Chrome Profile with `open --profile` when the user allows it.
- When an installed Extension explicitly provides a test-account or environment
  preparation command, read help and its command skill before running it.
- Otherwise request only the minimum authorization or account input required
  for this task. Do not widen access.

Use test accounts and login state only within their authorized environments.
Never output cookies, tokens, or complete sensitive configuration.

## 3. OPEN_PAGE

After starting the target application, open the real problem page with a stable
session:

```bash
pnpm exec openruntime open <app-url> --session <debug-session>
```

Add `--ui` only when a visible page is needed. The CLI normally prepares the
local Bridge automatically, so do not run `start` first without a specific
reason.

Reuse the current open context for later commands. Do not stop after a single
query. Do not use browser `eval` to mutate the page into a temporary Runtime
connection. A page without a connected runtime still supports browser
diagnosis.

## 4. DISCOVER

Discover capabilities from the current installation:

```bash
pnpm exec openruntime --help
pnpm exec openruntime extensions list
pnpm exec openruntime stack
```

Find Extension commands under `Extensions` or `External Extensions`. If a
command has a skill, run `openruntime <command> --skill`, read it completely,
and follow it before invoking the command.

Select only capabilities that directly match the issue:

- Login or environment issues: agent-browser Profile/state/auth or an account
  or environment Extension.
- Page interactions, errors, or requests: `page-snapshot`, `console`, `network`,
  `eval`, or `wait-eval`.
- Memory, performance, code-usage, or framework-specific issues: the matching
  Extension.
- Relevant internal state already exposed by the page: `snapshot`, `events`,
  `actions`, and `wait-for`.

Do not run every diagnostic in parallel for completeness. Do not add a source
integration merely because the project has OpenRuntime installed.

## 5. OBSERVE

Reproduce the user's actual path first, then collect the minimum evidence that
answers the problem.

### Ordinary Pages

When the page has no Runtime Core integration, use browser capabilities and
Extensions directly:

```bash
pnpm exec openruntime page-snapshot
pnpm exec openruntime console --level error
pnpm exec openruntime network --url <relevant-query>
pnpm exec openruntime screenshot debug-state
```

Choose commands based on the issue; do not require every command. Prefer a
specialized Extension for performance, memory, and code-execution issues so it
can own collection, repeated scenarios, reports, and cleanup.

### Existing Runtime Information

When the page is connected and its targets are relevant, start with one full
snapshot:

```bash
pnpm exec openruntime snapshot --session <debug-session>
```

- When the snapshot identifies route, loader, remote, shared, sub-application,
  or business state, inspect the corresponding source, configuration, and
  dependencies.
- When the snapshot has no relevant clue, return to browser capabilities or an
  Extension immediately. Do not keep trying arbitrary filters.
- Add `--id` or `--query` only to narrow a clue that already appeared.

Read events when the state-change history matters. Before executing a declared
page action, inspect its action definition, risk, and input options.

### Add Runtime Core Only When Justified

Do not add an integration for a one-off investigation by default. Read
`integrate.md` and `core.md` and add a durable signal only when one of these
conditions applies:

- Browser-visible evidence cannot reliably determine the real business state or
  blocking cause.
- The user explicitly requests OpenRuntime integration or a long-term
  verification signal.
- Multiple Agents, scripts, or CI jobs will reuse the same result.
- The page needs to declare allowed actions, inputs, and risk boundaries.

New signals must expose facts without changing business behavior. Return here
after integration to continue the fix and verification.

## 6. PATCH

Change source based on OBSERVE evidence. The change should directly explain the
failure; adding OpenRuntime integration is not itself the fix.

Restart the target application after changing build configuration, dependency
resolution, routes, shared dependencies, remotes, the development server, or
page initialization. Reuse the existing process for ordinary page code only
when the development server correctly applied hot updates.

Preserve the original authentication state and session. Reopen or refresh the
real problem page, then continue to VERIFY.

## 7. VERIFY

Use the same account, environment, entry point, and user path as the original
issue. Choose the most reliable available evidence for the task:

1. A specialized Extension check that matches the issue, such as a memory
   trend, code-usage report, performance check, or framework diagnosis.
2. Runtime targets, snapshots, and `waitFor` conditions already provided by the
   page.
3. Explicit page, request, and interaction results, plus confirmation that
   relevant errors disappeared.
4. Screenshots for visual confirmation or records, not as sole proof of complex
   state or interaction results.

When the page already has a business target suited to the goal, use `wait-for`
or an Extension-provided `verify`. When it has no business target, do not add
one solely to satisfy this workflow. Verify with a repeatable page or Extension
result that directly matches the issue.

For memory, performance, or code-usage fixes, rerun the same diagnostic scenario
and compare the relevant metric or report. A page opening successfully is not
enough.

If verification fails without enough evidence, preserve the session and return
to OBSERVE. After verification succeeds, stop duplicate evidence collection and
summarize the actual account scope, cause, change, and verification evidence.

## 8. BLOCKED Boundary

Report that work cannot continue only when:

- The target application cannot start or stay running, and safe local
  investigation is exhausted.
- A protected page lacks required authorization, no available Profile or
  Extension can provide it, and the user or system must grant access.
- The user forbids a required source change, or the source is not writable.
- Verification requires an external environment or data that is inaccessible.

A missing connected runtime, missing business target, or inconclusive
diagnostic step is not a blocker. Continue with browser evidence, Extensions,
source inspection, and actual tests.

## 9. References

- Page-side `@openruntime/core` targets, snapshots, and actions: `core.md`
- Extensions, automation scripts, and project integration: `integrate.md`
- Modern.js routes, loaders, and hydration: `modernjs.md`
- Module Federation remotes, exposes, shared dependencies, and observability:
  `module-federation.md`
- Garfish sub-application lifecycle and custom loaders: `garfish.md`
