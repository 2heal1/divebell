# `browser.raw`: `check`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["check", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser check - Check a checkbox

Usage: agent-browser check <selector>

Checks a checkbox element. If already checked, no action is taken.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser check "#terms-checkbox"
  agent-browser check @e7
```
