---
name: record-divebell-workflow
description: Record a user's manual browser actions and the operated elements, attempt optional audio capture by default, and generate an executable JavaScript replay that verifies the final page. Ignore missing audio or denied microphone access. Use when the user wants an agent-installable workflow skill for recording browser actions and operated elements, converting the recording into an executable JavaScript replay, or drafting a reusable skill from a manual web workflow with the globally installed divebell command.
---

# Record a Divebell workflow

This skill guides an Agent through a workflow in which the user operates a browser manually while the Agent records it and generates a script.
It ships with `@divebell/extension-imitate` and is discoverable through `divebell record --skill`.
The first version generates a JavaScript script by default, not a skill. Scripts are easier to run, verify, and correct. Wrap the script as a skill only after it is stable.

## Working principles

- Use the globally installed `divebell` command to operate the page. Do not add `@divebell/cli` to the application project.
- Run `divebell record --help` before starting. If the command is unavailable, ask the user to run `npm install --global @divebell/cli`. If `record` is missing, run `divebell extensions add @divebell/extension-imitate`.
- If the CLI or recording command is unavailable, read `references/divebell-cli.md`. Do not fall back to a project-local dependency or a temporarily downloaded CLI.
- By default, run `record start` to prepare recording, then open a visible page with `divebell open about:blank --ui`. The start page clearly tells the user to enter a URL in the address bar. Do not ask whether to enable audio and do not add audio flags. Opening the page proactively requests microphone access on a separate page and returns to the recording start page after the prompt is handled. Ignore silence, missing audio, and denied permission. Do not ask which page to record unless the user already provided a URL.
- Save to the current project's `recordings/` directory by default. Do not ask where to save unless the user specified another location.
- Call stop only after the user says “stop,” “finished,” or “done.”
- `record stop` generates `generated-script.mjs` but does not close the browser. Always run `divebell stop` during cleanup.
- The first recording format saves mouse clicks, input, keyboard events, time relative to recording start, page snapshots, DOM summaries, structured Divebell state, and optional microphone audio. Continuous video is not yet a reliable artifact.
- The browser requests microphone access on a separate recording page and returns to the operation page after the user allows or denies access. Successful capture saves `audio.webm`, `audio-chunks.jsonl`, and `audio-events.jsonl`. Treat unavailable audio or denied access as a normal condition and do not ask the user to retry.
- Preserve intermediate clicks and input in `interactions.jsonl` after navigation, search, or opening a new page. Do not judge the recording only from its final URL.
- Treat speech as a source of user intent only when `transcript.json` contains non-empty text. When it does not, continue generating and verifying the script from screen actions without asking follow-up questions or blocking.
- After generating the script, read the script, `workflow.json`, `manifest.json`, `interactions.jsonl`, and `dom-snapshots.jsonl`, then run the script to verify it.

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

2. Before running `open`, tell the user that the browser will first show a microphone permission prompt and will then move to the recording start page. When the user did not provide a URL, open a visible blank page. If the project needs a specific Bridge, add `--bridge <url>` or `--port <port>` to this `open` command:

```bash
divebell open about:blank --ui
```

When the user already provided a URL, open it directly:

```bash
divebell open <url> --ui
```

`open` injects the Bridge and recording script into the same page launch. Do not pass the URL, Bridge, or display flags to `record start`.
The default blank page says, “Enter a URL in the address bar to start recording web actions,” so the user never faces an unexplained blank page.

3. After `open` succeeds, read the recording bundle's `manifest.json` and confirm that `status` changed to `recording`. Tell the user that the browser is ready and that they can begin. Ask them to say “stop,” “finished,” or “done” when complete.
4. Do not close the browser or generate the script before the user finishes.

## After the user finishes

Run:

```bash
divebell record stop --out <start-output-path>
```

This command captures the final Divebell state and page snapshot and generates these files in the recording bundle:

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
- `generated-script.mjs`

After stop succeeds, close the browser through the standard page workflow:

```bash
divebell stop
```

If stop reports that the current page differs from the recorded page, do not force it or mix data from the new page into the recording. Return to the project and page where recording started, then retry.

Read `manifest.json`, `interactions.jsonl`, `workflow.json`, and `generated-script.mjs`. Confirm that the manifest `status` is `completed` and that the workflow contains recorded input, selections, key presses, and clicks in order. Run `generated-script.mjs` and confirm that it reaches the page state captured at the end. Do not conclude that nothing was recorded merely because the page has no Divebell target; inspect `interactions.jsonl` first.

Read `transcript.json`. Use it as a source of intent only when `segments` contains non-empty content. Skip it when the status is `not-captured` or the content is empty.

If audio was captured, the user explicitly said they provided spoken context, `segments` is still empty, and `OPENAI_API_KEY` is available, run:

```bash
divebell record transcribe --input <start-output-path>
```

Read `transcript.json` again after transcription. In every other case, continue generating and replaying the script even when speech is empty or cannot be transcribed.

## Regenerate a script

To regenerate only the script from an existing `.orrec` recording bundle, run:

```bash
divebell record generate-script --input <path>
```

To write the script to a specific location:

```bash
divebell record generate-script --input <path> --out <script-path>
```

## Script correction rules

- Complete a verifiable JavaScript script first instead of immediately producing a new skill.
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
