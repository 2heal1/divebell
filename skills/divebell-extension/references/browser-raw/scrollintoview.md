# `browser.raw`: `scrollintoview`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["scrollintoview", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser scrollintoview - Scroll element into view

Usage: agent-browser scrollintoview <selector>

Scrolls the page until the specified element is visible in the viewport.

Aliases: scrollinto

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser scrollintoview "#footer"
  agent-browser scrollintoview @e15
```
