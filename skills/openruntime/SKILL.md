---
name: openruntime
description: Use when Codex needs to verify, debug, or operate an OpenRuntime-enabled frontend app through the OpenRuntime CLI or API; inspect targets, snapshot, events, and actions; run declared actions and wait for targets; collect failure evidence; fall back to browser/DOM/console/network only when OpenRuntime is absent or insufficient; coordinate Modern.js route/loader/SSR/hydration and Module Federation observability tasks with the MF skill.
---

# OpenRuntime

Use OpenRuntime before DOM inspection when the page exposes runtime state. It gives
structured targets, current snapshot, event history, and declared actions that are
safer and more stable than guessing from markup.

## Command Form

Inside this repo, prefer:

```bash
pnpm exec openruntime <command>
```

For installed packages, `open-runtime` and `opr` are equivalent CLI entrypoints.

Use a runtime selector whenever possible:

```bash
--url <page-url>
```

If multiple tabs have the same URL, run `pnpm exec openruntime runtimes` and use:

```bash
--runtime <runtime-id>
```

## Verification Order

1. Open or connect to the page.

```bash
pnpm exec openruntime open <url>
```

If the page is already open, start from `runtimes`.

2. Confirm the runtime is connected.

```bash
pnpm exec openruntime runtimes
```

3. Read available structured surfaces before interacting with the UI.

```bash
pnpm exec openruntime targets --url <url>
pnpm exec openruntime snapshot --url <url>
pnpm exec openruntime actions --url <url>
```

Use filters to keep output small:

```bash
pnpm exec openruntime targets --url <url> --query route
pnpm exec openruntime snapshot --url <url> --type modern.route
pnpm exec openruntime events --url <url> --target-id modern:route --limit 30
```

4. Prefer declared actions for app behavior.

```bash
pnpm exec openruntime run-action --url <url> <action-name> --payload '<json-object>'
```

5. Verify the effect with `wait-for`.

```bash
pnpm exec openruntime wait-for --url <url> <target-id> <status> --where <path=value> --timeout 10000
```

6. On failure, collect evidence before changing code.

```bash
pnpm exec openruntime snapshot --url <url>
pnpm exec openruntime events --url <url> --limit 50
```

The failure report must include the failed command, selected runtime URL or id,
the relevant snapshot target status/data/error, and the related events.

## Fallback Rule

Use browser, DOM, console, network, screenshot, `page-snapshot`, `get-window`, or
`wait-eval` only after one of these is true:

- No OpenRuntime runtime is connected for the page.
- The needed target or action is not registered.
- The page is intentionally not integrated with OpenRuntime.
- OpenRuntime evidence identifies the failing layer, and browser evidence is
  needed to inspect rendering or network details.

Fallback commands:

```bash
pnpm exec openruntime page-snapshot
pnpm exec openruntime wait-eval "location.pathname === '/orders'" --timeout 10000
pnpm exec openruntime get-window __OPEN_RUNTIME__
pnpm exec openruntime screenshot failure
```

Do not replace an available `run-action` + `wait-for` flow with ad hoc clicking
unless the page did not declare the action.

## Common Tasks

### Wait For A Modern.js Route

```bash
pnpm exec openruntime wait-for --url http://localhost:19081/ modern:route ready --where pathname=/orders --timeout 30000
```

If it fails:

```bash
pnpm exec openruntime snapshot --url http://localhost:19081/ --id modern:route
pnpm exec openruntime events --url http://localhost:19081/ --target-id modern:route --limit 50
```

Read `modern:route.data.matches` for the current route chain, loader status, and
route component error when one exists.

### Run A Declared Business Action

```bash
pnpm exec openruntime actions --url http://localhost:19081/
pnpm exec openruntime run-action --url http://localhost:19081/ demo.click-orders
pnpm exec openruntime wait-for --url http://localhost:19081/ modern:route ready --where pathname=/orders --timeout 30000
```

If the action requires inputs, inspect options first:

```bash
pnpm exec openruntime input-options --url <url> --action <action-name> --input <input-name> --timeout 5000
```

Remember: `run-action` only executes the declared action. The success proof is
the later `wait-for` or snapshot state.

### Debug A Module Federation Remote Or Expose

For MF-specific diagnosis, also use the repository's `$mf observability` skill.
Use OpenRuntime to wait for or inspect the runtime target, then use MF reports
for the detailed loading chain.

Remote overview:

```bash
pnpm exec openruntime targets --url <url> --type mf.remote
pnpm exec openruntime snapshot --url <url> --query runtime_remote2
pnpm exec openruntime wait-for --url <url> mf:remote:runtime_remote2 ready --timeout 10000
```

Specific exposed module:

```bash
pnpm exec openruntime wait-for --url <url> mf:remote:runtime_remote2:expose:ButtonOldAnt ready --timeout 10000
```

Read the matching report:

```bash
pnpm exec openruntime run-action --url <url> mf:list-reports --payload '{"remote":"runtime_remote2"}'
pnpm exec openruntime run-action --url <url> mf:get-report --payload '{"traceId":"<trace-id>"}'
```

### Debug A Shared Dependency

```bash
pnpm exec openruntime targets --url <url> --type mf.shared
pnpm exec openruntime wait-for --url <url> mf:shared:<sharedName>:<version>:<shareScope> loaded --timeout 10000
pnpm exec openruntime wait-for --url <url> mf:shared:<sharedName>:<version>:<shareScope> error --timeout 10000
```

Use `recovered` as a handled fallback signal, not as proof that the intended
provider loaded.

### Debug Loader Redirect Or Loader Failure

Wait for the final pathname that should be visible after redirect:

```bash
pnpm exec openruntime wait-for --url <url> modern:route ready --where pathname=/login --timeout 10000
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
- Current snapshot status and error for the relevant target.
- The last relevant events.
- Whether fallback browser evidence was needed.

Keep raw dumps short. Include exact target ids, action names, statuses, and the
smallest useful snapshot/events excerpts.
