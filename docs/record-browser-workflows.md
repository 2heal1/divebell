# Record Browser Workflows with an Agent

Chinese version: [录制浏览器操作并生成脚本](record-browser-workflows.zh-CN.md)

`record-divebell-workflow` is an installable Agent skill that turns one manual browser walkthrough into an executable JavaScript replay. It records the operated elements, event order, and final page state. Microphone capture is attempted automatically, but spoken instructions are optional context and missing or denied audio is ignored.

Use it when a task is easier to demonstrate than to specify from scratch, such as:

- filtering GitHub Issues and returning structured results
- running a query across several pages in an internal tool
- demonstrating a multi-page workflow that should become repeatable

## Demo Video

https://github.com/user-attachments/assets/45669f30-0c10-4a04-9926-5b796c4be946

The video shows the complete recording, interaction, and script-generation workflow.

## Install

Install Divebell globally and add the recording Extension:

```bash
npm install --global @divebell/cli
divebell check --fix
divebell extensions add @divebell/extension-imitate
```

Install this directory in an Agent that supports skills:

```text
skills/record-divebell-workflow
```

For Codex, place the complete directory at:

```text
~/.codex/skills/record-divebell-workflow
```

The skill uses the global `divebell` command and does not add the CLI to the
application.

## Use

After installation, ask the Agent:

```text
Use record-divebell-workflow and start recording my browser workflow.
```

The Agent first runs `divebell record start` to prepare recording files, cross-page interaction capture, and supplementary voice capture. It does not ask the user to choose a voice mode. It then runs `divebell open about:blank --ui`; the CLI injects the Bridge and the recording Extension injects its capture script into that same page launch. Recordings are saved under `recordings/` in the current project, so the user does not need to provide a URL or output path first.

Then:

1. Navigate, click, type, and move through the target workflow normally.
2. Speak or add a short chat message only when the demonstrated actions do not fully express the intended result.
3. Tell the Agent “done” when the walkthrough is complete.
4. The Agent stops recording, reads the ordered workflow, generates the script, replays it, checks the final page, and then closes the browser through `divebell stop`.

The recording command does not reopen, reset, or close the browser itself. An existing page must be closed before preparing a recording, and the page to record must then be opened through `divebell open`. Recording refuses to mix evidence if another `divebell open` replaces that page before `record stop`.

For example, while working on a GitHub Issues page, say:

```text
Collect bug issues closed in the last week and open bug issues from the last two weeks.
Return JSON with the number, title, state, updated time, and URL.
```

The generated script should implement that data task, not merely reopen the last visited page.

## What Is Recorded

The current version records:

- clicks, input, and keyboard actions
- labels, text, names, and multiple stable ways to find every operated element
- action timestamps relative to recording start
- navigation and DOM summaries
- page state, events, and actions exposed through Divebell
- optional microphone audio, transcript text, and time ranges

Continuous screen video is not yet a reliable recording artifact. In this workflow, “recording” primarily means browser actions, page context, and spoken intent.

## Output

Each session creates an `.orrec` directory under `recordings/`, including:

- `manifest.json`: recording status and file inventory
- `interactions.jsonl`: clicks, inputs, and keyboard actions
- `workflow.json`: ordered executable steps and element evidence for Agent inspection or rearrangement
- `dom-snapshots.jsonl`: page context captured during the workflow
- `audio.webm`: microphone audio
- `transcript.json`: speech text with timing information
- `generated-script.mjs`: executable JavaScript replay

The generated script waits for each recorded element, replays input, dropdown selection, keyboard, and click actions, then verifies the recorded final page state. Voice is considered only when non-empty speech text is available. Silence, unavailable audio, and denied microphone permission do not block generation or replay. Passwords and file paths are not stored; those steps request a value when the script runs.

## Current Limits

- Live speech recognition depends on browser support.
- When live text is unavailable, `audio.webm` can be transcribed after recording.
- The Agent runs the generated script and verifies its output before presenting it as complete.
- The first version generates a script; a stable script can later be packaged as a new skill when requested.
