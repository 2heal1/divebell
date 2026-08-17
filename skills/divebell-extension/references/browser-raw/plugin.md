# `browser.raw`: `plugin`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["plugin", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser plugin - Manage configured plugins

Usage: agent-browser plugin [subcommand]

Subcommands:
  add <ref>                Add a plugin from npm or GitHub
  list                     List configured plugins (default)
  show <name>              Show one configured plugin
  run <name> <type>        Run a command.run or custom plugin request

Plugins are configured in agent-browser.json. A plugin entry declares a name,
an executable command, optional args, and capabilities. Plugins run as
external processes over the agent-browser.plugin.v1 stdio JSON protocol.

Add sources:
  <name>                   npm package, e.g. agent-browser-plugin-captcha
  @<scope>/<name>          scoped npm package
  <owner>/<repo>           GitHub repository

Add options:
  --name <name>            Override the configured plugin name
  --capability <name>      Declare a capability if the plugin has no manifest
  --global                 Write user config under AGENT_BROWSER_HOME instead of ./agent-browser.json
  --no-manifest            Skip plugin.manifest discovery

plugin add asks the package for plugin.manifest to discover name and
capabilities. Use --capability when adding older plugins without a manifest.

Capabilities:
  credential.read          Resolve credentials for auth login
  browser.provider         Launch/connect an external browser provider
  launch.mutate            Append local launch args, extensions, or init scripts
  command.run              Accept arbitrary namespaced plugin requests

Core capabilities and protocol request types use dedicated command paths.
Use auth login for credential.read, --provider for browser.provider, and
a local launch for launch.mutate.

Example config:
  {{
    "plugins": [
      {{
        "name": "vault",
        "command": "agent-browser-plugin-vault",
        "capabilities": ["credential.read"]
      }}
    ]
  }}

Examples:
  agent-browser plugin add agent-browser-plugin-captcha
  agent-browser plugin add org/agent-browser-plugin-cloud-browser
  agent-browser plugin add @company/agent-browser-plugin-vault --name vault
  agent-browser plugin list
  agent-browser plugin show vault
  agent-browser plugin run captcha captcha.solve --payload '{{"siteKey":"...","url":"https://example.com"}}'
  agent-browser auth login my-app --credential-provider vault --item "My App"
  agent-browser --provider cloud-browser open https://example.com
```
