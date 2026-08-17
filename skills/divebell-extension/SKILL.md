---
name: divebell-extension
description: Create, modify, review, or verify a Divebell CLI Extension. Use when the task explicitly involves Extension Commands, lifecycle Hooks, detectStack support, Extension dependencies, or a command-provided Skill. Do not use merely to install or invoke an existing Extension.
---

# Divebell Extension Development

Use this Skill for Divebell CLI Extension development.

## References

Before creating or modifying an Extension, read
`references/development.md` in full.

Read the relevant section of `references/api.md` when exact types, fields,
arguments, or return values are needed.

Before using `options.divebell.browser.raw`, read
`references/browser-raw.md` in full. It contains the version-matched
agent-browser command catalog and the raw transport/result contract.

## Workflow

1. Inspect the existing package, entry, Commands, Hooks, tests, and build setup.
2. Define only the Commands, Hooks, dependencies, and command Skills required
   by the task.
3. Design command usage, arguments, options, failure behavior, and page
   requirements before implementing.
4. Keep the Extension entry declarative and load implementations through
   dynamic imports.
5. Validate command input and return structured results or clear errors.
6. Load the Extension locally and verify CLI discovery, command help, failure
   paths, page behavior, Hooks, tests, and package contents.

## Runtime boundary

An Extension may consume an existing Runtime through `options.divebell`.
Use `references/api.md` for the available Runtime-facing APIs and types.

If the task needs to add or change application-side Runtime SDK integration,
install and use the dedicated `divebell-runtime` Skill.

Do not install `@divebell/core` or design Runtime signals under this Skill.

## Completion

Report:

- Which Commands, Hooks, dependencies, or command Skills changed.
- Which validation and real-page checks ran.
- Any checks that could not be completed.
