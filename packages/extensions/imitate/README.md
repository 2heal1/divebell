# @divebell/extension-imitate

This Divebell Extension records a real browser walkthrough, lets the user review or supplement the captured operations and authentication setup, and only then turns the confirmed workflow into an executable JavaScript replay. It also tries to capture spoken intent, but voice is always supplementary and missing or denied audio is ignored.

## Install

```bash
divebell extensions add @divebell/extension-imitate
divebell record --skill
```

The second command prints the path to the Agent skill shipped inside the Extension package without starting a recording.

## Record a manual walkthrough

Prepare the recording first so browser interaction and optional voice capture are active from page startup. The output defaults to `./recordings`:

```bash
divebell record start
```

The command tries to start microphone capture automatically. If the user does not speak, the browser cannot capture audio, or microphone permission is denied, recording continues with browser actions only.

Then open the page through Divebell. Choose at most one explicit authentication environment when the page is protected. The CLI starts and injects the Bridge while the recording Extension injects its page capture script into the same browser launch:

```bash
divebell open https://example.com/ --ui
divebell open https://example.com/ --profile "Work" --ui
divebell open https://example.com/ --state /path/to/test-account.json --ui
```

The guided workflow can use `about:blank` when no URL is provided, and the output path is optional. In that flow, Divebell opens a clearly named workflow tab with a URL form and a separate audio-only tab. Paste the target URL and perform all actions in the workflow tab; keep the audio tab open in the background without navigating it. When the walkthrough is finished, stop the recording with the output path returned by `start`:

```bash
divebell record stop --out ./recordings/divebell-<timestamp>.orrec
```

Stopping captures final state and writes a draft `workflow.json`. It keeps step 0 authentication setup, ordered actions, confirmation state, revisions, and multiple recorded ways to find each operated element. Review it before generating a script:

```bash
divebell record review --input ./recordings/example.orrec
divebell record confirm --input ./recordings/example.orrec --all
```

The last command writes `generated-script.mjs` only after every setup item and action is confirmed. The generated script requires the recorded authentication mode as a runtime input and does not embed the selected state path or its contents:

```bash
node ./recordings/example.orrec/generated-script.mjs --state /path/to/test-account.json
```

The workflow remains a factual replay of reviewed browser operations. When the user also requires a business result, the Agent inspects the recording evidence and the actual page behavior, corrects the script with a supported extraction method, and verifies the returned result. A control labelled “copy” does not by itself prove which Clipboard API, if any, the page uses.

It leaves the current page open; close it through the normal page lifecycle when the workflow is complete:

```bash
divebell stop
```

Recording preparation refuses to replace an already open page. Close the current page first, prepare the recording, and then open the page to record. Stopping refuses to mix evidence if another `divebell open` replaced the recorded page.

## Regenerate or transcribe

Regenerate a script from an already confirmed recording:

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

The default transcription model is `whisper-1`; use `--model` to select another compatible model. Run transcription only when the user says they provided spoken context but the browser did not produce live speech text. Otherwise an empty transcript is ignored.

Audio is supplementary. Only a non-empty transcript is used as Agent context. A recording without usable audio still produces a complete browser replay when the intended result is the demonstrated sequence itself.

## Supplement a missing action

Confirm the setup and correct prefix, close the current page, and prepare an amendment:

```bash
divebell record confirm --input ./recordings/example.orrec --through step-2
divebell stop
divebell record amend start --input ./recordings/example.orrec --after step-2
divebell open https://example.com/ --state /path/to/test-account.json --ui
divebell record amend replay --input ./recordings/example.orrec
```

When the replay result lists potentially mutating steps, obtain user approval before rerunning with `--allow-risky-replay`. Perform only the missing action, stop the amendment, and show its element evidence to the user:

```bash
divebell record amend stop --input ./recordings/example.orrec
divebell record confirm --input ./recordings/example.orrec --step <supplemental-step-id>
```

Prefix replay events are excluded from the amendment, so only the missing action is inserted. `record remove-step` removes a rejected action, while `record amend cancel` abandons an active supplemental recording.

## Fixed-duration capture

For an unattended time-bounded recording:

```bash
divebell open https://example.com/ --ui
divebell record \
  --out ./recordings/example.orrec \
  --duration 30000
divebell stop
```

For an Agent-guided installation and workflow, see the [recording guide](../../docs/record-browser-workflows.md).

## Replay verification

Run the real-browser recording and replay check with:

```bash
pnpm --filter @divebell/extension-imitate test:replay-e2e
```

The check records input, dropdown selection, and a click on a local page, generates the JavaScript file, replays it in a new browser session, and verifies the resulting page.
