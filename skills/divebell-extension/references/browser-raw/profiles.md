# `browser.raw`: `profiles`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["profiles", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser profiles - List available Chrome profiles

Usage: agent-browser profiles

Lists all Chrome profiles found in your Chrome user data directory, showing
the directory name and display name for each profile. Use the directory name
with --profile to launch Chrome with that profile's login state.

Global Options:
  --json               Output as JSON

Examples:
  agent-browser profiles
  agent-browser profiles --json
  agent-browser --profile Default open https://gmail.com
```
