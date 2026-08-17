# `browser.raw`: `forward`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["forward", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser forward - Navigate forward in history

Usage: agent-browser forward

Goes forward one page in the browser history, equivalent to clicking
the browser's forward button.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser forward
```
