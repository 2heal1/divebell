import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import extension from "../dist/extension.js";
import { createDivebellCli } from "../../../cli/dist/index.js";

const cli = createDivebellCli({ extensions: [extension] });
const runCli = cli.run;
const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const recordingSkillPath = join(
  packageDirectory,
  "skills",
  "record-divebell-workflow",
  "SKILL.md"
);

test("exposes the recording skill without running the record command", async () => {
  const output = createOutput();
  const exitCode = await runCli(["record", "--skill"], {
    stdout: output.stdout,
    stderr: output.stderr
  });

  assert.equal(exitCode, 0);
  assert.equal(output.errorText(), "");
  assert.equal(output.text(), `${recordingSkillPath}\n`);
  assert.equal(existsSync(recordingSkillPath), true);
  assert.match(readFileSync(recordingSkillPath, "utf8"), /divebell record start/);
  assert.match(readFileSync(recordingSkillPath, "utf8"), /not as confirmation of the draft/);
  assert.match(readFileSync(recordingSkillPath, "utf8"), /Do not assume a Clipboard API/);
  assert.match(readFileSync(recordingSkillPath, "utf8"), /returned JSON contains the requested business result/);
  assert.match(cli.createHelpText(), /Skill: available for record\./);
});

test("records the current Divebell page without reopening or closing the browser", async () => {
  const fixture = createRecordingFixture("divebell-recording-");
  const output = createOutput();

  try {
    await fixture.open("http://app.test/");
    const exitCode = await fixture.run([
      "record",
      "--out",
      fixture.outputDir,
      "--duration",
      "1",
      "--interval",
      "1"
    ], output);

    assert.equal(exitCode, 0);
    assert.equal(output.errorText(), "");
    const result = commandData(output);
    assert.equal(result.output, fixture.outputDir);
    for (const file of [
      "manifest.json",
      "runtime.jsonl",
      "page-snapshots.jsonl",
      "dom-snapshots.jsonl",
      "interactions.jsonl",
      "operations.jsonl",
      "transcript.json"
    ]) {
      assert.equal(existsSync(join(fixture.outputDir, file)), true, file);
    }

    const manifest = readJson(join(fixture.outputDir, "manifest.json"));
    assert.equal(manifest.format, "divebell-recording");
    assert.equal(manifest.url, "http://app.test/");
    assert.equal(manifest.bridgeUrl, "http://bridge.test");
    assert.equal(manifest.sessionId, fixture.sessionId);
    assert.equal(manifest.counts.runtimeSamples >= 1, true);
    assert.equal(manifest.counts.pageSnapshots >= 1, true);
    assert.equal(fixture.browserCalls.filter((call) => call.args[0] === "open").length, 1);
    assert.equal(fixture.browserCalls.some((call) => call.args[0] === "close"), false);
    assert.equal(fixture.browserCalls[0]?.args[2], "--init-script");
    assert.equal(fixture.fetchUrls.includes("http://bridge.test/runtimes/runtime-1/events?limit=50"), true);
  } finally {
    fixture.cleanup();
  }
});

test("starts and stops a manual recording on the same current page", async () => {
  const fixture = createRecordingFixture("divebell-manual-recording-", {
    browserLogs: [
      "[INFO ] __DIVEBELL_RECORD_EVENT__{\"type\":\"recorder-ready\",\"timeMs\":10,\"url\":\"http://app.test/\",\"title\":\"Orders\"}",
      "[INFO ] __DIVEBELL_RECORD_EVENT__{\"type\":\"input\",\"timeMs\":120,\"url\":\"http://app.test/\",\"title\":\"Orders\",\"target\":{\"selector\":\"input[name=q]\",\"tagName\":\"input\",\"name\":\"q\",\"inputType\":\"text\",\"value\":\"module federation\"}}",
      "[INFO ] __DIVEBELL_RECORD_EVENT__{\"type\":\"keydown\",\"timeMs\":180,\"url\":\"http://app.test/\",\"title\":\"Orders\",\"key\":\"Enter\",\"code\":\"Enter\",\"target\":{\"selector\":\"input[name=q]\",\"tagName\":\"input\",\"name\":\"q\",\"inputType\":\"text\",\"value\":\"module federation\"}}",
      "[INFO ] __DIVEBELL_RECORD_EVENT__{\"type\":\"click\",\"timeMs\":420,\"url\":\"http://app.test/issues\",\"title\":\"Issues\",\"target\":{\"selector\":\"a[href=\\\"/issues\\\"]\",\"tagName\":\"a\",\"text\":\"Issues\"}}"
    ].join("\n")
  });

  try {
    const startOutput = createOutput();
    assert.equal(await fixture.run([
      "record",
      "start",
      "--out",
      fixture.outputDir
    ], startOutput), 0);
    assert.equal(startOutput.errorText(), "");
    assert.equal(commandData(startOutput).status, "prepared");

    await fixture.open("http://app.test/");

    const recordingManifest = readJson(join(fixture.outputDir, "manifest.json"));
    assert.equal(recordingManifest.status, "recording");
    assert.equal(recordingManifest.capture.audio.requested, true);
    assert.equal(fixture.controlPresentWhenOpened[0], true);
    const initScript = readFileSync(fixture.browserCalls[0].args[3], "utf8");
    assert.match(initScript, /__DIVEBELL_RECORD_EVENT__/);
    assert.match(initScript, /__DIVEBELL_BRIDGE_MANAGER__/);
    assert.match(initScript, /locators/);
    assert.match(initScript, /composedPath/);
    assert.match(initScript, /selectedValues/);
    assert.match(initScript, /__divebell\/recorder/);
    assert.equal(
      fixture.browserCalls.some((call) =>
        call.args[0] === "tab" &&
        call.args[1] === "new" &&
        call.args.includes("divebell-recorder")
      ),
      true
    );
    writeFileSync(join(fixture.outputDir, "audio-events.jsonl"), `${JSON.stringify({
      type: "audio-error",
      message: "NotAllowedError: microphone permission was denied"
    })}\n`);

    const stopOutput = createOutput();
    assert.equal(await fixture.run([
      "record",
      "stop",
      "--out",
      fixture.outputDir
    ], stopOutput), 0);
    assert.equal(stopOutput.errorText(), "");
    const stopResult = commandData(stopOutput);
    assert.equal(stopResult.status, "needs_confirmation");
    assert.equal(stopResult.script, undefined);
    assert.equal(stopResult.workflow, join(fixture.outputDir, "workflow.json"));
    assert.equal(existsSync(join(fixture.outputDir, "generated-script.mjs")), false);
    assert.equal(fixture.browserCalls.some((call) => call.args[0] === "close"), false);
    assert.deepEqual(fixture.browserCalls
      .filter((call) => !isRecorderBrowserCall(call.args))
      .map((call) => call.args[0]), [
      "open",
      "console",
      "snapshot",
      "eval"
    ]);

    const completedManifest = readJson(join(fixture.outputDir, "manifest.json"));
    assert.equal(completedManifest.status, "completed");
    assert.equal(completedManifest.generated.script, undefined);
    assert.equal(completedManifest.generated.workflow, "workflow.json");
    assert.equal(completedManifest.counts.runtimeSamples, 1);
    assert.equal(completedManifest.counts.pageSnapshots, 1);
    assert.equal(completedManifest.counts.domSnapshots, 1);
    assert.equal(completedManifest.counts.interactions, 4);
    assert.equal(completedManifest.counts.operations, 7);
    assert.equal(completedManifest.capture.audio.status, "not-captured");
    assert.match(completedManifest.capture.audio.reason, /continued without microphone audio/);
    assert.equal(readJson(join(fixture.outputDir, "transcript.json")).status, "not-captured");

    const workflow = readJson(join(fixture.outputDir, "workflow.json"));
    assert.equal(workflow.schemaVersion, 2);
    assert.equal(workflow.review.status, "draft");
    assert.equal(workflow.requirements.authentication.mode, "none");
    assert.equal(workflow.startUrl, "http://app.test/");
    assert.deepEqual(workflow.steps.map((step) => step.action), ["fill", "press", "click"]);
    assert.deepEqual(workflow.steps.map((step) => step.status), ["draft", "draft", "draft"]);
    assert.deepEqual(readJsonLines(join(fixture.outputDir, "interactions.jsonl")).map((item) => item.type), [
      "recorder-ready",
      "input",
      "keydown",
      "click"
    ]);
    assert.deepEqual(readJsonLines(join(fixture.outputDir, "operations.jsonl")).map((item) => item.type), [
      "record.prepare",
      "recording.control.write",
      "record.page.open",
      "interactions.collect",
      "audio.collect",
      "record.stop",
      "workflow.draft.generated"
    ]);

    const reviewOutput = createOutput();
    assert.equal(await fixture.run([
      "record",
      "review",
      "--input",
      fixture.outputDir
    ], reviewOutput), 0);
    const review = commandData(reviewOutput);
    assert.equal(review.setup[0].number, 0);
    assert.match(review.steps[0].command, /divebell fill/);

    const confirmOutput = createOutput();
    assert.equal(await fixture.run([
      "record",
      "confirm",
      "--input",
      fixture.outputDir,
      "--all"
    ], confirmOutput), 0);
    const confirmed = commandData(confirmOutput);
    assert.equal(confirmed.status, "confirmed");
    assert.equal(confirmed.script, join(fixture.outputDir, "generated-script.mjs"));
    const script = readFileSync(join(fixture.outputDir, "generated-script.mjs"), "utf8");
    assert.match(script, /waitForRecordedTarget/);
    assert.match(script, /status: "ok"/);
    assert.match(script, /module federation/);
    assert.match(script, /a\[href=/);

    const closeOutput = createOutput();
    assert.equal(await fixture.run(["stop"], closeOutput), 0);
    assert.equal(fixture.browserCalls.at(-1)?.args[0], "close");
  } finally {
    fixture.cleanup();
  }
});

test("keeps persisted interactions after navigation", async () => {
  const fixture = createRecordingFixture("divebell-persisted-recording-", {
    domUrl: "https://github.com/module-federation/core/issues"
  });

  try {
    const startOutput = createOutput();
    assert.equal(await fixture.run(["record", "start", "--out", fixture.outputDir], startOutput), 0);
    await fixture.open("https://github.com/");

    writeFileSync(join(fixture.outputDir, "interaction-events.raw.jsonl"), [
      {
        type: "input",
        timeMs: 120,
        url: "https://github.com/",
        title: "GitHub",
        target: {
          selector: "input[name=\"q\"]",
          tagName: "input",
          name: "q",
          inputType: "text",
          value: "module federation"
        }
      },
      {
        type: "keydown",
        timeMs: 180,
        url: "https://github.com/",
        title: "GitHub",
        key: "Enter",
        code: "Enter",
        target: {
          selector: "input[name=\"q\"]",
          tagName: "input",
          name: "q",
          inputType: "text",
          value: "module federation"
        }
      },
      {
        type: "click",
        timeMs: 920,
        url: "https://github.com/module-federation/core",
        title: "module-federation/core",
        target: {
          selector: "a[id=\"issues-tab\"]",
          tagName: "a",
          text: "Issues"
        }
      }
    ].map((event) => JSON.stringify(event)).join("\n") + "\n");

    const stopOutput = createOutput();
    assert.equal(await fixture.run(["record", "stop", "--out", fixture.outputDir], stopOutput), 0);
    assert.equal(commandData(stopOutput).counts.interactions, 3);
    assert.deepEqual(readJsonLines(join(fixture.outputDir, "interactions.jsonl")).map((item) => item.type), [
      "input",
      "keydown",
      "click"
    ]);
    const collectOperation = readJsonLines(join(fixture.outputDir, "operations.jsonl"))
      .find((operation) => operation.type === "interactions.collect");
    assert.equal(collectOperation.persistedCount, 3);
    assert.equal(collectOperation.consoleCount, 0);

    const workflow = readJson(join(fixture.outputDir, "workflow.json"));
    assert.equal(workflow.startUrl, "https://github.com/");
    assert.deepEqual(workflow.steps.map((step) => step.action), ["fill", "press", "click"]);
  } finally {
    fixture.cleanup();
  }
});

test("collects interactions from the workflow tab when the audio tab is active", async () => {
  const fixture = createRecordingFixture("divebell-recording-active-audio-tab-", {
    browserLogsByTab: {
      t1: [
        "[INFO ] __DIVEBELL_RECORD_EVENT__{\"type\":\"recorder-ready\",\"timeMs\":10,\"url\":\"http://app.test/\"}",
        "[INFO ] __DIVEBELL_RECORD_EVENT__{\"type\":\"click\",\"timeMs\":200,\"url\":\"http://app.test/\",\"target\":{\"selector\":\"button\",\"tagName\":\"button\",\"text\":\"Run\"}}"
      ].join("\n"),
      t2: ""
    }
  });

  try {
    const startOutput = createOutput();
    assert.equal(await fixture.run(["record", "start", "--out", fixture.outputDir], startOutput), 0);
    await fixture.open("http://app.test/");

    const tabOutput = createOutput();
    assert.equal(await fixture.run(["tab", "t2"], tabOutput), 0);

    const stopOutput = createOutput();
    assert.equal(await fixture.run(["record", "stop", "--out", fixture.outputDir], stopOutput), 0);
    assert.equal(commandData(stopOutput).counts.interactions, 2);
    assert.deepEqual(
      readJsonLines(join(fixture.outputDir, "interactions.jsonl")).map((event) => event.type),
      ["recorder-ready", "click"]
    );

    const snapshotIndex = fixture.browserCalls.findIndex((call) => call.args[0] === "snapshot");
    assert.equal(snapshotIndex > 0, true);
    assert.deepEqual(fixture.browserCalls[snapshotIndex - 1]?.args, ["console", "--json"]);
    assert.deepEqual(fixture.browserCalls[snapshotIndex - 2]?.args, ["tab", "t1"]);
    const collectOperation = readJsonLines(join(fixture.outputDir, "operations.jsonl"))
      .find((operation) => operation.type === "interactions.collect");
    assert.equal(collectOperation.selectedTabId, "t1");
    assert.equal(collectOperation.inspectedTabCount, 1);
  } finally {
    fixture.cleanup();
  }
});

test("keeps a repeated input after an action boundary", async () => {
  const target = "{\"selector\":\"input[name=q]\",\"tagName\":\"input\",\"name\":\"q\",\"inputType\":\"text\",\"value\":\"same value\"}";
  const fixture = createRecordingFixture("divebell-repeated-input-", {
    browserLogs: [
      `[INFO ] __DIVEBELL_RECORD_EVENT__{"type":"input","timeMs":100,"url":"http://app.test/","target":${target}}`,
      `[INFO ] __DIVEBELL_RECORD_EVENT__{"type":"change","timeMs":120,"url":"http://app.test/","target":${target}}`,
      "[INFO ] __DIVEBELL_RECORD_EVENT__{\"type\":\"click\",\"timeMs\":200,\"url\":\"http://app.test/\",\"target\":{\"selector\":\"button[data-testid=reset]\",\"tagName\":\"button\",\"text\":\"Reset\"}}",
      `[INFO ] __DIVEBELL_RECORD_EVENT__{"type":"input","timeMs":300,"url":"http://app.test/","target":${target}}`
    ].join("\n")
  });

  try {
    const startOutput = createOutput();
    assert.equal(await fixture.run(["record", "start", "--out", fixture.outputDir], startOutput), 0);
    await fixture.open("http://app.test/");
    const stopOutput = createOutput();
    assert.equal(await fixture.run(["record", "stop", "--out", fixture.outputDir], stopOutput), 0);

    const workflow = readJson(join(fixture.outputDir, "workflow.json"));
    assert.deepEqual(workflow.steps.map((step) => step.action), ["fill", "click", "fill"]);
    assert.deepEqual(workflow.steps.filter((step) => step.action === "fill").map((step) => step.value), [
      "same value",
      "same value"
    ]);
  } finally {
    fixture.cleanup();
  }
});

test("coalesces the change and synthetic submit click caused by pressing Enter", async () => {
  const searchTarget = {
    selector: "input[aria-label=\"Search\"]",
    tagName: "input",
    inputType: "search",
    ariaLabel: "Search",
    accessibleName: "Search",
    value: "byted-browser"
  };
  const events = [
    {
      type: "input",
      timeMs: 100,
      url: "http://app.test/",
      target: searchTarget
    },
    {
      type: "keydown",
      timeMs: 200,
      url: "http://app.test/",
      key: "Enter",
      code: "Enter",
      target: searchTarget
    },
    {
      type: "change",
      timeMs: 200,
      url: "http://app.test/",
      target: searchTarget
    },
    {
      type: "click",
      timeMs: 200,
      url: "http://app.test/",
      target: {
        selector: "button[aria-label=\"Search submit\"]",
        tagName: "button",
        ariaLabel: "Search submit",
        accessibleName: "Search submit"
      },
      pointer: { x: 0, y: 0, button: 0 }
    },
    {
      type: "submit",
      timeMs: 201,
      url: "http://app.test/",
      target: { selector: "form", tagName: "form" }
    }
  ];
  const fixture = createRecordingFixture("divebell-enter-submit-", {
    browserLogs: events
      .map((event) => `[INFO ] __DIVEBELL_RECORD_EVENT__${JSON.stringify(event)}`)
      .join("\n")
  });

  try {
    const startOutput = createOutput();
    assert.equal(await fixture.run(["record", "start", "--out", fixture.outputDir], startOutput), 0);
    await fixture.open("http://app.test/");
    const stopOutput = createOutput();
    assert.equal(await fixture.run(["record", "stop", "--out", fixture.outputDir], stopOutput), 0);

    const workflow = readJson(join(fixture.outputDir, "workflow.json"));
    assert.deepEqual(workflow.steps.map((step) => step.action), ["fill", "press"]);
    assert.deepEqual(workflow.steps.map((step) => step.timeMs), [100, 200]);
  } finally {
    fixture.cleanup();
  }
});

test("removes a rejected draft step and invalidates an earlier script", async () => {
  const fixture = createRecordingFixture("divebell-remove-step-", {
    browserLogs: [
      "[INFO ] __DIVEBELL_RECORD_EVENT__{\"type\":\"click\",\"timeMs\":100,\"url\":\"http://app.test/\",\"target\":{\"selector\":\"button[data-testid=wrong]\",\"tagName\":\"button\",\"accessibleName\":\"Wrong\"}}",
      "[INFO ] __DIVEBELL_RECORD_EVENT__{\"type\":\"click\",\"timeMs\":200,\"url\":\"http://app.test/\",\"target\":{\"selector\":\"button[data-testid=right]\",\"tagName\":\"button\",\"accessibleName\":\"Right\"}}"
    ].join("\n")
  });

  try {
    const startOutput = createOutput();
    assert.equal(await fixture.run(["record", "start", "--out", fixture.outputDir], startOutput), 0);
    await fixture.open("http://app.test/");
    const stopOutput = createOutput();
    assert.equal(await fixture.run(["record", "stop", "--out", fixture.outputDir], stopOutput), 0);
    const confirmOutput = createOutput();
    assert.equal(await fixture.run([
      "record",
      "confirm",
      "--input",
      fixture.outputDir,
      "--all"
    ], confirmOutput), 0);
    assert.equal(existsSync(join(fixture.outputDir, "generated-script.mjs")), true);

    const removeOutput = createOutput();
    assert.equal(await fixture.run([
      "record",
      "remove-step",
      "--input",
      fixture.outputDir,
      "--step",
      "step-1"
    ], removeOutput), 0);
    const revised = commandData(removeOutput);
    assert.deepEqual(revised.steps.map((step) => step.id), ["step-2"]);
    const manifest = readJson(join(fixture.outputDir, "manifest.json"));
    assert.equal(manifest.generated.script, undefined);
    const workflow = readJson(join(fixture.outputDir, "workflow.json"));
    assert.equal(workflow.revisions.at(-1).type, "remove");
  } finally {
    fixture.cleanup();
  }
});

test("requires workflow confirmation before regenerating a script", async () => {
  const fixture = createRecordingFixture("divebell-regenerated-workflow-", {
    browserLogs: "[INFO ] __DIVEBELL_RECORD_EVENT__{\"type\":\"click\",\"timeMs\":100,\"url\":\"http://app.test/\",\"target\":{\"selector\":\"button\",\"tagName\":\"button\",\"text\":\"Run\"}}"
  });

  try {
    const startOutput = createOutput();
    assert.equal(await fixture.run(["record", "start", "--out", fixture.outputDir], startOutput), 0);
    await fixture.open("http://app.test/");
    const stopOutput = createOutput();
    assert.equal(await fixture.run(["record", "stop", "--out", fixture.outputDir], stopOutput), 0);

    const manifestPath = join(fixture.outputDir, "manifest.json");
    const olderManifest = readJson(manifestPath);
    delete olderManifest.generated.workflow;
    writeFileSync(manifestPath, `${JSON.stringify(olderManifest, null, 2)}\n`);

    const generateOutput = createOutput();
    assert.equal(await fixture.run([
      "record",
      "generate-script",
      "--input",
      fixture.outputDir
    ], generateOutput), 1);
    assert.match(generateOutput.text(), /workflow is still a draft/);

    const confirmOutput = createOutput();
    assert.equal(await fixture.run([
      "record",
      "confirm",
      "--input",
      fixture.outputDir,
      "--all"
    ], confirmOutput), 0);
    assert.equal(commandData(confirmOutput).script, join(fixture.outputDir, "generated-script.mjs"));
    assert.equal(readJson(manifestPath).generated.workflow, "workflow.json");
  } finally {
    fixture.cleanup();
  }
});

test("runs the generated workflow as an executable script with ordered browser actions", async () => {
  const fixture = createRecordingFixture("divebell-generated-replay-", {
    browserLogs: [
      "[INFO ] __DIVEBELL_RECORD_EVENT__{\"type\":\"input\",\"timeMs\":100,\"url\":\"http://app.test/\",\"title\":\"Orders\",\"target\":{\"selector\":\"input[name=q]\",\"locators\":[{\"kind\":\"name\",\"value\":\"q\",\"selector\":\"input[name=\\\"q\\\"]\"}],\"tagName\":\"input\",\"name\":\"q\",\"inputType\":\"text\",\"value\":\"module federation\"}}",
      "[INFO ] __DIVEBELL_RECORD_EVENT__{\"type\":\"keydown\",\"timeMs\":150,\"url\":\"http://app.test/\",\"title\":\"Orders\",\"key\":\"Enter\",\"code\":\"Enter\",\"target\":{\"selector\":\"input[name=q]\",\"locators\":[{\"kind\":\"name\",\"value\":\"q\",\"selector\":\"input[name=\\\"q\\\"]\"}],\"tagName\":\"input\",\"name\":\"q\",\"inputType\":\"text\",\"value\":\"module federation\"}}",
      "[INFO ] __DIVEBELL_RECORD_EVENT__{\"type\":\"click\",\"timeMs\":300,\"url\":\"http://app.test/\",\"title\":\"Orders\",\"target\":{\"selector\":\"button[data-testid=refresh]\",\"locators\":[{\"kind\":\"test-id\",\"value\":\"refresh\",\"selector\":\"button[data-testid=\\\"refresh\\\"]\"}],\"tagName\":\"button\",\"text\":\"Refresh\",\"accessibleName\":\"Refresh\"}}"
    ].join("\n")
  });

  try {
    const startOutput = createOutput();
    assert.equal(await fixture.run(["record", "start", "--out", fixture.outputDir], startOutput), 0);
    await fixture.open("http://app.test/");
    const stopOutput = createOutput();
    assert.equal(await fixture.run(["record", "stop", "--out", fixture.outputDir], stopOutput), 0);
    const confirmOutput = createOutput();
    assert.equal(await fixture.run([
      "record",
      "confirm",
      "--input",
      fixture.outputDir,
      "--all"
    ], confirmOutput), 0);

    const callsPath = join(fixture.tempDir, "replay-calls.jsonl");
    const fakeCliPath = join(fixture.tempDir, "fake-divebell.mjs");
    writeFileSync(fakeCliPath, `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(process.env.REPLAY_CALLS, JSON.stringify(args) + "\\n");
if (args[0] === "eval") {
  if (args[1].includes("locateRecordedTargetInPage")) {
    process.stdout.write(JSON.stringify({
      found: true,
      selector: "[data-divebell-replay-target=step]",
      matchedBy: "test-id:recorded",
      page: { url: "http://app.test/", title: "Orders", readyState: "complete" }
    }));
  } else {
    process.stdout.write(JSON.stringify({
      url: "http://app.test/",
      title: "Orders",
      readyState: "complete"
    }));
  }
}
`, "utf8");
    chmodSync(fakeCliPath, 0o755);

    const stdout = execFileSync(
      process.execPath,
      [join(fixture.outputDir, "generated-script.mjs"), "--headless"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          DIVEBELL_CLI: fakeCliPath,
          REPLAY_CALLS: callsPath
        }
      }
    );
    const result = JSON.parse(stdout);
    assert.equal(result.status, "ok");
    assert.equal(result.data.completedSteps, 3);
    const calls = readJsonLines(callsPath);
    assert.deepEqual(calls.map((args) => args[0]), [
      "open",
      "eval",
      "fill",
      "eval",
      "focus",
      "press",
      "eval",
      "click",
      "eval"
    ]);
  } finally {
    fixture.cleanup();
  }
});

test("records an explicit state dependency and requires it when the confirmed script runs", async () => {
  const fixture = createRecordingFixture("divebell-state-workflow-", {
    browserLogs: "[INFO ] __DIVEBELL_RECORD_EVENT__{\"type\":\"click\",\"timeMs\":100,\"url\":\"http://app.test/\",\"target\":{\"selector\":\"button[data-testid=run]\",\"locators\":[{\"kind\":\"test-id\",\"value\":\"run\",\"selector\":\"button[data-testid=\\\"run\\\"]\"}],\"tagName\":\"button\",\"accessibleName\":\"Run\"}}"
  });

  try {
    const recordedState = join(fixture.tempDir, "qa-admin-state.json");
    const startOutput = createOutput();
    assert.equal(await fixture.run(["record", "start", "--out", fixture.outputDir], startOutput), 0);
    await fixture.open("http://app.test/", fixture.sessionId, ["--state", recordedState]);
    const stopOutput = createOutput();
    assert.equal(await fixture.run(["record", "stop", "--out", fixture.outputDir], stopOutput), 0);

    const workflow = readJson(join(fixture.outputDir, "workflow.json"));
    assert.deepEqual(workflow.requirements.authentication, {
      id: "setup-auth",
      mode: "state",
      required: true,
      displayName: "qa-admin-state.json",
      parameter: "--state",
      status: "draft"
    });
    assert.equal(JSON.stringify(workflow).includes(recordedState), false);

    const confirmOutput = createOutput();
    assert.equal(await fixture.run([
      "record",
      "confirm",
      "--input",
      fixture.outputDir,
      "--all"
    ], confirmOutput), 0);

    const scriptPath = join(fixture.outputDir, "generated-script.mjs");
    const needsInput = JSON.parse(execFileSync(process.execPath, [scriptPath, "--headless"], {
      encoding: "utf8"
    }));
    assert.equal(needsInput.status, "needs_input");
    assert.match(needsInput.message, /qa-admin-state\.json/);

    const callsPath = join(fixture.tempDir, "state-replay-calls.jsonl");
    const fakeCliPath = join(fixture.tempDir, "fake-state-divebell.mjs");
    writeFileSync(fakeCliPath, `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(process.env.REPLAY_CALLS, JSON.stringify(args) + "\\n");
if (args[0] === "eval") {
  if (args[1].includes("locateRecordedTargetInPage")) {
    process.stdout.write(JSON.stringify({
      found: true,
      selector: "[data-divebell-replay-target=step]",
      matchedBy: "test-id:run",
      page: { url: "http://app.test/", title: "Orders", readyState: "complete" }
    }));
  } else {
    process.stdout.write(JSON.stringify({
      url: "http://app.test/",
      title: "Orders",
      readyState: "complete"
    }));
  }
}
`, "utf8");
    chmodSync(fakeCliPath, 0o755);
    const runtimeState = join(fixture.tempDir, "runtime-state.json");
    const replay = JSON.parse(execFileSync(
      process.execPath,
      [scriptPath, "--headless", "--state", runtimeState],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          DIVEBELL_CLI: fakeCliPath,
          REPLAY_CALLS: callsPath
        }
      }
    ));
    assert.equal(replay.status, "ok");
    assert.deepEqual(readJsonLines(callsPath)[0], [
      "open",
      "http://app.test/",
      "--state",
      runtimeState
    ]);
  } finally {
    fixture.cleanup();
  }
});

test("records a selected Chrome Profile as the step zero dependency", async () => {
  const fixture = createRecordingFixture("divebell-profile-workflow-", {
    browserLogs: "[INFO ] __DIVEBELL_RECORD_EVENT__{\"type\":\"click\",\"timeMs\":100,\"url\":\"http://app.test/\",\"target\":{\"selector\":\"button\",\"tagName\":\"button\",\"accessibleName\":\"Open\"}}"
  });

  try {
    const startOutput = createOutput();
    assert.equal(await fixture.run(["record", "start", "--out", fixture.outputDir], startOutput), 0);
    await fixture.open("http://app.test/", fixture.sessionId, ["--profile", "Work"]);
    const stopOutput = createOutput();
    assert.equal(await fixture.run(["record", "stop", "--out", fixture.outputDir], stopOutput), 0);
    const reviewOutput = createOutput();
    assert.equal(await fixture.run([
      "record",
      "review",
      "--input",
      fixture.outputDir
    ], reviewOutput), 0);
    const review = commandData(reviewOutput);
    assert.equal(review.setup[0].number, 0);
    assert.match(review.setup[0].title, /profile.*Work/i);
    assert.match(review.setup[0].command, /--profile <value>/);
    assert.equal(JSON.stringify(readJson(join(fixture.outputDir, "workflow.json"))).includes("--state"), false);
  } finally {
    fixture.cleanup();
  }
});

test("replays a confirmed prefix and inserts only the newly recorded element for confirmation", async () => {
  const fixture = createRecordingFixture("divebell-amend-workflow-", {
    browserLogs: [
      "[INFO ] __DIVEBELL_RECORD_EVENT__{\"type\":\"click\",\"timeMs\":100,\"url\":\"http://app.test/\",\"target\":{\"selector\":\"button[data-testid=create]\",\"locators\":[{\"kind\":\"test-id\",\"value\":\"create\",\"selector\":\"button[data-testid=\\\"create\\\"]\"}],\"tagName\":\"button\",\"accessibleName\":\"Create project\"}}",
      "[INFO ] __DIVEBELL_RECORD_EVENT__{\"type\":\"input\",\"timeMs\":200,\"url\":\"http://app.test/\",\"target\":{\"selector\":\"input[name=name]\",\"locators\":[{\"kind\":\"name\",\"value\":\"name\",\"selector\":\"input[name=\\\"name\\\"]\"}],\"tagName\":\"input\",\"accessibleName\":\"Project name\",\"value\":\"Demo\"}}",
      "[INFO ] __DIVEBELL_RECORD_EVENT__{\"type\":\"click\",\"timeMs\":300,\"url\":\"http://app.test/\",\"target\":{\"selector\":\"button[data-testid=next]\",\"locators\":[{\"kind\":\"test-id\",\"value\":\"next\",\"selector\":\"button[data-testid=\\\"next\\\"]\"}],\"tagName\":\"button\",\"accessibleName\":\"Next\"}}"
    ].join("\n")
  });

  try {
    const startOutput = createOutput();
    assert.equal(await fixture.run(["record", "start", "--out", fixture.outputDir], startOutput), 0);
    await fixture.open("http://app.test/");
    const stopOutput = createOutput();
    assert.equal(await fixture.run(["record", "stop", "--out", fixture.outputDir], stopOutput), 0);

    const confirmPrefixOutput = createOutput();
    assert.equal(await fixture.run([
      "record",
      "confirm",
      "--input",
      fixture.outputDir,
      "--through",
      "step-2"
    ], confirmPrefixOutput), 0);
    assert.equal(commandData(confirmPrefixOutput).status, "draft");

    const closeOutput = createOutput();
    assert.equal(await fixture.run(["stop"], closeOutput), 0);
    const amendStartOutput = createOutput();
    assert.equal(await fixture.run([
      "record",
      "amend",
      "start",
      "--input",
      fixture.outputDir,
      "--after",
      "step-2"
    ], amendStartOutput), 0);
    assert.equal(commandData(amendStartOutput).status, "prepared");

    await fixture.open("http://app.test/", "amend-session");
    const replayWarningOutput = createOutput();
    assert.equal(await fixture.run([
      "record",
      "amend",
      "replay",
      "--input",
      fixture.outputDir
    ], replayWarningOutput), 0);
    assert.equal(commandData(replayWarningOutput).status, "needs_confirmation");

    const replayOutput = createOutput();
    assert.equal(await fixture.run([
      "record",
      "amend",
      "replay",
      "--input",
      fixture.outputDir,
      "--allow-risky-replay"
    ], replayOutput), 0);
    assert.equal(commandData(replayOutput).status, "capturing");
    const control = readJson(join(fixture.profileDirectory, "recording-session.json"));
    assert.equal(control.amendment.status, "capturing");
    writeFileSync(control.amendment.eventsFile, `${JSON.stringify({
      type: "click",
      timeMs: control.amendment.armedAtMs + 10,
      url: "http://app.test/",
      title: "Create project",
      target: {
        selector: "input[data-testid=create-example]",
        locators: [{
          kind: "test-id",
          value: "create-example",
          selector: "input[data-testid=\"create-example\"]"
        }],
        tagName: "input",
        inputType: "checkbox",
        role: "checkbox",
        accessibleName: "Create example data",
        checked: true
      }
    })}\n`);

    const amendStopOutput = createOutput();
    assert.equal(await fixture.run([
      "record",
      "amend",
      "stop",
      "--input",
      fixture.outputDir
    ], amendStopOutput), 0);
    const amendment = commandData(amendStopOutput);
    assert.equal(amendment.status, "needs_confirmation");
    assert.equal(amendment.proposedSteps.length, 1);
    assert.equal(amendment.proposedSteps[0].element.accessibleName, "Create example data");
    assert.equal(amendment.elementConfirmations[0].highlighted, true);
    const supplementalId = amendment.proposedSteps[0].id;

    let workflow = readJson(join(fixture.outputDir, "workflow.json"));
    assert.deepEqual(workflow.steps.map((step) => step.id), [
      "step-1",
      "step-2",
      supplementalId,
      "step-3"
    ]);
    assert.equal(workflow.steps[2].status, "needs-confirmation");
    assert.equal(workflow.steps[2].source, "supplemental-recording");

    const confirmElementOutput = createOutput();
    assert.equal(await fixture.run([
      "record",
      "confirm",
      "--input",
      fixture.outputDir,
      "--step",
      supplementalId
    ], confirmElementOutput), 0);
    assert.equal(commandData(confirmElementOutput).status, "draft");
    workflow = readJson(join(fixture.outputDir, "workflow.json"));
    assert.equal(workflow.revisions.find((revision) => revision.type === "insert-after").status, "applied");

    const confirmAllOutput = createOutput();
    assert.equal(await fixture.run([
      "record",
      "confirm",
      "--input",
      fixture.outputDir,
      "--all"
    ], confirmAllOutput), 0);
    assert.equal(commandData(confirmAllOutput).status, "confirmed");
    assert.equal(existsSync(join(fixture.outputDir, "generated-script.mjs")), true);
  } finally {
    fixture.cleanup();
  }
});

test("captures audio chunks and transcribes a recording", async () => {
  const fixture = createRecordingFixture("divebell-audio-recording-", {
    browserLogs: "[INFO ] __DIVEBELL_RECORD_EVENT__{\"type\":\"click\",\"timeMs\":1800,\"url\":\"http://app.test/\",\"target\":{\"selector\":\"button\",\"tagName\":\"button\",\"accessibleName\":\"Open issues\"}}",
    browserAudio: {
      chunks: ["fake-audio"],
      events: [{
        type: "speech-result",
        timeMs: 1800,
        startMs: 1000,
        endMs: 1800,
        text: "Get issues closed within the last week",
        confidence: 0.9
      }]
    }
  });

  try {
    const startOutput = createOutput();
    assert.equal(await fixture.run([
      "record",
      "start",
      "--out",
      fixture.outputDir
    ], startOutput), 0);
    await fixture.open("http://app.test/");

    const stopOutput = createOutput();
    assert.equal(await fixture.run(["record", "stop", "--out", fixture.outputDir], stopOutput), 0);
    const stoppedManifest = readJson(join(fixture.outputDir, "manifest.json"));
    assert.equal(stoppedManifest.capture.audio.status, "captured");
    assert.equal(stoppedManifest.counts.audioChunks, 1);
    assert.equal(stoppedManifest.counts.transcriptSegments, 1);
    assert.equal(readFileSync(join(fixture.outputDir, "audio.webm"), "utf8"), "fake-audio");
    assert.equal(
      readFileSync(join(fixture.outputDir, "audio-chunks", "chunk-000000.webm"), "utf8"),
      "fake-audio"
    );
    const liveTranscript = readJson(join(fixture.outputDir, "transcript.json"));
    assert.equal(liveTranscript.status, "completed");
    assert.equal(liveTranscript.model, "browser-speech-recognition");
    assert.equal(liveTranscript.segments[0].text, "Get issues closed within the last week");

    const transcribeOutput = createOutput();
    const transcribeExitCode = await fixture.run([
      "record",
      "transcribe",
      "--input",
      fixture.outputDir,
      "--api-key",
      "test-key"
    ], transcribeOutput, {
      fetcher: async (input, init) => {
        assert.equal(String(input), "https://api.openai.com/v1/audio/transcriptions");
        assert.equal(init?.headers.authorization, "Bearer test-key");
        return jsonResponse({
          text: "Open the issues page",
          segments: [{ start: 1.2, end: 2.4, text: "Open the issues page" }],
          words: [{ word: "Open", start: 1.2, end: 1.5 }]
        });
      }
    });
    assert.equal(transcribeExitCode, 0);
    assert.equal(transcribeOutput.errorText(), "");
    const transcribeResult = commandData(transcribeOutput);
    assert.equal(transcribeResult.segmentCount, 1);
    assert.equal(transcribeResult.wordCount, 1);
    const transcript = readJson(join(fixture.outputDir, "transcript.json"));
    assert.equal(transcript.segments[0].startMs, 1200);
    assert.equal(transcript.segments[0].text, "Open the issues page");
    assert.equal(transcript.words[0].text, "Open");
    assert.equal(
      readJson(join(fixture.outputDir, "workflow.json")).steps[0].evidence.transcript[0].text,
      "Open the issues page"
    );
  } finally {
    fixture.cleanup();
  }
});

test("uses the current blank page and the default recording output", async () => {
  const fixture = createRecordingFixture("divebell-default-recording-");
  const originalCwd = process.cwd();

  try {
    process.chdir(fixture.tempDir);
    const output = createOutput();
    assert.equal(await fixture.run(["record", "start"], output), 0);
    const result = commandData(output);
    assert.equal(result.status, "prepared");
    assert.match(result.output, /recordings\/divebell-/);
    assert.equal(result.output.endsWith(".orrec"), true);
    await fixture.open("about:blank");
    const manifest = readJson(join(result.output, "manifest.json"));
    assert.equal(manifest.status, "recording");
    assert.equal(manifest.url, "about:blank");
    assert.match(manifest.openedUrl, /\/__divebell\/recording-start\?/);
    assert.match(manifest.openedUrl, /divebellSessionId=/);
    assert.equal(fixture.browserCalls.filter((call) => call.args[0] === "open").length, 1);
    const openCall = fixture.browserCalls.find((call) => call.args[0] === "open");
    assert.equal(openCall.args[1], manifest.openedUrl);
    const initScript = readFileSync(openCall.args[3], "utf8");
    assert.match(initScript, /__divebell\/recording-start/);
    assert.match(initScript, /__divebell\/recorder/);
  } finally {
    process.chdir(originalCwd);
    fixture.cleanup();
  }
});

test("requires a page opened by divebell for fixed-duration recording", async () => {
  const fixture = createRecordingFixture("divebell-no-page-");
  const output = createOutput();

  try {
    const exitCode = await fixture.run(["record", "--out", fixture.outputDir], output);
    assert.equal(exitCode, 1);
    assert.match(output.text(), /Run `divebell open <url>` before recording/);
    assert.equal(existsSync(fixture.outputDir), false);
    assert.deepEqual(fixture.browserCalls, []);
  } finally {
    fixture.cleanup();
  }
});

test("records a page opened without Bridge without starting one during stop", async () => {
  const fixture = createRecordingFixture("divebell-recording-without-bridge-");

  try {
    const startOutput = createOutput();
    assert.equal(await fixture.run(["record", "start", "--out", fixture.outputDir], startOutput), 0);
    await fixture.openWithoutBridge("http://app.test/");

    const stopOutput = createOutput();
    assert.equal(await fixture.run(["record", "stop", "--out", fixture.outputDir], stopOutput), 0);
    assert.deepEqual(fixture.fetchUrls, []);
    assert.equal(readJson(join(fixture.outputDir, "manifest.json")).bridgeUrl, null);
    const runtimeSample = readJsonLines(join(fixture.outputDir, "runtime.jsonl"))[0];
    assert.equal(runtimeSample.ok, false);
    assert.match(runtimeSample.error, /without a Bridge/);
  } finally {
    fixture.cleanup();
  }
});

test("rejects browser lifecycle options on record commands", async () => {
  const fixture = createRecordingFixture("divebell-legacy-record-options-");

  try {
    const output = createOutput();
    const exitCode = await fixture.run([
      "record",
      "start",
      "--out",
      fixture.outputDir,
      "--no-open"
    ], output);
    assert.equal(exitCode, 1);
    assert.match(output.text(), /Configure and open the page with `divebell open <url>`/);
    assert.equal(existsSync(fixture.outputDir), false);
  } finally {
    fixture.cleanup();
  }
});

test("refuses to stop a recording from a different Divebell page", async () => {
  const fixture = createRecordingFixture("divebell-page-mismatch-");

  try {
    const startOutput = createOutput();
    assert.equal(await fixture.run(["record", "start", "--out", fixture.outputDir], startOutput), 0);
    await fixture.open("http://app.test/");
    await fixture.open("http://other.test/", "other-session");
    assert.equal(existsSync(join(fixture.profileDirectory, "recording-session.json")), false);
    const openCalls = fixture.browserCalls.filter((call) => call.args[0] === "open");
    assert.doesNotMatch(
      readFileSync(openCalls[1].args[3], "utf8"),
      /__DIVEBELL_RECORD_EVENT__/
    );

    const stopOutput = createOutput();
    const stopExitCode = await fixture.run(["record", "stop", "--out", fixture.outputDir], stopOutput);
    assert.equal(stopExitCode, 1);
    assert.match(stopOutput.text(), /Another divebell open replaced the page/);
    assert.equal(readJson(join(fixture.outputDir, "manifest.json")).status, "recording");
    assert.equal(fixture.browserCalls.some((call) => call.args[0] === "close"), false);
  } finally {
    fixture.cleanup();
  }
});

function createRecordingFixture(prefix, options = {}) {
  const tempDir = mkdtempSync(join(tmpdir(), prefix));
  const outputDir = join(tempDir, "demo.orrec");
  const operationLogDirectory = join(tempDir, "operations");
  const profileDirectory = join(tempDir, "browser-profile");
  const originalProfileDirectory = process.env.DIVEBELL_BROWSER_PROFILE_DIR;
  process.env.DIVEBELL_BROWSER_PROFILE_DIR = profileDirectory;
  const browserCalls = [];
  const controlPresentWhenOpened = [];
  const fetchUrls = [];
  const sessionId = "recording-session";
  let activeTabId = "t1";
  let tabs = [];
  const browserRunner = createBrowserRunner(async (args, runOptions) => {
    browserCalls.push({
      args,
      ...(runOptions === undefined ? {} : { options: runOptions })
    });
    const openIndex = args.indexOf("open");
    if (openIndex >= 0) {
      controlPresentWhenOpened.push(existsSync(join(profileDirectory, "recording-session.json")));
      activeTabId = "t1";
      tabs = [{
        tabId: "t1",
        label: null,
        title: "Orders",
        url: args[openIndex + 1] ?? "about:blank",
        type: "page",
        active: true
      }];
      return browserResult("opened");
    }
    if (args[0] === "close") {
      tabs = [];
      return browserResult("closed");
    }
    if (args[0] === "tab" && args[1] === "--json") {
      return browserResult(JSON.stringify({
        tabs: tabs.map((tab) => ({
          ...tab,
          active: tab.tabId === activeTabId
        }))
      }));
    }
    if (args[0] === "tab" && args[1] === "new") {
      const labelIndex = args.indexOf("--label");
      const url = args.at(-1);
      activeTabId = "t2";
      tabs.push({
        tabId: "t2",
        label: labelIndex < 0 ? null : args[labelIndex + 1],
        title: "Divebell microphone recording",
        url,
        type: "page",
        active: true
      });
      return browserResult(JSON.stringify({ tabId: "t2", url, total: tabs.length }));
    }
    if (args[0] === "tab" && /^t\d+$/u.test(args[1] ?? "")) {
      activeTabId = args[1];
      return browserResult(JSON.stringify({ tabId: activeTabId }));
    }
    if (args[0] === "instrumentation") return browserResult("instrumentation set");
    if (args[0] === "snapshot") {
      return browserResult(JSON.stringify({ title: "Orders", elements: [{ ref: "e1", text: "Refresh" }] }));
    }
    if (args[0] === "eval") {
      const script = args[1] ?? "";
      if (script.includes("locateRecordedTargetInPage")) {
        return browserResult(JSON.stringify(options.locatedTarget ?? {
          found: true,
          selector: "[data-divebell-replay-target=amend]",
          matchedBy: "test-id:recorded",
          page: {
            url: options.domUrl ?? "http://app.test/",
            title: "Orders",
            readyState: "complete"
          }
        }));
      }
      if (script.includes("__DIVEBELL_AUDIO_RECORDER__?.status")) {
        return browserResult("true");
      }
      if (script.includes("recorder.stop()")) {
        if (options.browserAudio === "unavailable") {
          return {
            exitCode: 1,
            stdout: "",
            stderr: "The microphone recorder is not ready."
          };
        }
        const chunks = options.browserAudio?.chunks ?? [];
        return browserResult(JSON.stringify({
          status: chunks.length === 0 ? "denied" : "stopped",
          mimeType: "audio/webm;codecs=opus",
          chunkCount: chunks.length,
          chunks: chunks.map((chunk, index) => ({
            startMs: index * 1000,
            endMs: (index + 1) * 1000,
            mimeType: "audio/webm;codecs=opus",
            size: Buffer.from(chunk).length
          })),
          events: options.browserAudio?.events ?? [{
            type: "audio-error",
            timeMs: 10,
            message: "NotAllowedError: microphone permission was denied"
          }]
        }));
      }
      if (script.includes("recorder.readChunk(")) {
        const index = Number(script.match(/readChunk\((\d+)\)/u)?.[1] ?? -1);
        const chunk = options.browserAudio?.chunks?.[index];
        return chunk === undefined
          ? {
              exitCode: 1,
              stdout: "",
              stderr: `Audio chunk ${index} does not exist.`
            }
          : browserResult(JSON.stringify(Buffer.from(chunk).toString("base64")));
      }
      return browserResult(JSON.stringify({
        title: "Orders",
        url: options.domUrl ?? "http://app.test/",
        html: "<html></html>",
        htmlLength: 13
      }));
    }
    if (["click", "fill", "focus", "press", "select", "highlight"].includes(args[0])) {
      return browserResult("ok");
    }
    if (args[0] === "console") {
      const browserLogs = options.browserLogsByTab?.[activeTabId] ?? options.browserLogs ?? "";
      return browserResult(JSON.stringify({
        messages: browserLogs
          .split(/\r?\n/u)
          .filter((line) => line.length > 0)
          .map((text) => ({ type: "info", text }))
      }));
    }
    return {
      exitCode: 1,
      stdout: "",
      stderr: `unexpected browser command: ${args.join(" ")}`
    };
  });
  const fetcher = createRecordingFetcher(fetchUrls, sessionId);

  return {
    tempDir,
    outputDir,
    profileDirectory,
    sessionId,
    browserCalls,
    controlPresentWhenOpened,
    fetchUrls,
    open: async (url, pageSessionId = sessionId, launchOptions = []) => {
      const output = createOutput();
      const exitCode = await runCli([
        "open",
        url,
        "--bridge",
        "http://bridge.test",
        "--session",
        pageSessionId,
        "--ui",
        ...launchOptions
      ], {
        stdout: output.stdout,
        stderr: output.stderr,
        operationLogDirectory,
        browserRunner,
        fetcher
      });
      assert.equal(exitCode, 0, output.text());
      assert.equal(output.errorText(), "");
    },
    openWithoutBridge: async (url, pageSessionId = sessionId) => {
      const output = createOutput();
      const exitCode = await runCli([
        "open",
        url,
        "--no-bridge",
        "--session",
        pageSessionId,
        "--ui"
      ], {
        stdout: output.stdout,
        stderr: output.stderr,
        operationLogDirectory,
        browserRunner,
        fetcher
      });
      assert.equal(exitCode, 0, output.text());
      assert.equal(output.errorText(), "");
    },
    run: async (args, output, overrides = {}) => await runCli(args, {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory,
      browserRunner,
      fetcher,
      ...overrides
    }),
    cleanup: () => {
      if (originalProfileDirectory === undefined) {
        delete process.env.DIVEBELL_BROWSER_PROFILE_DIR;
      } else {
        process.env.DIVEBELL_BROWSER_PROFILE_DIR = originalProfileDirectory;
      }
      rmSync(tempDir, { recursive: true, force: true });
    }
  };
}

function isRecorderBrowserCall(args) {
  return args[0] === "tab" ||
    (args[0] === "eval" && (args[1] ?? "").includes("__DIVEBELL_AUDIO_RECORDER__"));
}

function createOutput() {
  let stdout = "";
  let stderr = "";
  return {
    stdout: { write: (chunk) => { stdout += chunk; } },
    stderr: { write: (chunk) => { stderr += chunk; } },
    text: () => stdout,
    errorText: () => stderr
  };
}

function commandData(output) {
  const result = JSON.parse(output.text());
  assert.equal(result.status, "ok");
  return result.data;
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function createRecordingFetcher(fetchUrls = [], sessionId = "recording-session") {
  return async (input) => {
    fetchUrls.push(String(input));
    const url = String(input);
    if (url === "http://bridge.test/runtimes") {
      return jsonResponse({
        runtimes: [{
          runtimeId: "runtime-1",
          url: "http://app.test/",
          sessionId,
          status: "connected",
          connectedAt: 1,
          lastSeenAt: 2
        }]
      });
    }
    if (url === "http://bridge.test/runtimes/runtime-1/targets") {
      return jsonResponse([{
        id: "orders:list",
        type: "orders",
        source: "orders",
        statuses: ["loading", "ready", "error"]
      }]);
    }
    if (url === "http://bridge.test/runtimes/runtime-1/snapshot") {
      return jsonResponse({
        targets: {
          "orders:list": {
            id: "orders:list",
            type: "orders",
            status: "ready",
            updatedAt: 3
          }
        },
        latestEventId: 1,
        capturedAt: 4
      });
    }
    if (url === "http://bridge.test/runtimes/runtime-1/actions") {
      return jsonResponse([{
        name: "orders.refresh",
        source: "orders",
        risk: "safe",
        enabled: true
      }]);
    }
    if (url === "http://bridge.test/runtimes/runtime-1/events?limit=50") {
      return jsonResponse([{
        id: 1,
        type: "snapshot.updated",
        targetId: "orders:list",
        status: "ready"
      }]);
    }
    return jsonResponse({});
  };
}

function createBrowserRunner(run) {
  return { run };
}

function browserResult(stdout) {
  return {
    exitCode: 0,
    stdout: stdout.endsWith("\n") ? stdout : `${stdout}\n`,
    stderr: ""
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonLines(path) {
  const content = readFileSync(path, "utf8").trim();
  return content.length === 0 ? [] : content.split("\n").map((line) => JSON.parse(line));
}
