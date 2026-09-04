---
"@divebell/extension-mf": patch
---

Remove unsupported Bridge commit observation from state parsing and trace
output. Current MF observability does not expose that lifecycle signal, so its
absence no longer blocks unrelated commands such as `module-perf`.
