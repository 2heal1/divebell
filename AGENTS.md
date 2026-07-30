# Divebell Agent Guide

## Project goal

Divebell is an extensible web development and debugging tool for Coding Agents. It provides ready-to-use workflows for real web scenarios and lets teams connect their own accounts, environments, internal platforms, diagnostic methods, and acceptance criteria through Extensions.

The Coding Agent reads and changes code; Divebell connects user entry points with the team's existing domain capabilities. An Extension can identify applications, environments, deployments, and other resources from the current page, call existing SDKs, OpenAPIs, CLIs, or internal platforms, and then verify changes with the same account, environment, and user path. When application-internal facts are needed, expose states, events, declared actions, and wait conditions through the Runtime SDK API.

## Authoritative documentation

Use these sources in descending priority:

1. `README.md`: current product positioning, capability boundaries, and documentation index.
2. `docs/agent-devloop.md`: the real development and debugging loop and minimal-intervention principles.
3. `docs/cli-extensions.md`: Extensions and the Extension API.
4. `docs/runtime-sdk-api.md`: Runtime SDK boundaries and public integration.
5. `skills/divebell-runtime/references/api.md` and `skills/divebell-runtime/references/integration.md`: complete Runtime SDK fields, behavior, and integration.
6. `.codex/skills/mf/SKILL.md`: use this skill first for Module Federation, remotes, shared dependencies, manifests, observability, and runtime errors.

## Current core design

- The Runtime SDK is an optional enhancement. It is not required for the Divebell CLI, browser debugging, agent-browser authentication, or Extensions.
- Extensions organize accounts, environments, specialized diagnostics, and verification outside the page. The Runtime SDK provides facts and declared actions inside the page.
- The Runtime SDK has no built-in target types or statuses. Each target's `type` and `statuses` are declared by `registerTarget`.
- The Target Registry describes what the page exposes for reference or waiting.
- Snapshot describes the page's current state.
- Event Log describes how states and actions changed.
- Action Registry describes the actions the page allows an Agent to run.
- `runAction` only executes an action and records an action event; it does not update Snapshot automatically. Continue verification with `waitFor`.
- `dependsOn` only describes blocking clues in the current state and belongs primarily in Snapshot. An Event records the change only through the `snapshot.updated` payload.

## Modern.js and MF integration direction

Future Modern.js integration must be implemented as a Modern.js plugin, not as a standalone external adapter. The plugin registers and updates targets Modern.js can know directly, including apps, routes, loaders, route components, SSR, hydration, and navigation.

`@divebell/modern-plugin` is currently a work in progress. It depends on Modern.js lifecycle hooks that have not been released in a stable version. Do not recommend it to regular projects until a Modern.js version containing those hooks is released and compatibility has been verified. Do not infer availability from a version number or preview label. Use `@divebell/core` when page-internal facts are needed. `@divebell/modern-plugin/chunk-map` is an independent build-time capability and does not depend on these runtime hooks.

Future Module Federation integration should be implemented in the MF repository's observability plugin and should reuse MF observability capabilities first. It registers and updates targets MF can know directly, including consumers, remotes, manifests, remote entries, exposes, shared dependencies, and runtime errors.

These plugins depend on hooks exposed by Modern.js or MF. If the available hooks are insufficient, add the hook to Modern.js or MF instead of adding fragile detection inside Divebell.

## Modern.js context

Read facts from the local repository first:

- Modern.js local repository: `/Users/bytedance/fork_repo/modern.js`
- Application framework entry: `packages/solutions/app-tools`
- Routing, runtime, and SSR: `packages/runtime/plugin-runtime`
- Loaders and redirects: `packages/cli/plugin-data-loader`
- Server and BFF: `packages/server/*`
- Early MF evaluation demo: `tests/integration/agent-runtime-mf`

If the local repository does not provide enough context, consult the official documentation at `https://modernjs.dev/guides/get-started/introduction`.

## GitHub pull request operations

- When creating or updating a pull request, use local Git to create the branch, commit, and push. Use an authorized GitHub connector or plugin to create, read, and update the pull request.
- An unauthenticated result from `gh auth status` is not by itself a reason to stop, and does not justify asking the user to log in to `gh`.
- After confirming the change scope and completing verification, first try to push with the existing Git credentials. After a successful push, use the GitHub connector or plugin to create or update the pull request.
- Use `gh` only when the GitHub connector or plugin cannot complete the required operation.
- Ask the user to intervene only if the Git push fails and the GitHub connector or plugin also cannot access the repository or complete the operation.
- These rules override any general publishing requirement to log in to `gh` first.

## Working rules

- Do not use the old `Agent Runtime` name as the current product name. The product is Divebell.
- Do not define Divebell as an Agent Runtime, Runtime API, browser automation tool, or development runtime. It is an extensible web development and debugging tool for Coding Agents.
- Connect existing team accounts, environments, resource identification, SDKs, OpenAPIs, CLIs, internal platforms, diagnostic methods, and acceptance criteria through Extensions first.
- For protected pages, reuse prepared authentication state and sessions. Test accounts and authorization must be configured in advance, clearly scoped, and reusable. Never bypass authorization boundaries.
- When a regular page has no Runtime SDK, debug it with page results, Console, Network, screenshots, and specialized Extensions. Do not force an application to add the Runtime SDK just to begin debugging.
- Prefer an Extension for reusable work that can happen outside the page. Add the Runtime SDK only when application-internal facts, declared actions, or long-lived stable wait conditions are required.
- After a change, verify it with the same account, environment, and user path as the reported problem. Use the most reliable available evidence for the issue; do not require every task to add a business target or run a fixed verification command.
- Do not derive the first API version from obsolete documentation for `items + relations`, `from/to`, `RuntimeRelationEvent`, `waitForEvent`, or `action expect`.
- Design Modern.js integration as a Modern.js plugin and prefer using or extending framework hooks.
- Integrate Divebell with MF through the MF observability plugin first. Use the installed MF skill, especially for observability, remotes, shared dependencies, and runtime errors.
- If an implementation needs a new lifecycle or runtime signal, first decide whether it belongs in a Modern.js or MF hook or in the Divebell SDK API.
