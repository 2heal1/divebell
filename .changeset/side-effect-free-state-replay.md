---
"@divebell/cli": patch
---

Upgrade the bundled agent-browser build so loading saved state restores local and session storage without contacting saved origins, preventing SSO flows from invalidating freshly restored cookies. The browser package now also installs without an npm lifecycle script.
