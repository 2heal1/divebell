# `browser.raw`: `console`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["console", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser console - View console logs

Usage: agent-browser console [--clear]

View browser console output (log, warn, error, info).

Options:
  --clear              Clear console log buffer

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser console
  agent-browser console --clear
```
