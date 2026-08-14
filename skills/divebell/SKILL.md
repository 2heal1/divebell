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

Divebell commands return a JSON envelope:

```json
{
  "status": "ok",
  "data": {},
  "meta": { "version": 1, "command": "stack" }
}
```

- Use `status` to distinguish success, error, and input requests. Read command
  results from `data`.
- On failure, expect `status: "error"` and a nonzero exit code. Use the stable
  `error.code`; do not match `message` or `hint` text.
- Do not parse `--help`, `--version`, `divebell skill`, or Extension `--skill`
  output as JSON.

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
divebell open <url>
```

Divebell opens headlessly by default. Add `--ui` only when the user explicitly
requests a visible window or visible UI is required for the task.

By default, `open` uses the current OS user's most recently used Chrome Profile.
Pass `--no-default-profile` to disable this behavior and use project Restore
State. Use `--profile` or `--state` when the task requires a specific context.
The most recently used Profile is the only implicit selection; never enumerate
Profiles and choose an account for the user.

After every `open`, verify the final URL, navigation or HTTP result, current
account, and the user's success condition. Handle protected-page access in this
order:

1. If access succeeds, continue. Do not create or infer state unless a reusable
   state file is required.
2. If another machine needs a reusable state, first read the **Save a portable
   state** section of `references/authentication.md`. On the state provider's
   machine, open and verify the exact target with an explicitly authorized
   Profile, then run:

   ```bash
   divebell state save <new-state-path> --url <target-url>
   ```

   `data.path` is the saved standard state JSON. Transfer the file through an
   authorized secure channel, then open the exact target on the consumer with
   `divebell open <target-url> --state <consumer-state-path>` and verify it.
3. If access fails and the user has not supplied an authorized state or
   explicitly identified Profile, ask for one. When the user needs a state
   created, follow step 2 instead of trying to log in, enumerating Profiles, or
   choosing an account.
4. Retry the exact target with the supplied state or Profile and repeat the same
   verification. If the state-backed retry succeeds, continue.
5. Only when an authorized **state-backed** retry still has authentication or
   permission failure evidence, read the **Infer missing state sources** section
   of `references/authentication.md`. Run inference on the state provider's
   machine, which must own both the deficient state and an explicitly named
   working Profile:

   ```bash
   divebell state infer <target-url> \
     --state <deficient-state-path> \
     --source-profile <working-profile-name-or-path> \
     [--output <new-state-path>] \
     [--expect-url '<successful-url-glob>'] \
     [--expect-text '<successful-page-text>']
   ```

   Use the exact failing URL for `<target-url>`, the consumer's insufficient
   state for `--state`, and the provider's already signed-in Profile for
   `--source-profile`. Never reuse the input path for `--output`. Supply one or
   both success checks when a 2xx response alone is ambiguous. Read the inferred
   file from `data.path`, transfer it securely, and verify it on the consumer
   with `divebell open <target-url> --state <consumer-state-path>`.
6. Never infer a Profile-backed failure or a plain 404 without authentication
   evidence. If no missing-state evidence exists, or an authorized
   Profile-backed retry still fails, retry once with `--ui`; skip this fallback
   if an earlier attempt already used `--ui`.

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

- Read only the relevant section of `references/authentication.md`: save state
  when a verified Profile-backed session must be made portable; infer state
  only after a verified state-backed access failure; use the auth vault only
  when credentials must be managed explicitly.
- Read `references/extensions.md` for Extension detection, installation,
  management, and command Skills.

Extension development and Runtime SDK integration belong to their dedicated
Skills.
