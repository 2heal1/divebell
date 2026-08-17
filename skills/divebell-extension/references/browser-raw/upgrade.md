# `browser.raw`: `upgrade`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["upgrade", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser upgrade - Upgrade to the latest version

Usage: agent-browser upgrade

Detects the current installation method (npm, Homebrew, or Cargo) and runs
the appropriate update command. Displays the version change on success, or
informs you if you are already on the latest version.

Examples:
  agent-browser upgrade
```
