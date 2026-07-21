# Record Browser Workflows with an Agent

Chinese version: [录制浏览器操作并生成脚本](record-browser-workflows.zh-CN.md)

`record-openruntime-workflow` is an installable Agent skill that turns one manual browser walkthrough into a reusable JavaScript automation draft. The Agent combines browser interactions, page context, OpenRuntime state, and optional spoken instructions instead of treating the final URL as the entire workflow.

Use it when a task is easier to demonstrate than to specify from scratch, such as:

- filtering GitHub Issues and returning structured results
- running a query across several pages in an internal tool
- demonstrating a multi-page workflow that should become repeatable

## Demo Video

[Watch the browser recording workflow](https://github.com/2heal1/openruntime/releases/download/demo-assets-v1/openruntime-recording-skill-demo.mp4).

The video is published in a dedicated demo-assets Release, separate from runtime and npm package releases.

## Install

Install this directory in an Agent that supports skills:

```text
skills/record-openruntime-workflow
```

For Codex, place the complete directory at:

```text
~/.codex/skills/record-openruntime-workflow
```

A global `openruntime` installation is not required. Before recording, the Agent checks for a compatible local CLI; otherwise the skill downloads the fixed runtime bundle from GitHub Releases, verifies SHA-256, and caches it by version.

See the [OpenRuntime Release Process](./release.md) for coordinated package and runtime releases.

## Use

After installation, ask the Agent:

```text
Use record-openruntime-workflow and start recording my browser workflow.
```

The Agent opens a visible blank browser and saves the recording under `recordings/` in the current project. The user does not need to provide a URL or output path first.

Then:

1. Navigate, click, type, and move through the target workflow normally.
2. Use the microphone to describe the intended result when additional context is useful.
3. Tell the Agent “done” when the walkthrough is complete.
4. The Agent closes the browser, reads the recorded evidence and transcript, then generates and checks a script.

For example, while working on a GitHub Issues page, say:

```text
Collect bug issues closed in the last week and open bug issues from the last two weeks.
Return JSON with the number, title, state, updated time, and URL.
```

The generated script should implement that data task, not merely reopen the last visited page.

## What Is Recorded

The current version records:

- clicks, input, and keyboard actions
- action timestamps relative to recording start
- navigation and DOM summaries
- page state, events, and actions exposed through OpenRuntime
- optional microphone audio, transcript text, and time ranges

Continuous screen video is not yet a reliable recording artifact. In this workflow, “recording” primarily means browser actions, page context, and spoken intent.

## Output

Each session creates an `.orrec` directory under `recordings/`, including:

- `manifest.json`: recording status and file inventory
- `interactions.jsonl`: clicks, inputs, and keyboard actions
- `dom-snapshots.jsonl`: page context captured during the workflow
- `audio.webm`: microphone audio
- `transcript.json`: speech text with timing information
- `generated-script.mjs`: generated JavaScript automation draft

The Agent must check whether the script covers the user's spoken outcome. If audio exists but no transcript text is available, a script that only opens a page is not a complete result.

## Current Limits

- Live speech recognition depends on browser support.
- When live text is unavailable, `audio.webm` can be transcribed after recording.
- The Agent should run the generated script and verify its output before presenting it as complete.
- The first version generates a script; a stable script can later be packaged as a new skill when requested.
