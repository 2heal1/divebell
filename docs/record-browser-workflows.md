# Record Browser Workflows with an Agent

> Ask your Agent: `Run divebell extensions add @divebell/extension-imitate to install the Extension, then run divebell record --skill and follow the returned Skill to record my browser workflow. I will demonstrate how to <task>.`

`@divebell/extension-imitate` is the browser-workflow recording Extension and includes the `record-divebell-workflow` Agent skill. It turns one manual browser walkthrough into an executable JavaScript replay, recording the operated elements, event order, and final page state. Microphone capture is attempted automatically, but spoken instructions are optional context and missing or denied audio is ignored.

Use it when a task is easier to demonstrate than to specify from scratch, such as:

- filtering GitHub Issues and returning structured results
- running a query across several pages in an internal tool
- demonstrating a multi-page workflow that should become repeatable

## Demo Video

https://github.com/user-attachments/assets/45669f30-0c10-4a04-9926-5b796c4be946

The video shows a full recording session, from browser interaction to the
generated replay script.

## How It Works

A visible browser page opens with recording enabled. The browser first requests
microphone permission, then returns to a start page that tells the user to enter
a URL in the address bar. The microphone page remains in the background while
the operated page navigates. Recording files are saved under `recordings/` in
the current project, so you do not need to provide a URL or output path first.

Then:

1. Navigate, click, type, and move through the target workflow normally.
2. Speak or add a short chat message only when the demonstrated actions do not fully express the intended result.
3. Say “done” when the walkthrough is complete.
4. A replay script is generated, run once, checked against the final page, and
   the browser is closed.

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
- `workflow.json`: ordered executable steps and element evidence
- `dom-snapshots.jsonl`: page context captured during the workflow
- `audio.webm`: microphone audio
- `transcript.json`: speech text with timing information
- `generated-script.mjs`: executable JavaScript replay

The generated script waits for each recorded element, replays input, dropdown selection, keyboard, and click actions, then verifies the recorded final page state. Voice is considered only when non-empty speech text is available. Silence, unavailable audio, and denied microphone permission do not block generation or replay. Passwords and file paths are not stored; those steps request a value when the script runs.

## Current Limits

- Live speech recognition depends on browser support.
- When live text is unavailable, `audio.webm` can be transcribed after recording.
- The generated script is run once before it is presented as complete.
- The first version generates a script; a stable script can later be packaged as a new skill when requested.
