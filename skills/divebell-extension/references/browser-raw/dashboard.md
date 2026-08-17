# `browser.raw`: `dashboard`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["dashboard", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser dashboard - Observability dashboard

Usage: agent-browser dashboard [start|stop] [options]

Manage the observability dashboard, a local web UI that shows live
browser viewports and command activity feeds for all sessions.
The dashboard is bundled into the binary and requires no separate install.

Subcommands:
  start [--port <n>]   Start the dashboard server (default port: 4848)
  stop                 Stop the dashboard server

Running 'agent-browser dashboard' with no subcommand is equivalent to 'dashboard start'.

The dashboard runs as a standalone background process, independent of
browser sessions. All sessions automatically stream to the dashboard.
It works from http://localhost:4848 or a proxied/forwarded URL that
reaches the dashboard server, such as https://dashboard.agent-browser.localhost
or a Coder workspace URL. The browser stays on the dashboard origin;
session tabs, status, and stream traffic are proxied internally, so
session ports do not need to be exposed.

Options:
  --port <n>           Port for the dashboard server (default: 4848)

Global Options:
  --json               Output as JSON

Examples:
  agent-browser dashboard start
  agent-browser dashboard start --port 8080
  agent-browser dashboard stop
```
