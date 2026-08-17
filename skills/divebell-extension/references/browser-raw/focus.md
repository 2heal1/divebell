# `browser.raw`: `focus`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["focus", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser focus - Focus an element

Usage: agent-browser focus <selector>

Sets keyboard focus to the specified element.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser focus "#input-field"
  agent-browser focus @e2
```
