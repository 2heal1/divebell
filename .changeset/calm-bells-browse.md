---
"@divebell/cli": patch
---

Use the sandbox-friendly Divebell agent-browser release so browser state can fall back to a writable temporary directory and headless browser launches work in more coding-agent environments. Divebell's own sessions, Extensions, and npm download cache now use the same safe fallback. The setup check also loads a local page before verifying initialization, avoiding a false failure on the browser's initial blank page.
