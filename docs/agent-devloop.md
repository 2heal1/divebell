# Coding Agent Development Debugging Loop

Chinese version: [Coding Agent 开发调试闭环](agent-devloop.zh-CN.md)

OpenRuntime helps coding agents reproduce, diagnose, and verify problems in real web scenarios. The coding agent reads and changes source code; OpenRuntime prepares reusable browser context, provides diagnostics, and preserves verification evidence.

The goal is to reduce human intervention during development. This does not bypass authorization. Teams prepare test accounts, login state, accessible environments, and allowed actions in advance so an agent can continue working within explicit boundaries.

## Complete Flow

```text
Prepare account and environment
              ↓
Open the real page and keep the session
              ↓
Reproduce and collect evidence
              ↓
Coding agent changes source code
              ↓
Reuse the session and verify again
              ↓
Keep only reusable debugging capabilities
```

## 1. Prepare Access

Protected pages should not require a person to sign in again for every task. A team can reuse a test account's Chrome Profile directly or load a prepared agent-browser state:

```sh
openruntime open https://example.com/orders --profile "Test Account" --ui
# or
openruntime open https://example.com/orders --state /path/to/test-account.json --ui
```

Later `openruntime open` calls automatically restore browser state for the same project. Use `state save` when a portable file or a URL-scoped export is needed; confirm the actual account and permissions in the target page.

When a team needs dynamic account selection, environment switching, temporary credentials, or internal preparation, it can package those steps as an Extension. The Extension must stay inside the authorized account and environment boundary and must not expose sensitive values.

See [Browser Authentication and State](browser-auth.md) for details.

## 2. Open the Real Page and Preserve Context

Open the target page with a named session:

```sh
openruntime open https://example.com/orders --session orders-debug --ui
```

Later page commands and Extensions reuse the most recently opened page, session, and login state by default. Do not run `stop` in the middle of a workflow unless the task owns the entire browser lifecycle; the current page may still contain valuable development context.

OpenRuntime can debug a regular page without Runtime Core. If the page has no connected runtime, continue with browser-side capabilities instead of modifying the application before investigation can begin.

## 3. Discover Available Capabilities

Inspect the current CLI and installed Extensions:

```sh
openruntime --help
openruntime extensions list
openruntime stack
```

`stack` runs detectors supplied by Extensions. A detector may recommend a focused Extension for the current project. Use a command only when its description matches the problem; do not run every diagnostic without a reason.

Common team Extensions may provide:

- test accounts and environment preparation
- framework or micro-frontend state checks
- page performance, memory, and code-usage analysis
- domain-specific diagnosis and verification
- an Agent Skill for a complex command

## 4. Reproduce and Diagnose

Start with evidence directly related to the problem:

```sh
openruntime page-snapshot
openruntime console --level error
openruntime network --url /api/orders
openruntime screenshot orders-error --full-page
```

For performance, memory, or code-execution problems, prefer a matching Extension so it owns capture, calculation, reporting, and cleanup. A memory check, for example, can repeat a real user journey and compare post-cleanup memory, DOM-node, and listener trends rather than relying on one instantaneous value.

If the page already uses Runtime Core, add internal evidence when useful:

```sh
openruntime snapshot --session orders-debug
openruntime events --session orders-debug --limit 30
```

Runtime information is optional deep evidence. Prefer it when it is relevant. If no runtime or useful signal exists, move back to page state, Console, Network, or a focused Extension instead of repeatedly querying an empty Runtime.

A completed diagnosis should narrow the problem to specific source code, configuration, dependencies, requests, or runtime state, not merely record that the page looks wrong.

## 5. Change the Code

The coding agent changes source code based on the evidence. OpenRuntime does not replace code editing, but it should preserve the page, login state, and diagnostic artifacts needed for verification after the change.

Restart the target application when the change affects build configuration, dependency resolution, the development server, or page initialization. Reuse hot reload only for ordinary page-code changes when the development server applies them correctly.

## 6. Verify in the Same Scenario

Verification must return to the same account, environment, entry point, and user journey as the original problem. A working home page does not prove that a protected orders flow is fixed.

Choose verification evidence in this order:

1. A focused Extension check already relevant to the task, such as memory growth, code usage, or framework diagnosis.
2. Existing Runtime Targets, Snapshots, and `waitFor` conditions.
3. An explicit page result, request outcome, and absence of relevant errors.
4. A screenshot for visual confirmation or an artifact, not as the sole proof of an interactive or stateful result.

A regular page does not need Runtime Core solely for final verification. Add a stable Target or Action when:

- the true business state cannot be determined reliably from the page surface;
- multiple agents, scripts, or CI jobs will verify the same result over time;
- the team needs to await an asynchronous business flow without fixed delays; or
- an action needs explicit inputs, risk, and authorization boundaries.

If verification fails, preserve the session and return to diagnosis. When it passes, stop collecting duplicate evidence.

## 7. Preserve Reusable Work

An isolated problem does not require permanent integration. Keep the appropriate form only when it has long-term value:

| Need | Recommended form |
| --- | --- |
| Diagnose the currently opened page | Extension command |
| Prepare accounts, environments, or page initialization | Extension hook or command |
| Own the whole browser lifecycle and replay a journey | Automation script |
| Expose internal state, events, and allowed actions | Runtime Core API |
| Explain a complex command and its decision process | Skill shipped by the Extension |

Do not add Targets to every page merely to demonstrate OpenRuntime, and do not turn every one-off browser command into an Extension. Preserve only work that reduces future human intervention or improves reliability.

## Completion Criteria

A development debugging task is complete when:

- it used the account, environment, and user journey that match the real problem;
- the evidence explains why the source change was needed;
- the changed application ran again in a real browser;
- verification evidence matches the problem instead of checking only that a page opens;
- no unrelated application integration was added merely to use OpenRuntime; and
- sensitive login state and debugging artifacts remain in trusted environments.
