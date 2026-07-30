---
name: analyze-memory-growth
description: Use the Divebell Memory Extension to repeat real page actions in the current web project, determine whether JavaScript memory, DOM nodes, and event listeners keep growing, locate suspicious allocations, and retest after a change. Use when the user asks to analyze, diagnose, reproduce, fix, or verify a browser memory leak or sustained page-memory growth in the current project with the globally installed divebell command.
---

# Analyze page memory growth

Use `divebell memory check` to inspect a repeatable real page workflow. Establish a stable, reproducible scenario first, then judge the result from growth across multiple iterations. Never declare a leak from one memory reading or one peak.

This skill ships with `@divebell/extension-memory` and is discoverable through `divebell memory --skill`.

## Working principles

- Use the globally installed `divebell`; do not add `@divebell/cli` to the application project.
- Reproduce the user's reported path first. If the user did not provide one, use project documentation, routes, and existing end-to-end tests to choose a representative workflow that repeatedly creates and destroys page state.
- Use the same account, environment, and page path as the reported issue. Reuse existing login state and never bypass authorization boundaries.
- Prefer a full `memory check`. `memory metrics` is only for temporary observation and cannot prove or disprove a leak by itself.
- Return every measured operation to the same stable state. Avoid workflows that legitimately accumulate business data, caches, or history that cannot be cleared.
- Save the first report before changing code. Retest with the same URL, scenario, warm-up count, and measured iteration count.

## 1. Confirm the command

Run:

```bash
divebell memory --help
```

If `divebell` is unavailable, ask the user to install `@divebell/cli` globally and run `divebell setup`. If the `memory` command is missing, ask the user to run:

```bash
divebell extensions add @divebell/extension-memory
```

Do not install the CLI or Extension in the application project.

## 2. Choose a scenario

1. Read the project documentation, startup scripts, routes, and relevant tests to identify the existing startup command and page URL.
2. Start the project and confirm that the target page is reachable.
3. Choose one complete loop from the user's reproduction steps. Common scenarios include navigating back and forth, opening and closing dialogs, refreshing lists, and repeatedly mounting and unmounting components.
4. Define observable stable conditions at the start and end of the loop, such as a fixed path, a visible element, the end of a loading state, or a completed counter.

If the user did not provide a reproduction path and the project has no trustworthy representative workflow, explain what is missing and ask for it. Do not choose an unrelated click arbitrarily.

## 3. Write the scenario

Create a JavaScript module that exports `setup` and `run`:

```js
export default {
  async setup({ page }) {
    await page.waitEval('document.querySelector(\'a[href="/orders"]\') !== null');
  },

  async run({ page }) {
    await page.eval('document.querySelector(\'a[href="/orders"]\').click()');
    await page.waitEval('window.location.pathname === "/orders"');
    await page.eval('document.querySelector(\'a[href="/"]\').click()');
    await page.waitEval('window.location.pathname === "/"');
  },
};
```

- Let `setup` establish only the stable initial state.
- Let `run` complete one repeatable loop and finish after returning to the initial state.
- After every click, navigation, or asynchronous operation, use `waitEval` to wait for an explicit result.
- Use short delays only when the page provides no reliable observable condition.
- Put one-off analysis scenarios in a temporary directory. Keep a scenario in the project only when the user wants repeatable long-term checks.

## 4. Run the full check

Use three warm-up iterations and twelve measured iterations by default:

```bash
divebell memory check \
  --url <target-page-url> \
  --scenario <scenario-file-path> \
  --warmup 3 \
  --iterations 12 \
  --artifact-dir <result-directory>
```

If the check fails, first distinguish between a server that is not running, an incorrect scenario wait condition, expired login state, and a memory collection failure. Fix the scenario or environment and rerun it. Do not report a tool failure as an application memory issue.

## 5. Judge the result and locate the cause

Read `report.json` and focus on:

- `verdict` and `reasons`;
- before-and-after differences in memory, DOM nodes, and event listeners;
- the per-iteration growth trend for each metric;
- the functions with the largest allocations.

Report within these boundaries:

- `no-clear-growth` means only that no clear sustained growth appeared in this scenario and iteration count. It does not prove that every page is leak-free.
- `suspicious-growth` means that a sustained growth signal deserves investigation. Confirm the cause using the specific growing metric, related page code, and before-and-after snapshots.
- High allocation volume does not imply that memory cannot be reclaimed. Do not identify the largest allocator as the leak from that fact alone.

When suspicious growth appears, inspect event listeners, timers, subscriptions, observers, global collections, caches, and cleanup during component disposal in the affected workflow. Change code only if the user asked for a fix. After a fix, retest with exactly the same scenario.

## 6. Report

Clearly state:

1. The page actions that were repeated.
2. The number of iterations.
3. Which metrics kept growing and which stayed stable.
4. The verdict and supporting evidence.
5. The paths to the report, allocation data, and before-and-after snapshots.
6. If a fix was made, the before-and-after comparison from the same scenario.
