# `browser.raw`: `auth`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["auth", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser auth - Manage authentication profiles

Usage: agent-browser auth <subcommand> [args]

Subcommands:
  save <name>              Save credentials for a login profile
  login <name>             Login using saved credentials (waits for form fields)
  list                     List saved profiles (names and URLs only)
  show <name>              Show profile metadata (no passwords)
  delete <name>            Delete a saved profile

Save Options:
  --url <url>              Login page URL (required)
  --username <user>        Username (required)
  --password <pass>        Password (required unless --password-stdin)
  --password-stdin          Read password from stdin (recommended)
  --username-selector <s>  Custom CSS selector for username field
  --password-selector <s>  Custom CSS selector for password field
  --submit-selector <s>    Custom CSS selector for submit button

Plugin Login Options:
  --credential-provider <p> Resolve credentials from configured plugin <p>
  --item <ref>              Provider-specific vault item reference
  --url <url>               Login URL override
  --username-selector <s>   Username selector override for this login
  --password-selector <s>   Password selector override for this login
  --submit-selector <s>     Submit selector override for this login

Login behavior:
  auth login waits for form selectors to appear before filling/clicking.
  Selector wait timeout follows the default action timeout.
  Plugin credentials are resolved just-in-time and are not saved locally.

Global Options:
  --json                   Output as JSON
  --session <name>         Use specific session

Examples:
  echo "pass" | agent-browser auth save github --url https://github.com/login --username user --password-stdin
  agent-browser auth save github --url https://github.com/login --username user --password pass
  agent-browser auth login github
  agent-browser auth login my-app --credential-provider vault --item "My App"
  agent-browser auth list
  agent-browser auth show github
  agent-browser auth delete github
```
