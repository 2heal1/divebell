# `browser.raw`: `fill`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["fill", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser fill - Clear and fill an input field

Usage: agent-browser fill <selector> <text>

Clears the input field and fills it with the specified text.
This replaces any existing content in the field.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser fill "#email" "user@example.com"
  agent-browser fill @e3 "Hello World"
  agent-browser fill "input[name='search']" "query"
```
