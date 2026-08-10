# Divebell CLI

This skill uses the globally installed Divebell CLI. It does not add a dependency to the application project or temporarily download another CLI.

## Installation

If the `divebell` command is unavailable, install it globally:

```bash
npm install --global @divebell/cli
divebell setup
divebell --help
```

The recording capability comes from an official Extension. If top-level help does not include `record`, install it once:

```bash
divebell extensions add @divebell/extension-imitate
divebell record --help
```

Extensions are stored in the user's directory by default and loaded by the same global CLI. Do not install `@divebell/cli` or the recording Extension in the application project.

## Usage

Run the global commands directly:

```bash
divebell record start
divebell profiles
divebell state list
divebell open about:blank [--profile <name|path> | --state <path>] --ui
divebell record stop --out <start-output-path>
divebell record review --input <start-output-path>
divebell record confirm --input <start-output-path> --all
divebell stop
```

`record start` records operated elements and events and automatically attempts microphone capture. A successful capture also saves `audio.webm`, `audio-chunks.jsonl`, and `audio-events.jsonl`. When supported by the browser, the recording page writes speech-recognition results as they arrive, and `record stop` combines them into `transcript.json`. Silence, missing audio, and denied microphone access are ignored and do not affect browser recording, script generation, or replay.

The default workflow page contains a URL form. The browser first requests microphone permission in a separately named audio-only tab. After the user allows or denies access, it returns to the workflow tab and keeps the audio tab open in the background until `record stop`. Paste the target URL and perform all actions in the workflow tab; never navigate the audio tab.

To convert audio to a text timeline, run:

```bash
divebell record transcribe --input <start-output-path>
```

The command reads `OPENAI_API_KEY` by default and also accepts `--api-key <key>`. Use it only when the user explicitly said they provided spoken context and audio exists but no live transcript was captured. Missing audio or transcription does not affect script generation or replay from recorded actions.

`record stop` generates a draft `workflow.json`. Browser events are the source of truth; speech is supplementary intent. Review step 0 (authentication) and every concrete browser command before confirmation. Use `record amend` to replay a confirmed prefix and capture only missing actions. Keep business-result extraction out of the workflow schema: after confirmation, inspect the page and recording evidence, choose a supported retrieval method, check any added CLI command with `--help`, and verify the corrected script end to end. `record confirm --all` generates `generated-script.mjs`; a recorded Profile or state must be supplied again when the script runs and is never embedded as credentials.
