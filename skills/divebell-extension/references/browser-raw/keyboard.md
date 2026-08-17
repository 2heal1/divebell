# `browser.raw`: `keyboard`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["keyboard", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser keyboard - Raw keyboard input (no selector needed)

Usage: agent-browser keyboard <subcommand> <text>

Sends keyboard input to whatever element currently has focus.
Unlike 'type' which requires a selector, 'keyboard' operates on
the current focus — essential for contenteditable editors like
Lexical, ProseMirror, CodeMirror, and Monaco.

Subcommands:
  type <text>          Type text character-by-character with real
                       key events (keydown, keypress, keyup per char)
  inserttext <text>    Insert text without key events (like paste)

Note: For key combos (Enter, Control+a), use the 'press' command
directly — it already operates on the current focus.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser keyboard type "Hello, World!"
  agent-browser keyboard type "# My Heading"
  agent-browser keyboard inserttext "pasted content"

Use Cases:
  # Type into a Lexical/ProseMirror contenteditable editor:
  agent-browser click "[contenteditable]"
  agent-browser keyboard type "# My Heading"
  agent-browser press Enter
  agent-browser keyboard type "Some paragraph text"
```
