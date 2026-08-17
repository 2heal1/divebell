# `browser.raw`: `scroll`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["scroll", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser scroll - Scroll the page

Usage: agent-browser scroll [direction] [amount] [options]

Scrolls the page or a specific element in the specified direction.

Arguments:
  direction            up, down, left, right (default: down)
  amount               Pixels to scroll (default: 300)

Options:
  -s, --selector <sel> CSS selector for a scrollable container

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser scroll
  agent-browser scroll down 500
  agent-browser scroll up 200
  agent-browser scroll left 100
  agent-browser scroll down 500 --selector "div.scroll-container"
```
