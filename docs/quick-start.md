# Divebell Quick Start

Chinese version: [Divebell 快速体验](quick-start.zh-CN.md)

Try Divebell on the hosted Northstar Supply operations app:

[Open the Quick Start](https://2heal1.github.io/divebell/quickstart/)

The page is presented as a normal order-management product. It does not expose
a Divebell tutorial, agent steps, or debugging answers in the interface.
Behind that application surface it includes a controlled failed request, a
declared recovery action, an on-demand Analytics view, and a repeatable memory
scenario. You do not need to clone this repository or obtain its source code.

## Install Divebell

Install the CLI globally once, then confirm that it is available:

```bash
npm install --global @divebell/cli
divebell check --fix
divebell --help
```

Divebell is a machine-level debugging tool. Do not add the CLI to the
application's dependencies.

## Start with the Agent skill

Install the complete `skills/divebell` directory in an Agent that supports
skills. For Codex, place it at:

```text
~/.codex/skills/divebell
```

Then ask:

```text
Use Divebell to complete the official Quick Start. Operate the order page,
trigger and diagnose the inventory failure, recover it through the
page-declared action, and finish by opening a Code Usage report.
```

The skill uses the globally installed `divebell` command and never adds the
CLI to the current project.

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
Continue the Divebell Quick Start with the memory analysis.
```

The memory Extension repeats the bundled scenario and measures the browser
trend. It does not need application source, source maps, or Runtime SDK.

## What this is—and is not

The Quick Start is a hosted reference application with Divebell already
connected. The Agent should treat it like an unfamiliar real product and reach
its conclusions from browser evidence, Runtime SDK, and Extensions instead of
reading hints from the page. When diagnosing and fixing a real application, the
Agent works in that application's own repository and returns to the same real
page to verify the change.
