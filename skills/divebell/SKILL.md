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

### 2. Open the target page

Run:

```bash
divebell open <url> [--timeout <ms>]
```

After opening the page, continue all browser operations through Divebell.
Use `--timeout` to override the default 60-second navigation lifecycle wait for
one `open` command.
Reuse the current Divebell page when it already has the correct URL, account,
and environment.

When the user supplies a state file, first open the target normally with that
state and verify the final URL plus the task's expected page or HTTP result. If
access succeeds, continue the task and do not run state diagnosis. Only after a
login redirect, 401/403, a clear signed-out or permission page, a 404 with
authentication evidence, or a suspicious first-navigation failure, read
`references/authentication.md` and follow its post-failure state diagnosis
workflow. A plain 404 without authentication evidence is not proof that state
is missing.

### 3. Use the required Divebell capability

Use `divebell --help` to find the smallest built-in or installed Extension
command that matches the user's task:

```bash
divebell --help
divebell <command> --help
```

A matching Extension is not required for ordinary page interaction or browser
diagnostics. Use built-in Divebell commands for those operations.

Do not run stack detection merely because a page was opened.

## Optional: discover installed Extension capabilities

Run stack detection only when the task needs a framework-specific or other
Extension-provided capability, or when identifying an installed Extension that
matches the current page would help select the next command.

```bash
divebell stack
```

`stack` runs `detectStack` hooks from **installed Extensions only**. Divebell
does not detect frameworks by itself and `stack` does not discover or recommend
Extensions that are not installed.

If no installed Extension contributes a matching detector, the result can
contain:

```json
{
  "data": {
    "detections": [],
    "failures": [],
    "cached": false
  }
}
```

This is a valid result. It does not mean the page is broken, and it does not
prove that the page uses no recognizable framework. It only means that the
currently installed detectors returned no match.

A matched result may look like:

```json
{
  "data": {
    "detections": [
      {
        "id": "modernjs",
        "name": "Modern.js",
        "extension": "modern-detector",
        "command": "mf"
      }
    ],
    "failures": [],
    "cached": false
  }
}
```

Use `data.detections` as the source of truth:

- `id` identifies the detection.
- `name` describes the detected technology or capability.
- `extension` identifies the installed Extension that produced the detection.
- `command` is the top-level Divebell command provided by that Extension.
- `failures` contains detector failures and must be checked.
- `cached` indicates whether Divebell reused a compatible previous result.

Do not guess a framework command. Do not use or expect the removed
`recommendedExtensions` field.

## Optional: use a detected Extension command

Continue to this step only when `data.detections` contains a detection relevant
to the user's task and that detection provides `command`.

Inspect the command first:

```bash
divebell <command> --help
```

If the command reports an attached Skill, print its path:

```bash
divebell <command> --skill
```

Read the returned `SKILL.md` in full before invoking that command. The
command-provided Skill governs only that Extension subtask; return to the
user's original workflow after it completes.

Then run the required command or subcommand exactly as documented by the
installed help and command Skill.

When multiple detections are returned, choose the one whose detection and
command description match the current goal. Do not run every detected command.

When no matching detection exists:

- Continue with built-in Divebell commands if they can complete the task.
- Read `references/extensions.md` only when the task genuinely requires an
  Extension-specific capability.
- Install only a trusted Extension identified by the user, the project, or
  trusted Divebell documentation.
- After installing an Extension, rerun:

```bash
divebell stack --refresh
```

## Reference

Read `references/extensions.md` only when the task needs to install, manage,
discover, or use an Extension.

Read `references/authentication.md` only when a protected-page state must be
created or when a normal state-backed open has already failed authentication
or permission verification. Do not use state diagnosis as a routine preflight.

Extension development and Runtime SDK integration are outside this Skill and
should be handled by their own dedicated Skills.
