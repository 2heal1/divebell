---
"@divebell/extension-mf": patch
---

Accept Bridge runtime state from MF versions that do not expose an
`afterBridgeCommit` hook. A missing `commitObserved` field now means that no
commit signal was observed and no longer blocks unrelated MF commands such as
`module-perf`.
