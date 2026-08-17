# `browser.raw`: `highlight`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["highlight", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser highlight - Highlight an element

Usage: agent-browser highlight <selector>

Visually highlights an element on the page for debugging.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser highlight "#target-element"
  agent-browser highlight @e5
```
