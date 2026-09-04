---
name: analyze-code-usage
description: Measure, explain, and optimize browser JavaScript usage for a real page with the Divebell Code Usage Extension. Use for code-usage reports, executed or unused code size, chunk/dependency attribution, lazy-loading, first-screen optimization, or chunking decisions.
---

# Code Usage

Use the browser CLI that returned this Skill to connect real execution to
chunks, source files, workspace packages, and dependencies from the same build.
For example, use `divebell` after `divebell code-usage --skill`, and use
`bytedbrowser` after `bytedbrowser code-usage --skill`. Do not mix their
browser sessions or substitute a different browser tool.

Choose one mode before acting:

- **Analyze:** the user wants a report, diagnosis, or opportunity list without
  changing source or chunking. Read [analysis](references/analyze.md) in full.
- **Optimize:** the user asks to change source, lazy loading, routes, imports,
  or chunking. If no trustworthy baseline report exists, read and complete
  [analysis](references/analyze.md) first. Then read
  [first-screen optimization](references/optimize-first-screen.md) in full
  before selecting a code change.

An optimization request uses the same Skill and starts from analysis; it does
not create a second Skill or a separate CLI command. The optimization reference
owns the default 70% first-screen target, state artifact, candidate workflow,
and A/B acceptance rules.
