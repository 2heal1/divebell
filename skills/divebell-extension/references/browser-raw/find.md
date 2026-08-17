# `browser.raw`: `find`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["find", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser find - Find and interact with elements by locator

Usage: agent-browser find <locator> <value> [action] [text]

Finds elements using semantic locators and optionally performs an action.

Locators:
  role <role>              Find by ARIA role (--name <n>, --exact)
  text <text>              Find by text content (--exact)
  label <label>            Find by associated label (--exact)
  placeholder <text>       Find by placeholder text (--exact)
  alt <text>               Find by alt text (--exact)
  title <text>             Find by title attribute (--exact)
  testid <id>              Find by data-testid attribute
  first <selector>         First matching element
  last <selector>          Last matching element
  nth <index> <selector>   Nth matching element (0-based)

Actions (default: click):
  click, fill, check, hover, text

Options:
  --name <name>        Filter role by accessible name
  --exact              Exact, case-sensitive match. For role it applies to
                       the accessible name, whose default is a case-insensitive
                       substring. The role value itself always ignores case.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser find role button click --name Submit
  agent-browser find text "Sign In" click
  agent-browser find label "Email" fill "user@example.com"
  agent-browser find placeholder "Search..." fill "query"
  agent-browser find testid "login-form" click
  agent-browser find first "li.item" click
  agent-browser find nth 2 ".card" hover
  agent-browser find role heading text --name Welcome
```
