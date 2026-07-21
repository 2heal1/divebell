# @openruntime/extension-imitate

This OpenRuntime Extension records a real browser walkthrough and turns the captured interactions, page context, Runtime state, and optional spoken intent into a reusable JavaScript script draft.

## Install

```bash
openruntime extensions add @openruntime/extension-imitate
```

## Record a manual walkthrough

Start a visible browser and save the recording under `./recordings`:

```bash
openruntime record start --mic
```

The URL and output path are optional. When the walkthrough is finished, stop the recording with the output path returned by `start`:

```bash
openruntime record stop --out ./recordings/openruntime-<timestamp>.orrec
```

Stopping captures final state, closes the browser, and writes `generated-script.mjs` by default. Use `--no-close` or `--no-script` only when another workflow owns those steps.

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
openruntime record \
  --url https://example.com/ \
  --out ./recordings/example.orrec \
  --duration 30000
```

For an Agent-guided installation and workflow, see the [English guide](../../docs/record-browser-workflows.md) or [中文指南](../../docs/record-browser-workflows.zh-CN.md).
