# Run the Official OpenRuntime Quick Start

Use this workflow when the user wants a first experience and has not provided
another page. The playground is already deployed with Runtime Core and build
metadata. Do not clone the OpenRuntime repository and do not modify source.

Playground:

```text
https://2heal1.github.io/openruntime/quickstart/
```

## 1. Resolve the CLI

Run `openruntime --help` or a project-local equivalent first. If neither is
available, use the skill wrapper for every command:

```bash
node <skill-dir>/scripts/openruntime-cli.mjs --help
```

Replace `<skill-dir>` with the absolute path of this installed skill. The
wrapper prefers an existing project or PATH command and otherwise launches the
pinned official CLI through pnpm's package cache. Do not add dependencies to
the user's project.

Read scoped help before using commands whose arguments are not confirmed.

## 2. Open and operate the page

Open the playground visibly unless the user requested a headless run:

```bash
<opr> open https://2heal1.github.io/openruntime/quickstart/ --ui
<opr> page-snapshot
```

Keep the `openedUrl` and connected Runtime ID from the command results. Later
stages use them to reload the same managed page and select the correct Runtime.

Use actionable references from the page snapshot to search or filter orders and
select a different order. Read another page snapshot to verify the visible
result. This stage demonstrates ordinary Browser API capability and does not
depend on Runtime Core.

## 3. Reproduce and explain the controlled failure

Inspect `actions`, then run the page-declared failure:

```bash
<opr> actions
<opr> run-action quickstart.trigger-inventory-failure
<opr> wait-for request:inventory error
<opr> network --url inventory-missing
<opr> console --level error --query "Inventory request failed"
<opr> snapshot --id request:inventory
<opr> snapshot --id business:fulfillment
```

Report the combined evidence:

- Network contains a real 404 for `inventory-missing.json`.
- Console records the controlled request failure.
- Runtime Core says fulfillment is `blocked` and depends on
  `request:inventory`.

Browser evidence proves what the browser observed. Runtime Core provides the
stable application meaning. Keep those roles distinct.

## 4. Recover through a declared action

Inspect the action choices before changing state:

```bash
<opr> input-options --action quickstart.retry-inventory --input strategy
<opr> run-action quickstart.retry-inventory --payload '{"strategy":"origin"}'
```

Read `nextAttempt` from the action result, then wait for
`business:fulfillment` to become `ready` with that attempt:

```bash
<opr> wait-for business:fulfillment ready --where attempt=<nextAttempt> --timeout 10000
```

Confirm the final page and Network result. Do not treat successful action
dispatch as successful recovery; the final target state is the verification.

## 5. Optional advanced code-usage stage

Use this stage when the user asks for the complete or advanced Quick Start.
Confirm `code-usage` through help; install the official Extension if missing:

```bash
<opr> extensions add @openruntime/extension-code-usage
<opr> code-usage --help
```

Record the initial view and the on-demand Insights view as separate phases:

```bash
<opr> coverage start
<opr> goto <openedUrl-from-open>
<opr> wait-for --runtime runtime-openruntime-quickstart app:openruntime-quickstart ready --timeout 10000
<opr> coverage take /tmp/openruntime-quickstart-initial.coverage.json --label initial
<opr> run-action --runtime runtime-openruntime-quickstart quickstart.open-insights
<opr> wait-for --runtime runtime-openruntime-quickstart analysis:code-usage ready --timeout 10000
<opr> coverage stop /tmp/openruntime-quickstart-insights.coverage.json --label insights
node <skill-dir>/scripts/download-quickstart-build.mjs \
  --output /tmp/openruntime-quickstart-build
<opr> code-usage analyze \
  --chunk-map /tmp/openruntime-quickstart-build/openruntime-chunks.json \
  --assets /tmp/openruntime-quickstart-build \
  --coverage /tmp/openruntime-quickstart-initial.coverage.json \
  --coverage /tmp/openruntime-quickstart-insights.coverage.json \
  --output /tmp/openruntime-quickstart-code-usage.json
<opr> code-usage report /tmp/openruntime-quickstart-code-usage.json
```

The deployed Chunk Map, JavaScript, and source maps come from the same build.
Source maps alone are insufficient: coverage records what ran, while the Chunk
Map and exact build assets attribute those bytes to chunks and source owners.
The bundled download script retrieves only those public build files; it does
not clone the repository or require an application source checkout.

## 6. Optional memory stage

Use this stage only when the user asks for memory analysis. Confirm `memory`
through help; install the official Extension if missing, then use the scenario
bundled with this skill:

```bash
<opr> extensions add @openruntime/extension-memory
<opr> stop
<opr> memory check \
  --url https://2heal1.github.io/openruntime/quickstart/#memory \
  --scenario <skill-dir>/scripts/quickstart-memory-scenario.mjs \
  --warmup 2 \
  --iterations 8 \
  --artifact-dir /tmp/openruntime-quickstart-memory
```

Report the measured trend and verdict. The page's displayed retained-byte count
describes the controlled lab input; only the Extension output is browser memory
evidence. `memory check` owns and closes its browser page, so stop any page left
by the earlier walkthrough before starting it.

## 7. Finish

Stop the page after all requested stages are complete:

```bash
<opr> stop
```

Summarize the visible operation, browser evidence, Runtime Core explanation,
verified recovery, and any optional analysis. Do not imply that this playground
modified application source; source editing belongs to a later workflow in the
user's own repository.
