# `browser.raw`: `storage`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["storage", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser storage - Manage web storage

Usage: agent-browser storage <type> [operation] [key] [value]

Manage localStorage and sessionStorage.

Types:
  local                localStorage
  session              sessionStorage

Operations:
  get [key]            Get all storage or specific key
  set <key> <value>    Set a key-value pair
  clear                Clear all storage

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser storage local
  agent-browser storage local get authToken
  agent-browser storage local set theme "dark"
  agent-browser storage local clear
  agent-browser storage session get userId
```
