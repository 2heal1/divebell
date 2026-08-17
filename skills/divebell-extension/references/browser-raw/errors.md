# `browser.raw`: `errors`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["errors", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser errors - View page errors

Usage: agent-browser errors [--clear]

View JavaScript errors and uncaught exceptions.

Options:
  --clear              Clear error buffer

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser errors
  agent-browser errors --clear
```
