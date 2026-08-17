# `browser.raw`: `doctor`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["doctor", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser doctor - Diagnose and repair your install

Usage: agent-browser doctor [options]

Runs a battery of checks across environment, Chrome install, daemon state,
config files, encryption key, providers, network reachability, and a live
headless browser launch test.

Auto-cleans stale daemon socket/pid/version sidecar files. Destructive
repairs (reinstalling Chrome, purging old state files, generating a missing
encryption key) are gated behind --fix.

Options:
  --offline            Skip network probes
  --quick              Skip the live headless launch test
  --webgpu             Also run a live WebGPU render probe (renders via a real
                       WebGPU pass and pixel-checks both an in-page readback
                       and a decoded screenshot; launches a second Chrome)
  --headed             Run the WebGPU probe headed to validate the capture
                       path (auto-Xvfb on displayless Linux)
  --debug              Verbose diagnostics from the probes' scratch daemons
  --fix                Also run destructive repairs
  --json               JSON output

Exit codes:
  0  All checks pass (warnings OK)
  1  At least one check failed

Examples:
  agent-browser doctor
  agent-browser doctor --offline --quick
  agent-browser doctor --webgpu
  agent-browser doctor --webgpu --headed
  agent-browser doctor --fix
  agent-browser doctor --json
```
