---
"@divebell/cli": patch
"@divebell/extension-code-usage": patch
"@divebell/extension-imitate": patch
"@divebell/extension-memory": patch
"@divebell/extension-rstack": patch
---

Add typed Extension browser APIs for tabs and browser diagnostics, constrain `browser.raw` to the current Divebell page and Extension-safe commands, and migrate bundled Extensions to the typed APIs while retaining raw CDP access only where required.
