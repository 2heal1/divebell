---
"@divebell/cli": patch
---

Keep the bundled agent-browser daemon under Divebell's own home directory by default, preventing other installed browser clients from making Divebell reuse an older background binary. An explicit `AGENT_BROWSER_HOME` continues to take precedence.
