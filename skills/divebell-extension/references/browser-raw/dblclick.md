# `browser.raw`: `dblclick`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["dblclick", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser dblclick - Double-click an element

Usage: agent-browser dblclick <selector>

Double-clicks on the specified element. Useful for text selection
or triggering double-click handlers.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser dblclick "#editable-text"
  agent-browser dblclick @e5
```
