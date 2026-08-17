# `browser.raw`: `device`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["device", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser device - Manage iOS simulators

Usage: agent-browser device <subcommand>

Subcommands:
  list    List available iOS simulators

Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser device list
  agent-browser -p ios device list
```
