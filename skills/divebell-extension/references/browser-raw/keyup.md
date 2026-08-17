# `browser.raw`: `keyup`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["keyup", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser keyup - Release a key

Usage: agent-browser keyup <key>

Releases a key that was pressed with keydown.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser keyup Shift
  agent-browser keyup Control
```
