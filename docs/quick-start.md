# OpenRuntime Quick Start

Chinese version: [OpenRuntime 快速体验](quick-start.zh-CN.md)

Try OpenRuntime on the hosted operations playground:

[Open the Quick Start](https://2heal1.github.io/openruntime/quickstart/)

The page is intentionally designed for agent-guided exploration. It includes
real interactions, a controlled failed request, a declared recovery action, an
on-demand Insights view, and a repeatable memory lab. You do not need to clone
this repository or obtain its source code.

## Start with the Agent skill

Install the complete `skills/openruntime` directory in an Agent that supports
skills. For Codex, place it at:

```text
~/.codex/skills/openruntime
```

Then ask:

```text
Use OpenRuntime to complete the official Quick Start. Operate the order page,
trigger and diagnose the inventory failure, recover it through the
page-declared action, and finish by opening a Code Usage report.
```

The skill reuses an existing OpenRuntime CLI when available. Otherwise its
wrapper launches a pinned official CLI through pnpm's package cache without
adding a dependency to the current project.

## What the walkthrough demonstrates

1. **Operate the page:** search, filter, select, and navigate using the current
   page snapshot.
2. **Observe the browser:** capture the failed inventory URL and status from
   Network, plus the matching Console error.
3. **Understand the application:** read the page-declared state showing that
   fulfillment is blocked by inventory.
4. **Recover and verify:** run the declared retry and wait for fulfillment to
   become ready.
5. **Analyze deeper:** record the initial view and lazy Insights view as
   separate code-execution phases, then open the report.

The first four stages use a hosted page and do not require source access. The
advanced code-usage stage combines browser coverage with the exact deployed
JavaScript, source maps, and Chunk Map. Source maps alone cannot say which code
executed.

## Optional memory check

The same page contains a controlled memory lab. Ask the Agent:

```text
Continue the OpenRuntime Quick Start with the memory analysis.
```

The memory Extension repeats the bundled scenario and measures the browser
trend. It does not need application source, source maps, or Runtime Core.

## What this is—and is not

The Quick Start is a capability playground: it lets a new user experience the
browser, Runtime Core, and Extension layers against one stable public page.
When diagnosing and fixing a real application, the Agent works in that
application's own repository and returns to the same real page to verify the
change.
