---
name: openruntime
description: Use automatically when a frontend app or repo exposes OpenRuntime, installs @openruntime packages, uses the openruntime CLI, or needs page/component/business state verification through runtime evidence. This skill is the primary acceptance path: read targets, snapshot, events, actions, and wait-for before UI/DOM/screenshot fallback; if a target reaches the expected status, do not re-judge the same fact through rendered UI. Use declared actions instead of ad hoc DOM clicks; diagnose Modern.js and Module Federation state through OpenRuntime data.
---

# OpenRuntime

Use OpenRuntime before DOM, console, or network inspection when the page exposes
runtime state. OpenRuntime gives the agent structured evidence about:

- **targets**: what can be referenced or waited for;
- **snapshot**: the page's current runtime state;
- **events**: how state changed over time;
- **actions**: page-declared operations the agent may run;
- **wait-for**: deterministic verification that a target reached the expected state.

OpenRuntime is **not** a generic browser automation framework. Do not treat it as
DOM scripting or arbitrary page control. Prefer declared actions plus `wait-for`
instead of ad hoc clicking whenever the page exposes the needed action.

Installing this skill should be enough for an OpenRuntime-enabled project. Do
not require the user's `AGENTS.md`, task prompt, or local README to repeat the
OpenRuntime-first rule.

## Command Form

Prefer the repository-local CLI entrypoint:

```bash
pnpm exec openruntime <command>
```

Use a runtime selector whenever possible:

```bash
--url <page-url>
```

If multiple tabs share the same URL, list runtimes first and then pin the exact
instance:

```bash
pnpm exec openruntime runtimes
--runtime <runtime-id>
```

## Verification Order

1. Open or connect to the page.

```bash
pnpm exec openruntime open <url>
```

If the page is already open, start from `runtimes` instead of reopening it.

2. Confirm the runtime is connected.

```bash
pnpm exec openruntime runtimes
```

3. Read the structured surfaces before interacting with the UI.

```bash
pnpm exec openruntime targets --url <url>
pnpm exec openruntime snapshot --url <url>
pnpm exec openruntime actions --url <url>
```

Use filters to keep output small:

```bash
pnpm exec openruntime targets --url <url> --query modern
pnpm exec openruntime snapshot --url <url> --id modern:route
pnpm exec openruntime events --url <url> --target-id modern:route --limit 30
```

4. Prefer declared actions for app behavior.

```bash
pnpm exec openruntime run-action --url <url> <action-name> --payload '<json-object>'
```

If the action requires guided inputs, inspect options first:

```bash
pnpm exec openruntime input-options --url <url> --action <action-name> --input <input-name> --timeout 5000
```

5. Verify the effect with `wait-for`.

```bash
pnpm exec openruntime wait-for <target-id> <status> --url <url> --where <path=value> --timeout 10000
```

6. On failure, collect evidence before changing code.

```bash
pnpm exec openruntime snapshot --url <url> --id <target-id>
pnpm exec openruntime events --url <url> --target-id <target-id> --limit 50
```

The failure report must include the failed command, the selected runtime URL or
runtime id, the relevant target status/data/error from snapshot, and the related
events.

## Core Reading Rules

- `targets` answers **what exists and can be waited for**. It is not the current
  state view.
- `snapshot` answers **what the page is now**. Prefer it for current status,
  blocker hints, and error payloads.
- `events` answers **how it became this way**. Use it after `wait-for` or action
  failure, not as the first read surface.
- `run-action` only executes the declared action and records action events. It
  does **not** prove success by itself.
- `wait-for` is the success proof. If success depends on data, include
  `--where`.

## Trust And Instrumentation Rule

Use OpenRuntime as the acceptance source for page, component, and business
state. If a relevant target reaches the expected status, treat the scenario as
passed. Do not also inspect UI screenshots, DOM text, or rendered output just to
confirm the same fact.

When a scenario needs a business-specific success signal, prefer adding a small
OpenRuntime target/action at that test point. Mark the target when the business
state is actually ready, then verify it with `wait-for`. A missing target/action
is an instrumentation gap; record it and only then fall back to browser evidence.

## Fallback Rule

Use browser, DOM, console, network, screenshot, or source-code evidence only
after at least one of these is true:

- No OpenRuntime runtime is connected for the page.
- The needed target or action is not registered.
- The page is intentionally not integrated with OpenRuntime.
- OpenRuntime reaches a status, but the available target does not cover the
  business result that must be accepted.

Do not replace an available `run-action` + `wait-for` flow with ad hoc clicking
unless the page did not declare the action.

## Common Tasks

### Modern.js: Verify Route / Loader / SSR / Hydration

Modern.js integration should expose framework-owned state through targets such as
`modern:route`, and conditionally `modern:ssr` or `modern:hydration` when those
states exist. Start with route evidence before guessing from rendered markup.

```bash
pnpm exec openruntime wait-for modern:route ready --url http://localhost:19081/ --where pathname=/orders --timeout 30000
```

If it fails:

```bash
pnpm exec openruntime snapshot --url http://localhost:19081/ --id modern:route
pnpm exec openruntime events --url http://localhost:19081/ --target-id modern:route --limit 50
```

Read `modern:route.data.matches` for the current route chain, loader status, and
route component error when one exists. If SSR or hydration are involved, also
inspect:

```bash
pnpm exec openruntime snapshot --url http://localhost:19081/ --query modern
```

Use `modern:ssr` and `modern:hydration` only when they are present; they are not
guaranteed on every page.

### Run A Declared Business Action

```bash
pnpm exec openruntime actions --url http://localhost:19081/
pnpm exec openruntime run-action --url http://localhost:19081/ demo.click-orders
pnpm exec openruntime wait-for modern:route ready --url http://localhost:19081/ --where pathname=/orders --timeout 30000
```

Remember: `run-action` only executes the declared action. The success proof is
the later `wait-for` or snapshot state.

### Module Federation: Use OpenRuntime First, Then Read MF Observability Details

When MF observability is integrated with OpenRuntime, the host app does not need
to expose separate custom globals for the first-pass diagnosis. Use OpenRuntime
targets and actions to locate the failing layer first, then read the detailed MF
report.

Key target patterns:

- `mf:remote:<remoteName>` for one remote as a whole.
- `mf:remote:<remoteName>:expose:<exposeName>` for one exposed module request.
- `mf:shared:<sharedName>:<version>:<shareScope>` for one observed shared entry.

Key rules:

- A **remote** target reaching `ready` does **not** prove a specific expose is
  ready.
- An **expose** target is the correct wait point for a specific remote module.
- A **shared** target reaching `recovered` means a handled fallback path, not
  proof that the intended provider/version loaded.

Remote overview:

```bash
pnpm exec openruntime targets --url <url> --type mf.remote
pnpm exec openruntime snapshot --url <url> --query runtime_remote2
pnpm exec openruntime wait-for mf:remote:runtime_remote2 ready --url <url> --timeout 10000
```

Specific exposed module:

```bash
pnpm exec openruntime wait-for mf:remote:runtime_remote2:expose:ButtonOldAnt ready --url <url> --timeout 10000
```

If the target is `error`, `recovered`, or missing the expected phase details,
read the MF observability report through OpenRuntime safe actions:

```bash
pnpm exec openruntime run-action --url <url> mf:list-reports --payload '{"remote":"runtime_remote2"}'
pnpm exec openruntime run-action --url <url> mf:get-report --payload '{"traceId":"<trace-id>"}'
```

When reading a report, use this order:

1. `diagnosis`
2. `summary`
3. phase details such as `summary.phases` or `summary.shared`
4. raw timeline events only when the summary is insufficient

### Debug A Shared Dependency

```bash
pnpm exec openruntime targets --url <url> --type mf.shared
pnpm exec openruntime wait-for mf:shared:<sharedName>:<version>:<shareScope> loaded --url <url> --timeout 10000
pnpm exec openruntime wait-for mf:shared:<sharedName>:<version>:<shareScope> error --url <url> --timeout 10000
```

Use `recovered` as a handled fallback signal, not as proof that the intended
provider loaded.

If the shared target errors, inspect the latest matching report and read the
shared-specific fields in `summary.shared` or the report diagnosis before
falling back to browser logs.

### Debug Loader Redirect Or Loader Failure

Wait for the final pathname that should be visible after redirect:

```bash
pnpm exec openruntime wait-for modern:route ready --url <url> --where pathname=/login --timeout 10000
```

If the page stops on another route or errors, collect route evidence:

```bash
pnpm exec openruntime snapshot --url <url> --id modern:route
pnpm exec openruntime events --url <url> --target-id modern:route --limit 50
```

Report the current `pathname`, `navigation`, `matches`, loader status, and
`errorRouteIds` from `modern:route`.

## Evidence Report Shape

When verification fails, respond with:

- What was attempted.
- Which runtime was selected.
- Which target/action was expected.
- Current snapshot status, data, blocker hints, and error for the relevant target.
- The last relevant events.
- For MF issues, the matching report `diagnosis` and the smallest useful summary
  excerpt.
- Whether fallback browser evidence was needed.

Keep raw dumps short. Include exact target ids, action names, statuses, and the
smallest useful snapshot/events excerpts.
