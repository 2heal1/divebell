# `browser.raw`: `snapshot`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["snapshot", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser snapshot - Get accessibility tree snapshot

Usage: agent-browser snapshot [options]

Returns an accessibility tree representation of the page with element
references (like @e1, @e2) that can be used in subsequent commands.
Designed for AI agents to understand page structure.

Options:
  -i, --interactive    Only include interactive elements
  -u, --urls           Include href URLs for link elements
  -c, --compact        Remove empty structural elements
  -d, --depth <n>      Limit tree depth
  -s, --selector <sel> Scope snapshot to CSS selector

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser snapshot
  agent-browser snapshot -i
  agent-browser snapshot -i --urls
  agent-browser snapshot --compact --depth 5
  agent-browser snapshot -s "#main-content"
```
