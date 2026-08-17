# `browser.raw`: `set`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["set", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser set - Configure browser settings

Usage: agent-browser set <setting> [args]

Configures various browser settings and emulation options.

Settings:
  viewport <w> <h> [scale]   Set viewport size (scale = deviceScaleFactor, e.g. 2 for retina)
  device <name>              Emulate device (e.g., "iPhone 12")
  geo <lat> <lng>            Set geolocation
  offline [on|off]           Toggle offline mode
  headers <json>             Set extra HTTP headers
  credentials <user> <pass>  Set HTTP authentication
  media [dark|light]         Set color scheme preference
        [reduced-motion]     Enable reduced motion

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser set viewport 1920 1080
  agent-browser set viewport 1920 1080 2    # 2x retina
  agent-browser set device "iPhone 12"
  agent-browser set geo 37.7749 -122.4194
  agent-browser set offline on
  agent-browser set headers '{"X-Custom": "value"}'
  agent-browser set credentials admin secret123
  agent-browser set media dark
  agent-browser set media light reduced-motion
```
