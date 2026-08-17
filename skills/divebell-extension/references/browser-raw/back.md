# `browser.raw`: `back`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["back", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser back - Navigate back in history

Usage: agent-browser back

Goes back one page in the browser history, equivalent to clicking
the browser's back button.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser back
```
