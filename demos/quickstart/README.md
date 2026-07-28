# OpenRuntime Quick Start playground

This is the source for the hosted
[OpenRuntime Quick Start](https://2heal1.github.io/openruntime/quickstart/).
The public walkthrough does not require users to clone this repository.

## Run locally

From the repository root:

```bash
pnpm --filter @openruntime/demo-quickstart dev
```

Open `http://localhost:19084/`.

Build the GitHub Pages form and verify its analysis assets:

```bash
pnpm --filter @openruntime/demo-quickstart build:pages
OPENRUNTIME_PAGES_BASE=/openruntime/quickstart/ \
  pnpm --filter @openruntime/demo-quickstart verify:build
```

## Scenarios

- Orders provide ordinary browser interaction through search, filtering, and
  selection.
- Diagnostics creates a real 404, records a matching Console error, exposes the
  blocked workflow through Runtime Core, and declares a safe retry action.
- Insights loads an on-demand JavaScript chunk for staged code-usage analysis.
- Memory Lab intentionally retains data, detached nodes, and listeners for a
  repeatable memory Extension check.

The production build publishes full JavaScript source maps and
`openruntime-chunks.json`. Code-usage analysis combines those exact build files
with browser coverage; source maps by themselves do not record execution.
