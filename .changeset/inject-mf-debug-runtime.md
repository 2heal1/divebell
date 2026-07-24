---
"@openruntime/extension-mf": minor
---

Inject the matching Module Federation preview Runtime Core constructor and global Observability Plugin before navigation by default, with `--mf-debug=false` to disable the behavior. Return structured MF command results by default, keep `mf status` focused on compact instance and consumer facts, and expose loaded global shared dependencies by scope. Shared `lib` and `get` values now include their generated bundle file by default; `--verbose` also includes unloaded entries, bounded function source text, precise generated positions, and original source positions when Source Maps are available.
