# `browser.raw`: `click`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["click", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser click - Click an element

Usage: agent-browser click <selector> [--new-tab]

Clicks on the specified element. The selector can be a CSS selector,
XPath, or an element reference from snapshot (e.g., @e1).

If another element covers the click point, agent-browser reports the
covering element instead of dispatching a click to the wrong target.

Options:
  --new-tab            Open link in a new tab instead of navigating current tab
                       (only works on elements with href attribute)

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser click "#submit-button"
  agent-browser click @e1
  agent-browser click "button.primary"
  agent-browser click "//button[@type='submit']"
  agent-browser click @e3 --new-tab
```
