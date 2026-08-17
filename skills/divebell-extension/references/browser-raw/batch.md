# `browser.raw`: `batch`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["batch", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser batch - Execute multiple commands sequentially

Usage: agent-browser batch [options] "<cmd1>" "<cmd2>" ...
       echo '<json>' | agent-browser batch [options]

Runs multiple commands in sequence. Commands can be passed as quoted
arguments or piped as JSON via stdin. Results are printed in order,
separated by blank lines (or as a JSON array with --json).

Options:
  --bail               Stop on first error (default: continue all commands)
  --json               Output results as a JSON array

Argument Mode:
  Each quoted argument is a full command string:
  agent-browser batch "open https://example.com" "snapshot -i" "screenshot"

Stdin Mode (JSON):
  A JSON array of string arrays. Each inner array is one command:
  [
    ["open", "https://example.com"],
    ["snapshot", "-i"],
    ["click", "@e1"],
    ["fill", "@e2", "test@example.com"],
    ["screenshot", "result.png"]
  ]

Examples:
  agent-browser batch "open https://example.com" "screenshot"
  agent-browser batch --bail "open https://example.com" "click @e1" "screenshot"
  echo '[["open", "https://example.com"], ["snapshot"]]' | agent-browser batch
  agent-browser batch --bail < commands.json
```
