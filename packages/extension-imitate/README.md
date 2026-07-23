# @openruntime/extension-imitate

This OpenRuntime Extension records a real browser walkthrough and turns the captured interactions, page context, Runtime state, and optional spoken intent into a reusable JavaScript script draft.

## Install

```bash
openruntime extensions add @openruntime/extension-imitate
```

## Record a manual walkthrough

Prepare the recording first so browser interaction and optional microphone capture are active from page startup. The output defaults to `./recordings`:

```bash
openruntime record start --mic
```

Then open the page through OpenRuntime. The CLI starts and injects the Bridge while the recording Extension injects its page capture script into the same browser launch:

```bash
openruntime open https://example.com/ --ui
```

The guided workflow can use `about:blank` when no URL is provided, and the output path is optional. When the walkthrough is finished, stop the recording with the output path returned by `start`:

```bash
openruntime record stop --out ./recordings/openruntime-<timestamp>.orrec
```

Stopping captures final state and writes `generated-script.mjs` by default. It leaves the current page open; close it through the normal page lifecycle when the workflow is complete:

```bash
openruntime close
```

Recording preparation refuses to replace an already open page. Close the current page first, prepare the recording, and then open the page to record. Stopping refuses to mix evidence if another `openruntime open` replaced the recorded page.

## Regenerate or transcribe

Regenerate a script from an existing recording:

```bash
openruntime record generate-script \
  --input ./recordings/example.orrec \
  --out ./scripts/example.mjs
```

When microphone audio exists, create timestamped text with:

```bash
OPENAI_API_KEY=... openruntime record transcribe \
  --input ./recordings/example.orrec
```

The default transcription model is `whisper-1`; use `--model` to select another compatible model. Do not treat a script that only opens the last URL as complete when recorded audio has not been transcribed.

## Fixed-duration capture

For an unattended time-bounded recording:

```bash
openruntime open https://example.com/ --ui
openruntime record \
  --out ./recordings/example.orrec \
  --duration 30000
openruntime close
```

For an Agent-guided installation and workflow, see the [English guide](../../docs/record-browser-workflows.md) or [中文指南](../../docs/record-browser-workflows.zh-CN.md).
