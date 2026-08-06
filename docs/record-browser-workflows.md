# Record Browser Workflows with an Agent

> Ask your Agent: `Run divebell extensions add @divebell/extension-imitate to install the Extension, then run divebell record --skill and follow the returned Skill to record my browser workflow. I will demonstrate how to <task>.`

`@divebell/extension-imitate` is the browser-workflow recording Extension and includes the `record-divebell-workflow` Agent skill. It records operated elements, event order, and final page state as facts, then lets the user review and supplement the workflow before an executable JavaScript replay is generated. Microphone capture is attempted automatically, but spoken instructions are optional intent context and missing or denied audio is ignored.

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
microphone permission, then returns to the **workflow tab**. Paste the target URL
into the form in that tab and perform the walkthrough there. A separately named
**audio tab** remains open in the background; it captures microphone audio only
and must not be used for navigation or workflow actions. Recording files are
saved under `recordings/` in the current project, so you do not need to provide
a URL or output path first.

Then:

1. Choose whether the page needs no authentication, a Chrome Profile, or a browser state.
2. Navigate, click, type, and move through the target workflow normally.
3. Speak or add a short chat message only when the demonstrated actions do not fully express the intended result.
4. Say “done” when the walkthrough is complete.
5. Review step 0 and every concrete browser operation. Remove unwanted steps or insert a missing action by replaying a confirmed prefix.
6. Confirm the complete workflow. Only then is the replay generated, run once, and checked against the final page.

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
- `workflow.json`: authentication requirement, ordered executable steps, element evidence, confirmation status, and revision history
- `dom-snapshots.jsonl`: page context captured during the workflow
- `audio.webm`: microphone audio
- `transcript.json`: speech text with timing information
- `generated-script.mjs`: executable JavaScript replay, created only after workflow confirmation

The generated script waits for each recorded element, replays input, dropdown selection, keyboard, and click actions, then verifies the recorded final page state. Voice is considered only when non-empty speech text is available and never invents an operation or locator. Silence, unavailable audio, and denied microphone permission do not block review or replay. Passwords and file-input values are not stored. A recorded Profile or state is represented as step 0 and must be supplied again when the script runs; state contents and paths are not embedded in the workflow.

## Review and supplement

Stopping creates a draft:

```sh
divebell record review --input ./recordings/example.orrec
```

Confirm setup and a correct prefix, then capture a missing action after it:

```sh
divebell record confirm --input ./recordings/example.orrec --through step-2
divebell stop
divebell record amend start --input ./recordings/example.orrec --after step-2
divebell open https://example.com/ --state /path/to/test-account.json --ui
divebell record amend replay --input ./recordings/example.orrec
# After the user approves any potentially mutating replay steps:
divebell record amend replay --input ./recordings/example.orrec --allow-risky-replay
# Perform only the missing action.
divebell record amend stop --input ./recordings/example.orrec
```

The supplemental action is inserted as `needs-confirmation` with its accessible name, role, label, selector, and state. After the user confirms the intended element, confirm that step and then the complete workflow:

```sh
divebell record confirm --input ./recordings/example.orrec --step <supplemental-step-id>
divebell record confirm --input ./recordings/example.orrec --all
```

## Current Limits

- Live speech recognition depends on browser support.
- When live text is unavailable, `audio.webm` can be transcribed after recording.
- Potentially mutating replay prefixes require explicit user approval.
- The confirmed generated script is run once before it is presented as complete.
- The first version generates a script; a stable script can later be packaged as a new skill when requested.
