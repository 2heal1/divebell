# `browser.raw`: `keydown`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["keydown", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser keydown - Press a key down (without release)

Usage: agent-browser keydown <key>

Presses a key down without releasing it. Use keyup to release.
Useful for holding modifier keys.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser keydown Shift
  agent-browser keydown Control
```
