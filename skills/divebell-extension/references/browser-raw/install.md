# `browser.raw`: `install`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["install", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser install - Install browser binaries

Usage: agent-browser install [--with-deps]

Downloads and installs browser binaries required for automation.

Options:
  -d, --with-deps      Also install system dependencies (Linux only; fails if deps fail)

Examples:
  agent-browser install
  agent-browser install --with-deps
```
