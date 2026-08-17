# `browser.raw`: `tap`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["tap", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser tap - Tap an element (touch gesture)

Usage: agent-browser tap <selector>

Taps an element. This is an alias for 'click' that provides semantic clarity
for touch-based interfaces like iOS Safari.

Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser tap "#submit-button"
  agent-browser tap @e1
  agent-browser -p ios tap "button:has-text('Sign In')"
```
