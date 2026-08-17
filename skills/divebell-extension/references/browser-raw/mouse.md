# `browser.raw`: `mouse`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["mouse", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser mouse - Low-level mouse operations

Usage: agent-browser mouse <subcommand> [args]

Performs low-level mouse operations for precise control.

Subcommands:
  move <x> <y>         Move mouse to coordinates
  down [button]        Press mouse button (left, right, middle)
  up [button]          Release mouse button
  wheel <dy> [dx]      Scroll mouse wheel

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser mouse move 100 200
  agent-browser mouse down
  agent-browser mouse up
  agent-browser mouse down right
  agent-browser mouse wheel 100
  agent-browser mouse wheel -50 0
```
