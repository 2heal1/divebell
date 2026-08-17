# `browser.raw`: `skills`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["skills", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser skills - List and retrieve bundled skill content

Usage: agent-browser skills [subcommand] [options]

Subcommands:
  list                       List all available skills (default)
  get <name> [name...]       Output a skill's full content
  get <name> --full          Include references and templates
  get --all                  Output every skill
  path [name]                Print filesystem path to skill directory

Options:
  --json                     Output as JSON

The skills command serves bundled skill content that always matches the
installed CLI version. Agents should use this to get current instructions
rather than relying on cached copies.

Examples:
  agent-browser skills
  agent-browser skills list
  agent-browser skills get core
  agent-browser skills get core --full
  agent-browser skills get electron --full
  agent-browser skills get --all
  agent-browser skills path core
  agent-browser skills list --json

Environment:
  AGENT_BROWSER_SKILLS_DIR   Override the skills directory path
```
