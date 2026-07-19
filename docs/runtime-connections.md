# Browser Connections and Multiple Runtimes

This guide explains how the OpenRuntime CLI connects to a page and how to select a Runtime when one page exposes multiple instances.

For Chinese, see [浏览器连接与多 Runtime 使用指南](runtime-connections.zh-CN.md).

## Basic flow

The page only creates and registers Runtimes. It does not connect to the Bridge itself. When the CLI opens a page, it prepares the local Bridge and installs a connection manager before page code runs:

```bash
openruntime open http://localhost:3000 --ui
```

The connection manager connects every registered Runtime, watches for later registrations such as mounted micro-frontends, disconnects only unregistered instances, and remains active across navigation and refreshes in the current browser session.

Running `openruntime start` first is normally unnecessary. To open a page without Runtime connections, use:

```bash
openruntime open http://localhost:3000 --no-bridge --ui
```

## Check connected Runtimes

```bash
openruntime runtimes
```

A single-Runtime page returns one connected instance. A micro-frontend page may return several. This shortened example shows a shell and a child application:

```json
{
  "runtimes": [
    {
      "runtimeId": "runtime-shell",
      "name": "shell",
      "source": "host",
      "status": "connected"
    },
    {
      "runtimeId": "runtime-orders",
      "name": "orders",
      "source": "micro-frontend",
      "parentRuntimeId": "runtime-shell",
      "status": "connected"
    }
  ]
}
```

Use the returned `runtimeId` in later commands. If the list is empty, confirm that the page was opened with `openruntime open` and that it has registered a Runtime.

## Single-Runtime operation

When the page exposes only one Runtime, selectors can be omitted:

```bash
openruntime targets
openruntime snapshot
openruntime events --limit 20
openruntime actions
openruntime run-action orders.refresh --payload '{"force":true}'
openruntime wait-for business:orders ready --timeout 5000
```

Use `--url` or `--session` to narrow the page when needed:

```bash
openruntime snapshot --url http://localhost:3000
openruntime snapshot --session check-orders
```

## Multiple-Runtime operation

When one page exposes multiple Runtimes, list them first and then select one explicitly with `--runtime`:

```bash
openruntime targets --runtime runtime-orders
openruntime snapshot --runtime runtime-orders
openruntime events --runtime runtime-orders --limit 20
openruntime actions --runtime runtime-orders
openruntime input-options --runtime runtime-orders --action orders.refresh --input source
openruntime run-action --runtime runtime-orders orders.refresh --payload '{"force":true}'
openruntime wait-for --runtime runtime-orders business:orders ready --timeout 5000 --strict
```

`--url` and `--session` select a page, but Runtimes in the same page normally share both values, so they do not replace `--runtime`.

Read commands without `--runtime` select the most recently responding matching instance. `run-action` refuses to run when multiple instances match and reports the available Runtime IDs. Explicitly pass `--runtime` for every command in multiple-Runtime flows to avoid reading or waiting on the wrong child application.

By default, `wait-for` may follow a newly connected Runtime after a page refresh. Pass both `--runtime` and `--strict` to pin the wait to one instance. Use this form when validating a specific micro-frontend child.

## Micro-frontend mounting and switching

For a shell with route-based child applications:

1. The shell registers its Runtime and the CLI creates the first connection.
2. The orders child mounts and registers its Runtime, so the CLI creates a second connection automatically.
3. The orders child unregisters while switching routes, so only its connection disappears.
4. The checkout child registers, and `openruntime runtimes` now shows the shell and checkout instances.

There is no need to rerun `openruntime open` or create one Bridge per child application.

If a child remounts with the same Runtime ID, its new connection replaces the old one. A delayed disconnect from the old connection cannot disconnect the replacement.

## Register Runtimes in the page

Do not repeat registration when a framework integration already handles it. With the Core SDK directly, register on mount and unregister on unmount:

```ts
import {
  createOpenRuntime,
  installOpenRuntimeOnWindow,
  uninstallOpenRuntimeFromWindow
} from "@openruntime/core";

const runtime = createOpenRuntime();

installOpenRuntimeOnWindow(runtime, window, {
  runtimeId: "runtime-orders",
  name: "orders",
  source: "micro-frontend",
  parentRuntimeId: "runtime-shell"
});

// Run when the child application unmounts.
uninstallOpenRuntimeFromWindow(runtime, window);
```

Rules:

- Every concurrently connected instance must have a unique Runtime ID.
- Include a mount key in the Runtime ID when multiple copies of one child can coexist.
- If uniqueness cannot be guaranteed, omit `runtimeId`, let OpenRuntime generate one, and discover it with `openruntime runtimes`.
- `name`, `source`, and `parentRuntimeId` help identify instances but do not select them in CLI commands.
- Do not connect to the Bridge from page code. `openruntime open` owns the connections.

## Custom Bridge or port

Connect to an existing Bridge:

```bash
openruntime open http://localhost:3000 --bridge http://localhost:18000 --ui
openruntime runtimes --bridge http://localhost:18000
openruntime snapshot --bridge http://localhost:18000 --runtime runtime-orders
```

Use another local port:

```bash
openruntime open http://localhost:3000 --port 18000 --ui
openruntime runtimes --port 18000
```

Use the same Bridge address or port for the open command and subsequent commands.

## Recommended validation flow

```bash
openruntime open http://localhost:3000 --ui
openruntime runtimes
openruntime targets --runtime <runtime-id>
openruntime snapshot --runtime <runtime-id>
openruntime actions --runtime <runtime-id>
openruntime run-action --runtime <runtime-id> <action-name> --payload '{}'
openruntime wait-for --runtime <runtime-id> <target-id> <status> --strict
openruntime snapshot --runtime <runtime-id>
openruntime events --runtime <runtime-id> --limit 20
```

Completing an Action only means that the page accepted and completed the operation. Confirm the final outcome with `wait-for`, `snapshot`, or a business validation command.
