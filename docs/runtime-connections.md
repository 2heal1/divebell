# Browser Connections and Multiple Runtimes

This guide explains how the Divebell CLI connects to a page and how to select a Runtime when one page exposes multiple instances.

## Core Concepts

Understanding the following relationships helps you navigate Divebell's architecture:

### Concept hierarchy

```
Working Directory (cwd)
  └── Divebell Daemon (1 per directory)
        └── Browser Session (agent-browser, 1 per daemon)
              └── Browser Tabs (multiple per session)
                    └── Runtimes (1~N per tab, registered by page code)
```

- **Working Directory**: The current `cwd` determines which browser session and daemon you are connected to. Different directories maintain independent sessions.
- **Divebell Daemon**: A background process started by `divebell open` that handles communication between the CLI and browser. It is reused automatically — you do not need to manage it manually.
- **Browser Session**: The agent-browser instance (Chrome with Divebell integration). It persists cookies, localStorage, tabs, and navigation history across commands.
- **Tab**: A single browser tab within the session. You can open new tabs with `divebell tab new <url>`. All tabs in a session share the same daemon and cookies.
- **Runtime**: An instance registered by page code through the Runtime SDK. Each tab/page can expose one or more Runtimes (e.g., a shell app and a child micro-frontend).

### About the Bridge

The term **Bridge** appears in some internal APIs and implementation details. It refers to the local HTTP service that the daemon exposes for Runtime SDK communication. **You do not need to understand or manage the Bridge.** Divebell handles it automatically:

- `divebell open` starts or reuses a daemon automatically
- The daemon picks an available port and manages its own lifecycle
- All subsequent commands in the same directory reuse the same daemon

> **Note**: The `--bridge` option exists for advanced use cases (connecting to an externally managed daemon or a daemon running on a different host). Most users should never need it.

### Examples

```bash
# First open in a directory — starts daemon + browser session
divebell open http://localhost:3000

# Open another URL in the same directory — reuses daemon, navigates to new URL
divebell open http://localhost:4000

# Open a new tab in the current session — daemon unchanged
divebell tab new http://localhost:5000

# Switch tabs within the session
divebell tab list
divebell tab <tab-id>

# Check which Runtimes are connected (per tab/page)
divebell runtimes
```

### Quick reference

| Action | Daemon changes? | Session changes? | URL changes? |
|---|---|---|---|
| First `open` in a directory | ✅ New daemon | ✅ New session | ✅ |
| `open` same directory, different URL | ❌ Reuses | ❌ Reuses | ✅ New URL |
| `tab new` | ❌ | ❌ | ✅ New tab |
| `tab <id>` (switch) | ❌ | ❌ | ❌ |
| `goto <url>` | ❌ | ❌ | ✅ Navigate |
| Different directory, same port | ❌ Reuses | ❌ Reuses | ✅ |
| Different directory, `--port` | ✅ New daemon | ✅ New session | ✅ |

## Basic flow

The page only creates and registers Runtimes. It does not connect to the Bridge itself. The first time the CLI opens a page in a working directory, it starts a dedicated local Bridge on an automatically assigned port and installs a connection manager before page code runs:

```bash
divebell open http://localhost:3000 --ui
```

The successful `open` result includes `bridgeUrl` and `bridgePort`. The current working directory remembers that page and Bridge, so later `open`, browser, and Runtime commands return to the matching browser session and use the same Bridge automatically. A later `open` navigates the current page while keeping the Bridge endpoint and initialization script stable. Different working directories do not share their default page, browser session, or Bridge.

User-provided `--init-script` options are repeatable and remain part of that directory-scoped browser session when a later `open` omits them. Passing new `--init-script` options replaces the remembered user script list for subsequent opens; Divebell's internal Bridge script remains separate and does not replace user scripts.

The connection manager connects every registered Runtime, watches for later registrations such as mounted micro-frontends, disconnects only unregistered instances, and remains active across navigation and refreshes in the current browser session.

Running `divebell start` first is normally unnecessary. To open a page without Runtime connections, use:

```bash
divebell open http://localhost:3000 --no-bridge --ui
```

## Check connected Runtimes

```bash
divebell runtimes
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

Use the returned `runtimeId` in later commands. If the list is empty, confirm that the page was opened with `divebell open` and that it has registered a Runtime.

## Single-Runtime operation

When the page exposes only one Runtime, selectors can be omitted:

```bash
divebell targets
divebell snapshot
divebell events --limit 20
divebell actions
divebell run-action orders.refresh --payload '{"force":true}'
divebell wait-for business:orders ready --timeout 5000
```

Use `--url` or `--session` to narrow the page when needed:

```bash
divebell snapshot --url http://localhost:3000
divebell snapshot --session check-orders
```

## Multiple-Runtime operation

When one page exposes multiple Runtimes, list them first and then select one explicitly with `--runtime`:

```bash
divebell targets --runtime runtime-orders
divebell snapshot --runtime runtime-orders
divebell events --runtime runtime-orders --limit 20
divebell actions --runtime runtime-orders
divebell run-action --runtime runtime-orders orders.refresh --payload '{"force":true}'
divebell wait-for --runtime runtime-orders business:orders ready --timeout 5000 --strict
```

`--url` and `--session` select a page, but Runtimes in the same page normally share both values, so they do not replace `--runtime`.

All Runtime commands without `--runtime`, including `run-action` and `wait-for`, select the first connected Runtime registered by the page. Pass `--runtime` to select another instance by its exact ID.

When `--runtime` is present, `wait-for` stays on that exact instance. Add `--strict` when the command should make only one selection attempt instead of waiting for the selected Runtime or target to become available.

## Micro-frontend mounting and switching

For a shell with route-based child applications:

1. The shell registers its Runtime and the CLI creates the first connection.
2. The orders child mounts and registers its Runtime, so the CLI creates a second connection automatically.
3. The orders child unregisters while switching routes, so only its connection disappears.
4. The checkout child registers, and `divebell runtimes` now shows the shell and checkout instances.

There is no need to rerun `divebell open` or create one Bridge per child application.

If a child remounts with the same Runtime ID, its new connection replaces the old one. A delayed disconnect from the old connection cannot disconnect the replacement.

## Register Runtimes in the page

Do not repeat registration when a framework integration already handles it. With the Runtime SDK directly, register on mount and unregister on unmount:

```ts
import {
  createDivebell,
  installDivebellOnWindow,
  uninstallDivebellFromWindow
} from "@divebell/core";

const runtime = createDivebell();

installDivebellOnWindow(runtime, window, {
  runtimeId: "runtime-orders",
  name: "orders",
  source: "micro-frontend",
  parentRuntimeId: "runtime-shell"
});

// Run when the child application unmounts.
uninstallDivebellFromWindow(runtime, window);
```

Rules:

- Every concurrently connected instance must have a unique Runtime ID.
- Include a mount key in the Runtime ID when multiple copies of one child can coexist.
- If uniqueness cannot be guaranteed, omit `runtimeId`, let Divebell generate one, and discover it with `divebell runtimes`.
- `name`, `source`, and `parentRuntimeId` help identify instances but do not select them in CLI commands.
- Do not connect to the Bridge from page code. `divebell open` owns the connections.

## Custom Bridge or port

Connect to an existing Bridge:

```bash
divebell open http://localhost:3000 --bridge http://localhost:18000 --ui
divebell runtimes --bridge http://localhost:18000
divebell snapshot --bridge http://localhost:18000 --runtime runtime-orders
```

Use another local port:

```bash
divebell open http://localhost:3000 --port 18000 --ui
divebell runtimes --port 18000
```

The current directory records the explicit Bridge address or port, so subsequent commands can omit it. The first `open --port` requires a free port. Later `open` commands in the same directory reuse that tracked Bridge when the port is omitted or unchanged; selecting a different port starts a different Bridge.

## Recommended validation flow

```bash
divebell open http://localhost:3000 --ui
divebell runtimes
divebell targets --runtime <runtime-id>
divebell snapshot --runtime <runtime-id>
divebell actions --runtime <runtime-id>
divebell run-action --runtime <runtime-id> <action-name> --payload '{}'
divebell wait-for --runtime <runtime-id> <target-id> <status> --strict
divebell snapshot --runtime <runtime-id>
divebell events --runtime <runtime-id> --limit 20
```

Completing an Action only means that the page accepted and completed the operation. Confirm the final outcome with `wait-for`, `snapshot`, or a business validation command.
