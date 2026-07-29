# @divebell/extension-imitate

This Divebell Extension records a real browser walkthrough and turns the captured interactions, operated elements, page context, and Runtime state into an executable JavaScript replay. Spoken intent is optional supplementary context.

## Install

```bash
divebell extensions add @divebell/extension-imitate
```

## Record a manual walkthrough

Prepare the recording first so browser interaction capture is active from page startup. The output defaults to `./recordings`; microphone narration is optional and is not required to generate a replayable script:

```bash
divebell record start
```

Add `--mic` only when spoken context would help explain the intended result.

Then open the page through Divebell. The CLI starts and injects the Bridge while the recording Extension injects its page capture script into the same browser launch:

```bash
divebell open https://example.com/ --ui
```

The guided workflow can use `about:blank` when no URL is provided, and the output path is optional. When the walkthrough is finished, stop the recording with the output path returned by `start`:

```bash
divebell record stop --out ./recordings/divebell-<timestamp>.orrec
```

Stopping captures final state and writes both `workflow.json` and `generated-script.mjs` by default. `workflow.json` keeps the ordered actions and multiple recorded ways to find each operated element so an Agent can inspect or rearrange the workflow. The generated script waits for each recorded element, replays the action with native browser commands, and verifies the final page state. It leaves the current page open; close it through the normal page lifecycle when the workflow is complete:

```bash
divebell stop
```

Recording preparation refuses to replace an already open page. Close the current page first, prepare the recording, and then open the page to record. Stopping refuses to mix evidence if another `divebell open` replaced the recorded page.

## Regenerate or transcribe

Regenerate a script from an existing recording:

```bash
divebell record generate-script \
  --input ./recordings/example.orrec \
  --out ./scripts/example.mjs
```

When microphone audio exists, create timestamped text with:

```bash
OPENAI_API_KEY=... divebell record transcribe \
  --input ./recordings/example.orrec
```

The default transcription model is `whisper-1`; use `--model` to select another compatible model. Do not treat a script that only opens the last URL as complete when recorded audio has not been transcribed.

Audio is supplementary. A recording without audio still produces a complete browser replay when the intended result is the demonstrated sequence itself.

## Fixed-duration capture

For an unattended time-bounded recording:

```bash
divebell open https://example.com/ --ui
divebell record \
  --out ./recordings/example.orrec \
  --duration 30000
divebell stop
```

For an Agent-guided installation and workflow, see the [English guide](../../docs/record-browser-workflows.md) or [中文指南](../../docs/record-browser-workflows.zh-CN.md).

## Replay verification

Run the real-browser recording and replay check with:

```bash
pnpm --filter @divebell/extension-imitate test:replay-e2e
```

The check records input, dropdown selection, and a click on a local page, generates the JavaScript file, replays it in a new browser session, and verifies the resulting page.
