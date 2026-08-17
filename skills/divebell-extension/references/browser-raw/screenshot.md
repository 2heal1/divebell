# `browser.raw`: `screenshot`

Generated from `@divebell/agent-browser@0.34.0-divebell.2`. Do not edit by hand.

Call this command with `browser.raw(["screenshot", ...args])`. The return
type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON
unwrapping, failure handling, and command-specific payload validation.

```text
agent-browser screenshot - Take a screenshot

Usage: agent-browser screenshot [selector] [path]

Captures a screenshot of the current page. If no path is provided,
saves to a temporary directory with a generated filename.
Headless Chromium screenshots hide native scrollbars for consistent image output.
Pass --hide-scrollbars false when launching to keep native scrollbars visible.

Options:
  --full, -f           Capture full page (not just viewport)
  --annotate           Overlay numbered labels on interactive elements.
                       Each label [N] corresponds to ref @eN from snapshot.
                       Prints a legend mapping labels to element roles/names.
                       With --json, annotations are included in the response.
                       Supported on Chromium and Lightpanda.
  --screenshot-dir <path>  Default output directory for screenshots
                       (or AGENT_BROWSER_SCREENSHOT_DIR env)
  --screenshot-quality <0-100>  JPEG quality (0-100, only applies to jpeg format)
                       (or AGENT_BROWSER_SCREENSHOT_QUALITY env)
  --screenshot-format <fmt>  Image format: png (default) or jpeg
                       (or AGENT_BROWSER_SCREENSHOT_FORMAT env)

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser screenshot
  agent-browser screenshot ./screenshot.png
  agent-browser screenshot --full ./full-page.png
  agent-browser screenshot --annotate              # Labeled screenshot + legend
  agent-browser screenshot --annotate ./page.png   # Save annotated screenshot
  agent-browser screenshot --annotate --json       # JSON output with annotations
  agent-browser screenshot --screenshot-dir ./shots # Save to custom directory
  agent-browser screenshot --screenshot-format jpeg --screenshot-quality 80
```
