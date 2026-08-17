# `browser.raw`: `drag`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["drag", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser drag - Drag and drop

Usage: agent-browser drag <source> <target>

Drags an element from source to target location.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser drag "#draggable" "#drop-zone"
  agent-browser drag @e1 @e2
```
