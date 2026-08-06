---
name: record-divebell-workflow
description: Record a user's manual browser actions and operated elements, review and amend the structured workflow with the user, then generate a confirmed executable JavaScript replay. Select an optional Chrome profile or browser state before recording. Treat voice as supplementary intent and ignore missing audio or denied microphone access.
---

# Record a Divebell workflow

This skill guides an Agent through a workflow in which the user operates a browser manually, reviews the concrete recorded operations, supplements missing actions at a confirmed insertion point, and only then generates a script.
It ships with `@divebell/extension-imitate` and is discoverable through `divebell record --skill`.
The result is a confirmed JavaScript script, not a new skill. Scripts are easier to run, verify, and correct. Wrap the script as a skill only after it is stable.

## Working principles

- Use the globally installed `divebell` command to operate the page. Do not add `@divebell/cli` to the application project.
- Run `divebell record --help` before starting. If the command is unavailable, ask the user to run `npm install --global @divebell/cli`. If `record` is missing, run `divebell extensions add @divebell/extension-imitate`.
- If the CLI or recording command is unavailable, read `references/divebell-cli.md`. Do not fall back to a project-local dependency or a temporarily downloaded CLI.
- Before opening the recording page, explicitly ask whether the workflow needs no authentication, a Chrome Profile, or a browser state. For a Profile, run `divebell profiles`; for state, run `divebell state list`. Show only selectable metadata and let the user confirm one choice. Never combine `--profile` and `--state`.
- By default, run `record start` to prepare recording, then open a visible page with the confirmed authentication argument. Use `divebell open about:blank --ui` only when no URL was supplied. Do not ask whether to enable audio and do not add audio flags. Ignore silence, missing audio, and denied permission.
- Save to the current project's `recordings/` directory by default. Do not ask where to save unless the user specified another location.
- Call stop only after the user says “stop,” “finished,” or “done.”
- `record stop` generates a draft `workflow.json`, not `generated-script.mjs`. Review the setup and every operation with the user. `record confirm --all` generates the script only after everything is confirmed.
- The first recording format saves mouse clicks, input, keyboard events, time relative to recording start, page snapshots, DOM summaries, structured Divebell state, and optional microphone audio. Continuous video is not yet a reliable artifact.
- The browser requests microphone access on a separate recording page and returns to the operation page after the user allows or denies access. Successful capture saves `audio.webm`, `audio-chunks.jsonl`, and `audio-events.jsonl`. Treat unavailable audio or denied access as a normal condition and do not ask the user to retry.
- Preserve intermediate clicks and input in `interactions.jsonl` after navigation, search, or opening a new page. Do not judge the recording only from its final URL.
- Browser interactions are the source of truth for what happened. Treat speech only as intent or expected-result context when `transcript.json` contains non-empty text. Never invent a click, input, or element locator from speech alone.
- After confirmation generates the script, read the script, `workflow.json`, `manifest.json`, `interactions.jsonl`, and `dom-snapshots.jsonl`, then run the script with the required Profile or state to verify it.

## Confirm the CLI

Run this before recording:

```bash
divebell record --help
```

If `divebell` is unavailable, complete the global installation first. If the top-level help does not include `record`, install the recording Extension. Continue only after help can be read, and do not use a project-local CLI.

## Start recording

1. Confirm that no Divebell page is still open. If one is open, run `stop`. Then prepare the recording:

```bash
divebell record start
```

The recording bundle is stored under the current project's `recordings/` directory by default. Read the command's JSON response, confirm that `status` is `prepared`, and save the `output` field. The stop command must use that path. Audio capture is attempted automatically and needs no extra flag.

2. Ask the user which authentication environment the recording needs.

- For a Chrome Profile, run `divebell profiles`, let the user select one, then open with `--profile <name|path>`.
- For browser state, run `divebell state list`, let the user select one, then open with `--state <path>`.
- If authentication is unnecessary, open without either option.

Tell the user that the browser will first show a microphone permission prompt. When the user did not provide a URL, open a visible blank page, adding the confirmed authentication option when needed:

```bash
divebell open about:blank --ui
```

When the user already provided a URL, open it directly:

```bash
divebell open <url> --ui
```

Authenticated examples:

```bash
divebell open <url> --profile "Work" --ui
divebell open <url> --state /path/to/test-account.json --ui
```

`open` injects the Bridge and recording script into the same page launch. Do not pass the URL, Bridge, or display flags to `record start`.
The default workflow page contains a URL form and explicitly identifies the other tab as audio-only. The start-page form itself is not added to the generated workflow.

3. After `open` succeeds, read the recording bundle's `manifest.json` and confirm that `status` changed to `recording`. Tell the user that the browser is ready and that they can begin. Ask them to say “stop,” “finished,” or “done” when complete.
4. Do not close the browser or generate the script before the user finishes.

## After the user finishes

Run:

```bash
divebell record stop --out <start-output-path>
```

This command captures the final Divebell state and page snapshot and generates a draft workflow. It does not generate the executable script yet:

- `manifest.json`
- `runtime.jsonl`
- `page-snapshots.jsonl`
- `dom-snapshots.jsonl`
- `interactions.jsonl`
- `workflow.json`
- `audio.webm`
- `audio-chunks.jsonl`
- `audio-events.jsonl`
- `operations.jsonl`
- `transcript.json`

If stop reports that the current page differs from the recorded page, do not force it or mix data from the new page into the recording. Return to the project and page where recording started, then retry.

Read `transcript.json`. Use it as a source of intent only when `segments` contains non-empty content. Skip it when the status is `not-captured` or the content is empty.

If audio was captured, the user explicitly said they provided spoken context, `segments` is still empty, and `OPENAI_API_KEY` is available, run:

```bash
divebell record transcribe --input <start-output-path>
```

Read `transcript.json` again after transcription. In every other case, continue reviewing the recorded actions even when speech is empty or cannot be transcribed.

Run `divebell record review --input <start-output-path>`. Present setup as step 0 and show every semantic step with its concrete `divebell click`, `fill`, `select`, or `press` command and element evidence. The review output aligns available transcript segments with nearby recorded operations, but browser interactions remain the source of truth. Do not conclude that nothing was recorded merely because the page has no Divebell target; inspect `interactions.jsonl` first.

## Correct or supplement the draft

If the user rejects an unwanted step, remove it explicitly:

```bash
divebell record remove-step --input <path> --step <step-id>
```

If the user says an action is missing after a particular step:

1. Confirm setup and the correct prefix:

```bash
divebell record confirm --input <path> --through <step-id>
```

2. Close the current page, prepare the supplement, and reopen the same start URL with the same authentication mode:

```bash
divebell stop
divebell record amend start --input <path> --after <step-id>
divebell open <start-url> [--profile <value> | --state <value>] --ui
```

3. Replay the confirmed prefix. If the result reports potentially mutating steps, show them to the user and obtain confirmation before adding `--allow-risky-replay`:

```bash
divebell record amend replay --input <path>
divebell record amend replay --input <path> --allow-risky-replay
```

4. Tell the user to perform only the missing action, then stop the supplement:

```bash
divebell record amend stop --input <path>
```

5. Show each proposed element's accessible name, role, label, selector, and checked state. Ask whether it is the intended element. Confirm only after the user agrees:

```bash
divebell record confirm --input <path> --step <supplemental-step-id>
```

The replayed prefix is context only and must not be inserted again. If the user rejects the proposed action, remove it or start another supplement. Use `record amend cancel --input <path>` to abandon an active supplement.

## Confirm and generate

After the user has reviewed the complete sequence, confirm all remaining setup and steps:

```bash
divebell record confirm --input <path> --all
```

This creates `generated-script.mjs`. A recorded Profile or state is a required runtime input, not embedded credentials:

```bash
node <path>/generated-script.mjs --profile "Work"
node <path>/generated-script.mjs --state /path/to/test-account.json
```

Close any existing page before the final replay, run the script with the same account, environment, and user path, and verify the recorded final state.

## Regenerate a script

To regenerate only the script from an already confirmed `.orrec` workflow, run:

```bash
divebell record generate-script --input <path>
```

To write the script to a specific location:

```bash
divebell record generate-script --input <path> --out <script-path>
```

## Script correction rules

- Complete a verifiable JavaScript script first instead of immediately producing a new skill.
- Never bypass review by generating from a draft workflow. Confirmation is what authorizes the final operation sequence and authentication dependency.
- Prefer page-declared `run-action` and `wait-for`. Add `click`, `fill`, or `eval` only when the recording bundle lacks enough actions or targets.
- Read the organized execution sequence and element identification clues from `workflow.json` first. Inspect raw events in `interactions.jsonl` only when necessary. Page context comes from `page-snapshots.jsonl` and `dom-snapshots.jsonl`. When speech is enabled, align `transcript.json` with actions by time.
- If the transcript contains a business-result requirement, such as “get issues closed within the last week and open within the last two weeks, then return them as JSON,” the script must produce that business result rather than only navigating to the page. Prefer reading data from the GitHub page, API, or search results, then output JSON.
- Add an explicit verification point after every business step, such as `wait-for <target-id> ready` or a `snapshot` read.
- Do not rely only on screenshots or DOM text. When the page exposes a Divebell target, use targets, snapshots, or events.
- If the script still contains TODOs, state which steps require another screen recording, typed input, or spoken input.
- Run `generated-script.mjs` with the global `divebell`; do not configure a project-local CLI path.

## When a skill is requested

Only create a skill draft from `generated-script.mjs` and the `.orrec` bundle when the user explicitly asks to turn the workflow into a skill.
Put stable commands and decision rules in `SKILL.md`. Do not copy large amounts of raw JSON from the recording bundle into the skill body.
