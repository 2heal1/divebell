---
name: divebell
description: Use Divebell to operate, inspect, debug, and verify real web applications. Use when the user explicitly asks to use Divebell or requires evidence from a real page through the Divebell CLI. While using Divebell, perform all browser operations through Divebell instead of another browser tool.
---

# Divebell

Divebell is an extensible toolkit for Coding Agents to debug, understand, and
verify real web applications. It makes the real page the Agent's entry point
and connects browser operations, diagnostic evidence, and optional Extension
capabilities.

## Installation

Use the globally installed Divebell CLI. Do not add `@divebell/cli` to the
application being inspected.

If the `divebell` command is unavailable, install it globally:

```bash
npm install --global @divebell/cli
```

## Browser operation rule

When the user explicitly requests Divebell, use Divebell for every browser
operation in that task.

This includes:

- Opening and navigating pages.
- Reading page content and actionable elements.
- Clicking, filling, focusing, selecting, and pressing keys.
- Evaluating page scripts and waiting for page conditions.
- Reading Console and Network evidence.
- Taking screenshots and verifying page results.

Do not mix Divebell with another browser automation tool in the same workflow.
Keep the page, authentication state, browser session, and verification evidence
inside the Divebell-managed context.

When an operation is needed, discover the corresponding Divebell command from:

```bash
divebell --help
divebell <command> --help
```

Treat the installed CLI help as the source of truth. Do not guess commands or
options, and do not switch to another browser tool because a command is
unfamiliar.

## Workflow

### 1. Prepare the environment

Run:

```bash
divebell setup
```

`setup` checks the local environment and repairs browser startup only when
needed.

### 2. Open the target and establish authorized access

Run:

```bash
divebell open <url> [--state <path> | --profile <name-or-path>] [--ui] [--timeout <ms>]
```

Divebell opens headlessly by default. Add `--ui` on the first attempt when the
user or task requires a visible browser. Use `--timeout` to override the
default 60-second navigation lifecycle wait for one `open` command. Reuse the
current page when it already has the correct URL, account, and environment.

After every open, verify the final URL, navigation or HTTP result, and the
user's success condition. Then follow this order:

1. If access succeeds, continue. Do not diagnose state or reopen with `--ui`.
2. If authentication or permission is required and the user has not supplied
   authorized state or a Profile, ask the user to provide or explicitly
   authorize one. Never choose a Profile on the user's behalf.
3. Retry the exact target with the supplied state or Profile and verify it
   again.
4. If an authorized **state-backed** retry still fails, read
   `references/authentication.md`, inspect `divebell state diagnose --help`,
   and run diagnosis. Report any sanitized candidates and evidence; do not
   modify or expand the state automatically. Never run `state diagnose` for a
   Profile-backed open.
5. If state diagnosis finds no missing-state evidence, or an explicitly
   authorized Profile-backed retry still fails, retry once with `--ui`. Skip
   this fallback when any earlier attempt already used `--ui`.

A plain 404 without authentication evidence is not an authorization failure
and must not trigger state diagnosis.

### 3. Discover and use the required capability

If the user explicitly names an installed Extension command, skip stack
detection and inspect that command directly:

```bash
divebell <command> --help
```

Otherwise, first inspect the detections from installed Extensions:

```bash
divebell stack
```

`stack` runs `detectStack` hooks from installed Extensions only. Check both
`data.detections` and `failures`. When a relevant detection provides `command`,
inspect that command before use:

```bash
divebell <command> --help
```

If the command reports an attached Skill, print its path with
`divebell <command> --skill` and read that `SKILL.md` in full before invoking
the command. The attached Skill governs only that Extension subtask.

If no installed detector matches, inspect `divebell --help` and use the
smallest built-in command that satisfies the task. An empty detection result is
valid; it does not mean the page is broken or prove that no framework is
present.

Do not guess a framework command, run every detected command, or use the
removed `recommendedExtensions` field. Read `references/extensions.md` only
when the task genuinely requires installing or managing an Extension. After
installing a user-, project-, or documentation-identified trusted Extension,
rerun `divebell stack --refresh`.

## Reference

Read `references/extensions.md` only when the task needs to install, manage,
discover, or use an Extension.

Read `references/authentication.md` only when a protected-page state must be
created or when an authorized state-backed retry has failed authentication or
permission verification. Do not diagnose a Profile or use state diagnosis as a
routine preflight.

Extension development and Runtime SDK integration are outside this Skill and
should be handled by their own dedicated Skills.
