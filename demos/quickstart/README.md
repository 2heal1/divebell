# Northstar Supply Quick Start app

This is the source for the hosted
[OpenRuntime Quick Start](https://2heal1.github.io/openruntime/quickstart/).
It is presented as a normal operations product: the page does not display an
OpenRuntime walkthrough, agent instructions, or debugging answers. Runtime
Core and the controlled analysis scenarios remain available behind the
application surface. Users do not need to clone this repository.

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

- Orders provide ordinary browser interaction through search, filtering,
  selection, and inventory checks.
- Inventory creates a real 404, records a matching Console error, exposes the
  blocked workflow through Runtime Core, and declares a safe retry action.
- Analytics loads an on-demand JavaScript chunk for staged code-usage analysis.
- Activity intentionally retains archived records, detached nodes, and
  listeners for a repeatable memory Extension check.

The production build publishes full JavaScript source maps and
`openruntime-chunks.json`. Code-usage analysis combines those exact build files
with browser coverage; source maps by themselves do not record execution.
