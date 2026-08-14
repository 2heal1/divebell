---
name: divebell
description: Use the Divebell CLI to operate, inspect, debug, and verify real web applications; import, export, or reuse browser state; and collect page, Console, Network, compiled JavaScript Debugger, and optional Runtime evidence. Use when the user explicitly requests Divebell, asks to import or export browser state, or needs a Web issue reproduced, diagnosed, or verified through Divebell. Once triggered, perform every browser operation through Divebell.
---

# Divebell

Divebell is an extensible web development and debugging tool for Coding
Agents. It uses real pages as the entry point for browser operations,
diagnostic evidence, and optional Extension capabilities. The Coding Agent
reads and changes code; Divebell manages browser context and page-side
verification evidence.

## Installation

Use the globally installed Divebell CLI. Do not add `@divebell/cli` to the
application being inspected.

If `divebell` is unavailable, install it globally:

```bash
npm install --global @divebell/cli
```

## Browser operation rule

When the user explicitly requests Divebell, use Divebell for every browser
operation in the task, including:

- Opening and navigating pages.
- Reading page content and actionable elements.
- Clicking, filling, focusing, selecting, and pressing keys.
- Evaluating scripts and waiting for page conditions.
- Reading Console, Network, Debugger, and optional Runtime evidence.
- Taking screenshots and verifying page results.

Do not mix Divebell with another browser automation tool in the same workflow.
Keep the page, browser context, session, and verification evidence inside
Divebell.

Discover commands from the installed CLI:

```bash
divebell --help
divebell <command> --help
```

Treat installed help as the source of truth. Do not guess commands or options,
or switch tools because a command is unfamiliar.

## Command output

Divebell orchestration commands such as `setup`, `open`, `stack`, and Extension
management return a JSON envelope:

```json
{
  "status": "ok",
  "data": {},
  "meta": { "version": 1, "command": "stack" }
}
```

- Use `status` to distinguish success, error, and input requests.
- Read command results from `data` and stable failures from `error.code`; do not
  match `message` or `hint` text.
- Direct browser commands may return their own JSON payload or concise text.
  Follow their help and exit code instead of assuming a `status` envelope.
- Do not parse `--help`, `--version`, or `--skill` as JSON.

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
divebell open <url> [--profile <name-or-path> | --state <path>] [--no-default-profile] [--ui] [--timeout <ms>]
```

Divebell opens headlessly by default. Add `--ui` only when the user explicitly
requests a visible window or visible UI is required for the task.

By default, `open` uses the current OS user's most recently used Chrome Profile.
Pass `--no-default-profile` to disable this behavior and use project Restore
State. Use `--profile` or `--state` when the task requires a specific context.

Only when an authorized state-backed retry still fails authentication or
permission verification, read `references/authentication.md`. State inference
must run on the state provider's machine with an explicitly named Profile that
can access the same target. If this machine does not own that Profile, give the
provider the documented `divebell state infer` command instead of running it
locally. Use the returned state JSON path with `divebell open --state` and
verify the same success condition. Never infer a Profile-backed failure or a
plain 404 without authentication evidence.

Continue every browser operation through Divebell.

### 3. Identify the page stack

If the user already named an installed Extension command, skip detection and
inspect that command directly. Otherwise run:

```bash
divebell stack
```

`data.detections` is the source of truth for loaded Extension `detectStack`
hooks. Each result identifies its `extension` and top-level `command`. An empty
result is valid and does not prove that the page is broken or that a framework
is absent. Also inspect `data.failures`.

`stack` does not detect frameworks without an installed detector or recommend
uninstalled Extensions. See `references/extensions.md` for result fields and
Extension management.

### 4. Use the required capability

For a relevant detection, inspect its command first:

```bash
divebell <command> --help
```

If the command has an attached Skill, print its path and read that `SKILL.md`
in full before using the command:

```bash
divebell <command> --skill
```

The command Skill governs only that Extension subtask. When several detections
exist, use only the one relevant to the user's goal.

If no detector matches, or ordinary browser diagnostics are sufficient, use
the smallest built-in command discovered from `divebell --help`.

Install an uninstalled Extension only when the user, project, or trusted
documentation identifies the package. Then rerun `divebell stack --refresh`.
Do not use the removed `recommendedExtensions` field.

For compiled JavaScript control flow, pause stacks, or runtime expressions,
inspect the installed `debug` help first. Do not pass source or Source Map
locations as compiled Chromium Debugger locations.

Do not add Runtime SDK integration to an application merely to inspect it.
Without the Runtime SDK, use page results, Console, Network, screenshots, and
relevant Extensions.

## References

- Read `references/authentication.md` for explicit Profile/state workflows,
  the auth vault, or provider-side state inference after verified access
  failure.
- Read `references/extensions.md` for Extension detection, installation,
  management, and command Skills.

Extension development and Runtime SDK integration belong to their dedicated
Skills.
