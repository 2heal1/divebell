# `browser.raw`: `type`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["type", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser type - Type text into an element

Usage: agent-browser type <selector> <text>

Types text into the specified element character by character.
Unlike fill, this does not clear existing content first.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser type "#search" "hello"
  agent-browser type @e2 "additional text"

See Also:
  For typing into contenteditable editors (Lexical, ProseMirror, etc.)
  without a selector, use 'keyboard type' instead:
    agent-browser keyboard type "# My Heading"
```
