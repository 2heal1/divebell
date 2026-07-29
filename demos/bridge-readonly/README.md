# Inspect Application State and Run Page-Declared Actions

This example shows how Divebell lets an Agent inspect the state and events of an orders page, run an allowed refresh action, and wait for the final result. The page also displays its current state and recent events so they can be compared with the command output.

See [Browser Connections and Multiple Runtimes](../../docs/runtime-connections.md) for the complete workflow and multi-Runtime scenarios.

## Prerequisites

Build the workspace from the repository root:

```bash
pnpm build
```

## Start

Start the demo page in the first terminal:

```bash
pnpm --filter @divebell/demo-bridge-readonly dev
```

Open the page with the CLI in a second terminal. The CLI starts the Bridge automatically and installs the connection manager before the page loads:

```bash
divebell open http://localhost:19080/ --ui
```

## Walkthrough

Continue with the following commands.

List connected pages:

```bash
divebell runtimes
```

Read the targets declared by the page:

```bash
divebell targets --url http://localhost:19080/
```

Read the current page state:

```bash
divebell snapshot --url http://localhost:19080/
```

Read page events:

```bash
divebell events --url http://localhost:19080/ --limit 8
```

Read the actions declared by the page:

```bash
divebell actions --url http://localhost:19080/
```

Run the page-declared action:

```bash
divebell run-action --url http://localhost:19080/ demo.refresh-orders --payload '{"amount":2,"source":"cli"}'
```

Wait for the post-action state:

```bash
divebell wait-for --url http://localhost:19080/ business:orders ready --timeout 5000
```

Click `Loading`, `Error`, `Ready`, or `Add order` on the page, then run `snapshot` and `events` again to see the state and event changes.

## Expected Result

- `runtimes` shows a `connected` Runtime with `http://localhost:19080/` as its URL.
- `targets` shows `app:bridge-readonly-demo`, `route:/bridge-readonly`, and `business:orders`.
- `snapshot` shows the current state of those targets.
- `events` grows as the page buttons are used.
- `actions` shows `demo.refresh-orders`.
- `run-action` increases the order count.
- `wait-for` reports that `business:orders` is `ready`.

If the Bridge does not use port `17321`, add the selected port to the open command and every subsequent command:

```bash
--port 17322
```

## Build Check

The demo can also be built independently:

```bash
pnpm --filter @divebell/demo-bridge-readonly build
```

Preview the production build with Rsbuild:

```bash
pnpm --filter @divebell/demo-bridge-readonly preview
```
