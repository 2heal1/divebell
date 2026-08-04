---
"@divebell/cli": patch
---

Allow URL-scoped state exports to repeat `--include-url` for related SSO origins, preserving matching cookies and web storage while keeping unrelated browser state out of the portable file. Upgrade the bundled agent-browser build so cookie partition metadata and explicitly included origins round-trip correctly.
