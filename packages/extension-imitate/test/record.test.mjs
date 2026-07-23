import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import extension from "../dist/extension.js";
import { createOpenRuntimeCli } from "../../cli/dist/index.js";

const cli = createOpenRuntimeCli({ extensions: [extension] });
const runCli = cli.run;

test("records the current OpenRuntime page without reopening or closing the browser", async () => {
  const fixture = createRecordingFixture("openruntime-recording-");
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
    assert.equal(manifest.format, "openruntime-recording");
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
  const fixture = createRecordingFixture("openruntime-manual-recording-", {
    browserLogs: [
      "[INFO ] __OPENRUNTIME_RECORD_EVENT__{\"type\":\"recorder-ready\",\"timeMs\":10,\"url\":\"http://app.test/\",\"title\":\"Orders\"}",
      "[INFO ] __OPENRUNTIME_RECORD_EVENT__{\"type\":\"input\",\"timeMs\":120,\"url\":\"http://app.test/\",\"title\":\"Orders\",\"target\":{\"selector\":\"input[name=q]\",\"tagName\":\"input\",\"name\":\"q\",\"inputType\":\"text\",\"value\":\"module federation\"}}",
      "[INFO ] __OPENRUNTIME_RECORD_EVENT__{\"type\":\"keydown\",\"timeMs\":180,\"url\":\"http://app.test/\",\"title\":\"Orders\",\"key\":\"Enter\",\"code\":\"Enter\",\"target\":{\"selector\":\"input[name=q]\",\"tagName\":\"input\",\"name\":\"q\",\"inputType\":\"text\",\"value\":\"module federation\"}}",
      "[INFO ] __OPENRUNTIME_RECORD_EVENT__{\"type\":\"click\",\"timeMs\":420,\"url\":\"http://app.test/issues\",\"title\":\"Issues\",\"target\":{\"selector\":\"a[href=\\\"/issues\\\"]\",\"tagName\":\"a\",\"text\":\"Issues\"}}"
    ].join("\n")
  });

  try {
    const startOutput = createOutput();
    assert.equal(await fixture.run([
      "record",
      "start",
      "--out",
      fixture.outputDir,
      "--mic"
    ], startOutput), 0);
    assert.equal(startOutput.errorText(), "");
    assert.equal(commandData(startOutput).status, "prepared");

    await fixture.open("http://app.test/");

    const recordingManifest = readJson(join(fixture.outputDir, "manifest.json"));
    assert.equal(recordingManifest.status, "recording");
    assert.equal(recordingManifest.capture.audio.requested, true);
    assert.equal(fixture.controlPresentWhenOpened[0], true);
    const initScript = readFileSync(fixture.browserCalls[0].args[3], "utf8");
    assert.match(initScript, /__OPENRUNTIME_RECORD_EVENT__/);
    assert.match(initScript, /__OPEN_RUNTIME_BRIDGE_MANAGER__/);

    const stopOutput = createOutput();
    assert.equal(await fixture.run([
      "record",
      "stop",
      "--out",
      fixture.outputDir
    ], stopOutput), 0);
    assert.equal(stopOutput.errorText(), "");
    const stopResult = commandData(stopOutput);
    assert.equal(stopResult.status, "completed");
    assert.equal(stopResult.script, join(fixture.outputDir, "generated-script.mjs"));
    assert.equal(fixture.browserCalls.some((call) => call.args[0] === "close"), false);
    assert.deepEqual(fixture.browserCalls.map((call) => call.args[0]), [
      "open",
      "snapshot",
      "eval",
      "console"
    ]);

    const completedManifest = readJson(join(fixture.outputDir, "manifest.json"));
    assert.equal(completedManifest.status, "completed");
    assert.equal(completedManifest.generated.script, "generated-script.mjs");
    assert.equal(completedManifest.counts.runtimeSamples, 1);
    assert.equal(completedManifest.counts.pageSnapshots, 1);
    assert.equal(completedManifest.counts.domSnapshots, 1);
    assert.equal(completedManifest.counts.interactions, 4);
    assert.equal(completedManifest.counts.operations, 7);

    const script = readFileSync(join(fixture.outputDir, "generated-script.mjs"), "utf8");
    assert.match(script, /wait-for/);
    assert.match(script, /orders:list/);
    assert.match(script, /module federation/);
    assert.match(script, /a\[href=/);
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
      "script.generated"
    ]);

    const closeOutput = createOutput();
    assert.equal(await fixture.run(["close"], closeOutput), 0);
    assert.equal(fixture.browserCalls.at(-1)?.args[0], "close");
  } finally {
    fixture.cleanup();
  }
});

test("keeps persisted interactions after navigation", async () => {
  const fixture = createRecordingFixture("openruntime-persisted-recording-", {
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

    const script = readFileSync(join(fixture.outputDir, "generated-script.mjs"), "utf8");
    assert.match(script, /module federation/);
    assert.match(script, /input\[name=/);
    assert.match(script, /issues-tab/);
  } finally {
    fixture.cleanup();
  }
});

test("captures audio chunks and transcribes a recording", async () => {
  const fixture = createRecordingFixture("openruntime-audio-recording-");

  try {
    const startOutput = createOutput();
    assert.equal(await fixture.run([
      "record",
      "start",
      "--out",
      fixture.outputDir,
      "--mic"
    ], startOutput), 0);
    await fixture.open("http://app.test/");

    mkdirSync(join(fixture.outputDir, "audio-chunks"), { recursive: true });
    writeFileSync(join(fixture.outputDir, "audio.webm"), "fake-audio");
    writeFileSync(join(fixture.outputDir, "audio-chunks", "chunk-000000.webm"), "fake-audio");
    writeFileSync(join(fixture.outputDir, "audio-chunks.jsonl"), `${JSON.stringify({
      index: 0,
      startedAt: "2026-07-01T00:00:00.000Z",
      endedAt: "2026-07-01T00:00:01.000Z",
      startMs: 0,
      endMs: 1000,
      durationMs: 1000,
      file: "audio-chunks/chunk-000000.webm",
      mimeType: "audio/webm",
      size: 10
    })}\n`);
    writeFileSync(join(fixture.outputDir, "audio-events.jsonl"), `${JSON.stringify({
      type: "speech-result",
      timeMs: 1800,
      startMs: 1000,
      endMs: 1800,
      text: "获取 closed 状态一周内的 issues",
      confidence: 0.9
    })}\n`);

    const stopOutput = createOutput();
    assert.equal(await fixture.run(["record", "stop", "--out", fixture.outputDir], stopOutput), 0);
    const stoppedManifest = readJson(join(fixture.outputDir, "manifest.json"));
    assert.equal(stoppedManifest.capture.audio.status, "captured");
    assert.equal(stoppedManifest.counts.audioChunks, 1);
    assert.equal(stoppedManifest.counts.transcriptSegments, 1);
    const liveTranscript = readJson(join(fixture.outputDir, "transcript.json"));
    assert.equal(liveTranscript.status, "completed");
    assert.equal(liveTranscript.model, "browser-speech-recognition");
    assert.equal(liveTranscript.segments[0].text, "获取 closed 状态一周内的 issues");

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
          text: "打开 issues 页面",
          segments: [{ start: 1.2, end: 2.4, text: "打开 issues 页面" }],
          words: [{ word: "打开", start: 1.2, end: 1.5 }]
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
    assert.equal(transcript.segments[0].text, "打开 issues 页面");
    assert.equal(transcript.words[0].text, "打开");
  } finally {
    fixture.cleanup();
  }
});

test("uses the current blank page and the default recording output", async () => {
  const fixture = createRecordingFixture("openruntime-default-recording-");
  const originalCwd = process.cwd();

  try {
    process.chdir(fixture.tempDir);
    const output = createOutput();
    assert.equal(await fixture.run(["record", "start"], output), 0);
    const result = commandData(output);
    assert.equal(result.status, "prepared");
    assert.match(result.output, /recordings\/openruntime-/);
    assert.equal(result.output.endsWith(".orrec"), true);
    await fixture.open("about:blank");
    const manifest = readJson(join(result.output, "manifest.json"));
    assert.equal(manifest.status, "recording");
    assert.equal(manifest.url, "about:blank");
    assert.match(manifest.openedUrl, /openruntimeSessionId=/);
    assert.equal(fixture.browserCalls.filter((call) => call.args[0] === "open").length, 1);
  } finally {
    process.chdir(originalCwd);
    fixture.cleanup();
  }
});

test("requires a page opened by openruntime for fixed-duration recording", async () => {
  const fixture = createRecordingFixture("openruntime-no-page-");
  const output = createOutput();

  try {
    const exitCode = await fixture.run(["record", "--out", fixture.outputDir], output);
    assert.equal(exitCode, 1);
    assert.match(output.text(), /Run `openruntime open <url>` before recording/);
    assert.equal(existsSync(fixture.outputDir), false);
    assert.deepEqual(fixture.browserCalls, []);
  } finally {
    fixture.cleanup();
  }
});

test("records a page opened without Bridge without starting one during stop", async () => {
  const fixture = createRecordingFixture("openruntime-recording-without-bridge-");

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
  const fixture = createRecordingFixture("openruntime-legacy-record-options-");

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
    assert.match(output.text(), /Configure and open the page with `openruntime open <url>`/);
    assert.equal(existsSync(fixture.outputDir), false);
  } finally {
    fixture.cleanup();
  }
});

test("refuses to stop a recording from a different OpenRuntime page", async () => {
  const fixture = createRecordingFixture("openruntime-page-mismatch-");

  try {
    const startOutput = createOutput();
    assert.equal(await fixture.run(["record", "start", "--out", fixture.outputDir], startOutput), 0);
    await fixture.open("http://app.test/");
    await fixture.open("http://other.test/", "other-session");
    assert.equal(existsSync(join(fixture.profileDirectory, "recording-session.json")), false);
    assert.doesNotMatch(
      readFileSync(fixture.browserCalls[1].args[3], "utf8"),
      /__OPENRUNTIME_RECORD_EVENT__/
    );

    const stopOutput = createOutput();
    const stopExitCode = await fixture.run(["record", "stop", "--out", fixture.outputDir], stopOutput);
    assert.equal(stopExitCode, 1);
    assert.match(stopOutput.text(), /Another openruntime open replaced the page/);
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
  const originalProfileDirectory = process.env.OPENRUNTIME_BROWSER_PROFILE_DIR;
  process.env.OPENRUNTIME_BROWSER_PROFILE_DIR = profileDirectory;
  const browserCalls = [];
  const controlPresentWhenOpened = [];
  const fetchUrls = [];
  const sessionId = "recording-session";
  const browserRunner = createBrowserRunner(async (args, runOptions) => {
    browserCalls.push({
      args,
      ...(runOptions === undefined ? {} : { options: runOptions })
    });
    if (args[0] === "open") {
      controlPresentWhenOpened.push(existsSync(join(profileDirectory, "recording-session.json")));
      return browserResult("opened");
    }
    if (args[0] === "close") return browserResult("closed");
    if (args[0] === "instrumentation") return browserResult("instrumentation set");
    if (args[0] === "snapshot") {
      return browserResult(JSON.stringify({ title: "Orders", elements: [{ ref: "e1", text: "Refresh" }] }));
    }
    if (args[0] === "eval") {
      return browserResult(JSON.stringify({
        title: "Orders",
        url: options.domUrl ?? "http://app.test/",
        html: "<html></html>",
        htmlLength: 13
      }));
    }
    if (args[0] === "console") {
      return browserResult(JSON.stringify({
        messages: (options.browserLogs ?? "")
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
    open: async (url, pageSessionId = sessionId) => {
      const output = createOutput();
      const exitCode = await runCli([
        "open",
        url,
        "--bridge",
        "http://bridge.test",
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
        delete process.env.OPENRUNTIME_BROWSER_PROFILE_DIR;
      } else {
        process.env.OPENRUNTIME_BROWSER_PROFILE_DIR = originalProfileDirectory;
      }
      rmSync(tempDir, { recursive: true, force: true });
    }
  };
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
        enabled: true,
        hasInputOptions: false
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
