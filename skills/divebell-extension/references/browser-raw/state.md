# `browser.raw`: `state`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["state", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser state - Manage browser state

Usage: agent-browser state <operation> [args]

Save, restore, list, and manage browser state (cookies, localStorage, sessionStorage).

Operations:
  save <path> [--include-origin <url>]...
                                     Save state and collect additional origins
  load <path>                        Load state from file
  list                               List saved state files
  show <filename>                    Show state summary
  rename <old-name> <new-name>       Rename state file
  clear [session-name] [--all]       Clear saved states
  clean --older-than <days>          Delete expired state files

Automatic State Persistence:
  Use --restore to auto-save/restore state across restarts:
  agent-browser --session myapp --restore open https://example.com
  Or set AGENT_BROWSER_RESTORE environment variable.

State Encryption:
  Set AGENT_BROWSER_ENCRYPTION_KEY (64-char hex) for AES-256-GCM encryption.
  Generate a key: openssl rand -hex 32

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser state save ./auth-state.json
  agent-browser state save ./sso-state.json --include-origin https://sso.example.com
  agent-browser state load ./auth-state.json
  agent-browser state list
  agent-browser state show myapp-default.json
  agent-browser state rename old-name new-name
  agent-browser state clear --all
  agent-browser state clean --older-than 7
```
