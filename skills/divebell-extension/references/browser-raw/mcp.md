# `browser.raw`: `mcp`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["mcp", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser mcp - Start an MCP stdio server

Usage: agent-browser mcp [--tools <profiles>]

Starts a Model Context Protocol server over stdio. MCP clients launch this
command as a subprocess and communicate with newline-delimited JSON-RPC.
stdout is reserved for MCP protocol messages; logs and diagnostics use stderr.
The server defaults to MCP protocol 2025-11-25 and accepts older supported
client protocol versions during initialization.

The default tools profile is core, which keeps MCP context small for everyday
browser automation. Use --tools all for the full typed CLI parity surface, or
combine profiles with commas, such as --tools core,network,react.

Tool profiles:
  core       Default. Navigation, snapshots, interaction, waits, reads,
             screenshots, JavaScript eval, close, tab basics, and profile discovery
  network    Network routes, request inspection, HAR, headers, credentials, offline
  state      Cookies, storage, auth, saved state, sessions, profiles, skills
  debug      Console/errors, tracing, profiling, recording, accessibility audits,
             clipboard, plugins, doctor, dashboard, install, upgrade, chat, diff,
             batch, confirm/deny
  tabs       Back/forward/reload, tabs, windows, frames, dialogs
  react      React tree/inspect/renders/suspense, vitals, pushstate
  mobile     Viewport/device/geolocation/media, touch, swipe, mouse, keyboard
  all        Every MCP tool, including the full typed CLI parity surface

Common tools include:
  agent_browser_tools_profiles  List MCP startup tool profiles
  agent_browser_open       Open a URL or launch about:blank
  agent_browser_snapshot   Get an accessibility snapshot with refs
  agent_browser_click      Click an element by @ref or selector
  agent_browser_fill       Fill an input
  agent_browser_screenshot Take a screenshot
  agent_browser_get_url    Read the current URL
  agent_browser_close      Close the browser session

Each tool has typed fields such as url, selector, text, key, and session.
Each tool also accepts extraArgs for advanced CLI flags and exact CLI parity.
Tool discovery is paginated and includes read-only/open-world annotations so
modern MCP clients can load the large typed surface incrementally.
Use agent_browser_snapshot after navigation to get fresh refs before clicking.

MCP client config example:
  {
    "mcpServers": {
      "agent-browser": {
        "command": "agent-browser",
        "args": ["mcp"]
      }
    }
  }

Full parity config example:
  {
    "mcpServers": {
      "agent-browser": {
        "command": "agent-browser",
        "args": ["mcp", "--tools", "all"]
      }
    }
  }

Environment:
  AGENT_BROWSER_SESSION          Default browser session
  AGENT_BROWSER_HOME             Agent-browser config, state, cache, and daemon directory
  AGENT_BROWSER_SOCKET_DIR       Daemon socket directory
  AGENT_BROWSER_CONFIG           Config file loaded by tool invocations
```
