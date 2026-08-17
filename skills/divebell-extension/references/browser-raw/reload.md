# `browser.raw`: `reload`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["reload", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser reload - Reload the current page

Usage: agent-browser reload

Reloads the current page, equivalent to pressing F5 or clicking
the browser's reload button.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser reload
```
