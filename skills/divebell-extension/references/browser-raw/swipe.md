# `browser.raw`: `swipe`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["swipe", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser swipe - Swipe gesture (iOS)

Usage: agent-browser swipe <direction> [distance]

Performs a swipe gesture on iOS Safari. The direction determines
which way the content moves (swipe up scrolls down, etc.).

Arguments:
  direction    up, down, left, or right
  distance     Optional distance in pixels (default: 300)

Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser -p ios swipe up
  agent-browser -p ios swipe down 500
  agent-browser -p ios swipe left
```
