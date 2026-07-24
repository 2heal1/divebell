# Browser Connections and Multiple Runtimes

This guide explains how the OpenRuntime CLI connects to a page and how to select a Runtime when one page exposes multiple instances.

For Chinese, see [浏览器连接与多 Runtime 使用指南](runtime-connections.zh-CN.md).

## Basic flow

The page only creates and registers Runtimes. It does not connect to the Bridge itself. Each time the CLI opens a page, it starts a dedicated local Bridge on an automatically assigned port and installs a connection manager before page code runs:

```bash
openruntime open http://localhost:3000 --ui
```

The successful `open` result includes `bridgeUrl` and `bridgePort`. The current working directory remembers that page and Bridge, so later browser and Runtime commands return to the matching browser session and use the same Bridge automatically. Different working directories do not share their default page, browser session, or Bridge.

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

All Runtime commands without `--runtime`, including `run-action` and `wait-for`, select the first connected Runtime registered by the page. Pass `--runtime` to select another instance by its exact ID.

When `--runtime` is present, `wait-for` stays on that exact instance. Add `--strict` when the command should make only one selection attempt instead of waiting for the selected Runtime or target to become available.

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

The current directory records the explicit Bridge address or port, so subsequent commands can omit it. A port passed to `open` must be free; OpenRuntime does not reuse an existing service for a dedicated page Bridge.

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
