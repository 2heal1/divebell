import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import extension from "../dist/extension.js";
import { createOpenRuntimeCli } from "../../cli/dist/index.js";

const cli = createOpenRuntimeCli({ extensions: [extension] });
const runCli = cli.run;

test("records browser snapshots and OpenRuntime runtime samples into an orrec directory", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-recording-"));
  const outputDir = join(tempDir, "demo.orrec");
  const browserCalls = [];
  const fetchUrls = [];
  const output = createOutput();

  try {
    const exitCode = await runCli([
      "record",
      "--url",
      "http://app.test/",
      "--bridge",
      "http://bridge.test",
      "--out",
      outputDir,
      "--duration",
      "1",
      "--interval",
      "1",
      "--mic"
    ], {
      stdout: output.stdout,
      stderr: output.stderr,
      browserRunner: createBrowserRunner(async (args, options) => {
        browserCalls.push({
          args,
          ...(options === undefined ? {} : { options })
        });
        if (args[0] === "open") {
          return {
            exitCode: 0,
            stdout: "opened\n",
            stderr: ""
          };
        }
        if (args[0] === "snapshot") {
          return {
            exitCode: 0,
            stdout: JSON.stringify({ title: "Orders", elements: [{ ref: "e1", text: "Refresh" }] }),
            stderr: ""
          };
        }
        if (args[0] === "eval") {
          return {
            exitCode: 0,
            stdout: JSON.stringify({ title: "Orders", url: "http://app.test/", html: "<html></html>", htmlLength: 13 }),
            stderr: ""
          };
        }
        return {
          exitCode: 1,
          stdout: "",
          stderr: `unexpected browser command: ${args.join(" ")}`
        };
      }),
      fetcher: async (url) => {
        fetchUrls.push(String(url));
        const textUrl = String(url);
        if (textUrl === "http://bridge.test/runtimes") {
          return jsonResponse({
            runtimes: [
              {
                runtimeId: "runtime-1",
                url: "http://app.test/",
                status: "connected",
                connectedAt: 1,
                lastSeenAt: 2
              }
            ]
          });
        }
        if (textUrl === "http://bridge.test/runtimes/runtime-1/targets") {
          return jsonResponse([
            {
              id: "orders:list",
              type: "orders",
              source: "orders",
              statuses: ["loading", "ready", "error"]
            }
          ]);
        }
        if (textUrl === "http://bridge.test/runtimes/runtime-1/snapshot") {
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
        if (textUrl === "http://bridge.test/runtimes/runtime-1/actions") {
          return jsonResponse([
            {
              name: "orders.refresh",
              source: "orders",
              risk: "safe",
              enabled: true,
              hasInputOptions: false
            }
          ]);
        }
        if (textUrl === "http://bridge.test/runtimes/runtime-1/events?limit=50") {
          return jsonResponse([
            {
              id: 1,
              type: "snapshot.updated",
              targetId: "orders:list",
              status: "ready"
            }
          ]);
        }
        return jsonResponse({});
      }
    });

    assert.equal(exitCode, 0);
    assert.equal(output.errorText(), "");
    const result = JSON.parse(output.text());
    assert.equal(result.ok, true);
    assert.equal(result.output, outputDir);
    assert.equal(existsSync(join(outputDir, "manifest.json")), true);
    assert.equal(existsSync(join(outputDir, "runtime.jsonl")), true);
    assert.equal(existsSync(join(outputDir, "page-snapshots.jsonl")), true);
    assert.equal(existsSync(join(outputDir, "dom-snapshots.jsonl")), true);
    assert.equal(existsSync(join(outputDir, "interactions.jsonl")), true);
    assert.equal(existsSync(join(outputDir, "operations.jsonl")), true);
    assert.equal(existsSync(join(outputDir, "transcript.json")), true);

    const manifest = JSON.parse(readFileSync(join(outputDir, "manifest.json"), "utf8"));
    assert.equal(manifest.format, "openruntime-recording");
    assert.equal(manifest.capture.audio.requested, true);
    assert.equal(manifest.capture.audio.status, "not-captured");
    assert.equal(manifest.counts.runtimeSamples >= 1, true);
    assert.equal(manifest.counts.pageSnapshots >= 1, true);
    assert.deepEqual(browserCalls[0], {
      args: ["open", "http://app.test/"],
      options: { ui: true }
    });
    assert.deepEqual(browserCalls.at(-1)?.args[0], "eval");
    assert.equal(fetchUrls.includes("http://bridge.test/runtimes/runtime-1/events?limit=50"), true);
  } finally {
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});

test("starts and stops a manual recording and generates a script", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-manual-recording-"));
  const outputDir = join(tempDir, "demo.orrec");
  const originalProfileDirectory = process.env.OPENRUNTIME_BROWSER_PROFILE_DIR;
  process.env.OPENRUNTIME_BROWSER_PROFILE_DIR = join(tempDir, "browser-profile");
  const browserCalls = [];
  const fetchUrls = [];

  try {
    const startOutput = createOutput();
    const stopOutput = createOutput();
    const browserRunner = createBrowserRunner(async (args, options) => {
      browserCalls.push({
        args,
        ...(options === undefined ? {} : { options })
      });
      if (args[0] === "close") {
        return {
          exitCode: 0,
          stdout: "closed\n",
          stderr: ""
        };
      }
      if (args[0] === "open") {
        return {
          exitCode: 0,
          stdout: "opened\n",
          stderr: ""
        };
      }
      if (args[0] === "snapshot") {
        return {
          exitCode: 0,
          stdout: JSON.stringify({ title: "Orders", elements: [{ ref: "e1", text: "Refresh" }] }),
          stderr: ""
        };
      }
      if (args[0] === "eval") {
        return {
          exitCode: 0,
          stdout: JSON.stringify({ title: "Orders", url: "http://app.test/", html: "<html></html>", htmlLength: 13 }),
          stderr: ""
        };
      }
      if (args[0] === "instrumentation") {
        return {
          exitCode: 0,
          stdout: "instrumentation set\n",
          stderr: ""
        };
      }
      if (args[0] === "browser-logs") {
        return {
          exitCode: 0,
          stdout: [
            "[INFO ] __OPENRUNTIME_RECORD_EVENT__{\"type\":\"recorder-ready\",\"timeMs\":10,\"url\":\"http://app.test/\",\"title\":\"Orders\"}",
            "[INFO ] __OPENRUNTIME_RECORD_EVENT__{\"type\":\"input\",\"timeMs\":120,\"url\":\"http://app.test/\",\"title\":\"Orders\",\"target\":{\"selector\":\"input[name=q]\",\"tagName\":\"input\",\"name\":\"q\",\"inputType\":\"text\",\"value\":\"module federation\"}}",
            "[INFO ] __OPENRUNTIME_RECORD_EVENT__{\"type\":\"keydown\",\"timeMs\":180,\"url\":\"http://app.test/\",\"title\":\"Orders\",\"key\":\"Enter\",\"code\":\"Enter\",\"target\":{\"selector\":\"input[name=q]\",\"tagName\":\"input\",\"name\":\"q\",\"inputType\":\"text\",\"value\":\"module federation\"}}",
            "[INFO ] __OPENRUNTIME_RECORD_EVENT__{\"type\":\"click\",\"timeMs\":420,\"url\":\"http://app.test/issues\",\"title\":\"Issues\",\"target\":{\"selector\":\"a[href=\\\"/issues\\\"]\",\"tagName\":\"a\",\"text\":\"Issues\"}}"
          ].join("\n"),
          stderr: ""
        };
      }
      return {
        exitCode: 1,
        stdout: "",
        stderr: `unexpected browser command: ${args.join(" ")}`
      };
    });

    const startExitCode = await runCli([
      "record",
      "start",
      "--url",
      "http://app.test/",
      "--bridge",
      "http://bridge.test",
      "--out",
      outputDir,
      "--mic"
    ], {
      stdout: startOutput.stdout,
      stderr: startOutput.stderr,
      browserRunner,
      fetcher: createRecordingFetcher(fetchUrls)
    });

    assert.equal(startExitCode, 0);
    assert.equal(startOutput.errorText(), "");
    assert.equal(JSON.parse(startOutput.text()).status, "recording");
    const recordingManifest = JSON.parse(readFileSync(join(outputDir, "manifest.json"), "utf8"));
    assert.equal(recordingManifest.status, "recording");
    assert.equal(recordingManifest.capture.audio.requested, true);

    const stopExitCode = await runCli([
      "record",
      "stop",
      "--out",
      outputDir
    ], {
      stdout: stopOutput.stdout,
      stderr: stopOutput.stderr,
      browserRunner,
      fetcher: createRecordingFetcher(fetchUrls)
    });

    assert.equal(stopExitCode, 0);
    assert.equal(stopOutput.errorText(), "");
    const stopResult = JSON.parse(stopOutput.text());
    assert.equal(stopResult.status, "completed");
    assert.equal(stopResult.script, join(outputDir, "generated-script.mjs"));
    assert.deepEqual(browserCalls.map((call) => call.args[0]), [
      "close",
      "open",
      "instrumentation",
      "snapshot",
      "eval",
      "snapshot",
      "eval",
      "browser-logs",
      "close"
    ]);

    const completedManifest = JSON.parse(readFileSync(join(outputDir, "manifest.json"), "utf8"));
    assert.equal(completedManifest.status, "completed");
    assert.equal(completedManifest.generated.script, "generated-script.mjs");
    assert.equal(completedManifest.counts.runtimeSamples, 2);
    assert.equal(completedManifest.counts.pageSnapshots, 2);
    assert.equal(completedManifest.counts.domSnapshots, 2);
    assert.equal(completedManifest.counts.interactions, 4);
    assert.equal(completedManifest.counts.audioChunks, 0);
    assert.equal(completedManifest.counts.transcriptSegments, 0);
    assert.equal(completedManifest.counts.operations, 10);
    assert.equal(completedManifest.capture.audio.status, "not-captured");

    const script = readFileSync(join(outputDir, "generated-script.mjs"), "utf8");
    assert.match(script, /openruntime/);
    assert.match(script, /wait-for/);
    assert.match(script, /orders:list/);
    assert.match(script, /module federation/);
    assert.match(script, /a\[href=/);
    const interactions = readFileSync(join(outputDir, "interactions.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).type);
    assert.deepEqual(interactions, ["recorder-ready", "input", "keydown", "click"]);

    const operations = readFileSync(join(outputDir, "operations.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).type);
    assert.deepEqual(operations, [
      "record.start",
      "recording.control.write",
      "browser.reset",
      "browser.open",
      "browser.instrumentation.set",
      "interactions.collect",
      "audio.collect",
      "record.stop",
      "browser.close",
      "script.generated"
    ]);
    assert.equal(fetchUrls.includes("http://bridge.test/runtimes/runtime-1/events?limit=50"), true);
  } finally {
    if (originalProfileDirectory === undefined) {
      delete process.env.OPENRUNTIME_BROWSER_PROFILE_DIR;
    } else {
      process.env.OPENRUNTIME_BROWSER_PROFILE_DIR = originalProfileDirectory;
    }
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});

test("generates a script from persisted interaction events after navigation", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-persisted-recording-"));
  const outputDir = join(tempDir, "demo.orrec");
  const originalProfileDirectory = process.env.OPENRUNTIME_BROWSER_PROFILE_DIR;
  process.env.OPENRUNTIME_BROWSER_PROFILE_DIR = join(tempDir, "browser-profile");
  const browserCalls = [];

  try {
    const browserRunner = createBrowserRunner(async (args, options) => {
      browserCalls.push({
        args,
        ...(options === undefined ? {} : { options })
      });
      if (args[0] === "close") {
        return {
          exitCode: 0,
          stdout: "closed\n",
          stderr: ""
        };
      }
      if (args[0] === "open") {
        return {
          exitCode: 0,
          stdout: "opened\n",
          stderr: ""
        };
      }
      if (args[0] === "instrumentation") {
        return {
          exitCode: 0,
          stdout: "instrumentation set\n",
          stderr: ""
        };
      }
      if (args[0] === "snapshot") {
        return {
          exitCode: 0,
          stdout: JSON.stringify({ title: "Repository issues", elements: [{ ref: "issues", text: "Issues" }] }),
          stderr: ""
        };
      }
      if (args[0] === "eval") {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            title: "Repository issues",
            url: "https://github.com/module-federation/core/issues",
            html: "<html></html>",
            htmlLength: 13
          }),
          stderr: ""
        };
      }
      if (args[0] === "browser-logs") {
        return {
          exitCode: 0,
          stdout: "",
          stderr: ""
        };
      }
      return {
        exitCode: 1,
        stdout: "",
        stderr: `unexpected browser command: ${args.join(" ")}`
      };
    });

    const startOutput = createOutput();
    const startExitCode = await runCli([
      "record",
      "start",
      "--url",
      "https://github.com/",
      "--bridge",
      "http://bridge.test",
      "--out",
      outputDir
    ], {
      stdout: startOutput.stdout,
      stderr: startOutput.stderr,
      browserRunner,
      fetcher: createRecordingFetcher()
    });

    assert.equal(startExitCode, 0);
    assert.equal(startOutput.errorText(), "");
    writeFileSync(join(outputDir, "interaction-events.raw.jsonl"), [
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
    const stopExitCode = await runCli([
      "record",
      "stop",
      "--out",
      outputDir
    ], {
      stdout: stopOutput.stdout,
      stderr: stopOutput.stderr,
      browserRunner,
      fetcher: createRecordingFetcher()
    });

    assert.equal(stopExitCode, 0);
    assert.equal(stopOutput.errorText(), "");
    const stopResult = JSON.parse(stopOutput.text());
    assert.equal(stopResult.status, "completed");
    assert.equal(stopResult.counts.interactions, 3);
    assert.deepEqual(browserCalls.map((call) => call.args[0]), [
      "close",
      "open",
      "instrumentation",
      "snapshot",
      "eval",
      "snapshot",
      "eval",
      "browser-logs",
      "close"
    ]);

    const interactions = readFileSync(join(outputDir, "interactions.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).type);
    assert.deepEqual(interactions, ["input", "keydown", "click"]);

    const collectOperation = readFileSync(join(outputDir, "operations.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .find((operation) => operation.type === "interactions.collect");
    assert.equal(collectOperation.persistedCount, 3);
    assert.equal(collectOperation.browserLogCount, 0);

    const script = readFileSync(join(outputDir, "generated-script.mjs"), "utf8");
    assert.match(script, /module federation/);
    assert.match(script, /input\[name=/);
    assert.match(script, /issues-tab/);
  } finally {
    if (originalProfileDirectory === undefined) {
      delete process.env.OPENRUNTIME_BROWSER_PROFILE_DIR;
    } else {
      process.env.OPENRUNTIME_BROWSER_PROFILE_DIR = originalProfileDirectory;
    }
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});

test("captures audio chunks and transcribes a recording", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-audio-recording-"));
  const outputDir = join(tempDir, "demo.orrec");
  const originalProfileDirectory = process.env.OPENRUNTIME_BROWSER_PROFILE_DIR;
  process.env.OPENRUNTIME_BROWSER_PROFILE_DIR = join(tempDir, "browser-profile");

  try {
    const browserRunner = createBrowserRunner(async (args) => {
      if (args[0] === "close") {
        return {
          exitCode: 0,
          stdout: "closed\n",
          stderr: ""
        };
      }
      if (args[0] === "open") {
        return {
          exitCode: 0,
          stdout: "opened\n",
          stderr: ""
        };
      }
      if (args[0] === "instrumentation") {
        return {
          exitCode: 0,
          stdout: "instrumentation set\n",
          stderr: ""
        };
      }
      if (args[0] === "snapshot") {
        return {
          exitCode: 0,
          stdout: JSON.stringify({ title: "Orders" }),
          stderr: ""
        };
      }
      if (args[0] === "eval") {
        return {
          exitCode: 0,
          stdout: JSON.stringify({ title: "Orders", url: "http://app.test/", html: "<html></html>", htmlLength: 13 }),
          stderr: ""
        };
      }
      if (args[0] === "browser-logs") {
        return {
          exitCode: 0,
          stdout: "",
          stderr: ""
        };
      }
      return {
        exitCode: 1,
        stdout: "",
        stderr: `unexpected browser command: ${args.join(" ")}`
      };
    });

    const startOutput = createOutput();
    const startExitCode = await runCli([
      "record",
      "start",
      "--url",
      "http://app.test/",
      "--bridge",
      "http://bridge.test",
      "--out",
      outputDir,
      "--mic"
    ], {
      stdout: startOutput.stdout,
      stderr: startOutput.stderr,
      browserRunner,
      fetcher: createRecordingFetcher()
    });
    assert.equal(startExitCode, 0);
    assert.equal(startOutput.errorText(), "");

    mkdirSync(join(outputDir, "audio-chunks"), { recursive: true });
    writeFileSync(join(outputDir, "audio.webm"), "fake-audio");
    writeFileSync(join(outputDir, "audio-chunks", "chunk-000000.webm"), "fake-audio");
    writeFileSync(join(outputDir, "audio-chunks.jsonl"), `${JSON.stringify({
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
    writeFileSync(join(outputDir, "audio-events.jsonl"), `${JSON.stringify({
      type: "speech-result",
      timeMs: 1800,
      startMs: 1000,
      endMs: 1800,
      text: "获取 closed 状态一周内的 issues",
      confidence: 0.9
    })}\n`);

    const stopOutput = createOutput();
    const stopExitCode = await runCli([
      "record",
      "stop",
      "--out",
      outputDir
    ], {
      stdout: stopOutput.stdout,
      stderr: stopOutput.stderr,
      browserRunner,
      fetcher: createRecordingFetcher()
    });
    assert.equal(stopExitCode, 0);
    assert.equal(stopOutput.errorText(), "");
    const stoppedManifest = JSON.parse(readFileSync(join(outputDir, "manifest.json"), "utf8"));
    assert.equal(stoppedManifest.capture.audio.status, "captured");
    assert.equal(stoppedManifest.counts.audioChunks, 1);
    assert.equal(stoppedManifest.counts.transcriptSegments, 1);
    const liveTranscript = JSON.parse(readFileSync(join(outputDir, "transcript.json"), "utf8"));
    assert.equal(liveTranscript.status, "completed");
    assert.equal(liveTranscript.model, "browser-speech-recognition");
    assert.equal(liveTranscript.segments[0].text, "获取 closed 状态一周内的 issues");
    const generatedScript = readFileSync(join(outputDir, "generated-script.mjs"), "utf8");
    assert.match(generatedScript, /Voice transcript/);
    assert.match(generatedScript, /closed 状态一周内/);

    const transcribeOutput = createOutput();
    const transcribeExitCode = await runCli([
      "record",
      "transcribe",
      "--input",
      outputDir,
      "--api-key",
      "test-key"
    ], {
      stdout: transcribeOutput.stdout,
      stderr: transcribeOutput.stderr,
      fetcher: async (input, init) => {
        assert.equal(String(input), "https://api.openai.com/v1/audio/transcriptions");
        assert.equal(init?.headers.authorization, "Bearer test-key");
        return jsonResponse({
          text: "打开 issues 页面",
          segments: [
            {
              start: 1.2,
              end: 2.4,
              text: "打开 issues 页面"
            }
          ],
          words: [
            {
              word: "打开",
              start: 1.2,
              end: 1.5
            }
          ]
        });
      }
    });
    assert.equal(transcribeExitCode, 0);
    assert.equal(transcribeOutput.errorText(), "");
    const transcribeResult = JSON.parse(transcribeOutput.text());
    assert.equal(transcribeResult.segmentCount, 1);
    assert.equal(transcribeResult.wordCount, 1);

    const transcript = JSON.parse(readFileSync(join(outputDir, "transcript.json"), "utf8"));
    assert.equal(transcript.status, "completed");
    assert.equal(transcript.segments[0].startMs, 1200);
    assert.equal(transcript.segments[0].text, "打开 issues 页面");
    assert.equal(transcript.words[0].text, "打开");

    const completedManifest = JSON.parse(readFileSync(join(outputDir, "manifest.json"), "utf8"));
    assert.equal(completedManifest.capture.audio.status, "transcribed");
    assert.equal(completedManifest.counts.audioChunks, 1);
    assert.equal(completedManifest.counts.transcriptSegments, 1);
  } finally {
    if (originalProfileDirectory === undefined) {
      delete process.env.OPENRUNTIME_BROWSER_PROFILE_DIR;
    } else {
      process.env.OPENRUNTIME_BROWSER_PROFILE_DIR = originalProfileDirectory;
    }
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});

test("starts a manual recording with a blank page and default recordings output", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-default-recording-"));
  const originalCwd = process.cwd();
  const originalProfileDirectory = process.env.OPENRUNTIME_BROWSER_PROFILE_DIR;
  process.env.OPENRUNTIME_BROWSER_PROFILE_DIR = join(tempDir, "browser-profile");
  const browserCalls = [];
  const output = createOutput();

  try {
    process.chdir(tempDir);
    const exitCode = await runCli([
      "record",
      "start",
      "--bridge",
      "http://bridge.test"
    ], {
      stdout: output.stdout,
      stderr: output.stderr,
      browserRunner: createBrowserRunner(async (args, options) => {
        browserCalls.push({
          args,
          ...(options === undefined ? {} : { options })
        });
        if (args[0] === "close") {
          return {
            exitCode: 0,
            stdout: "closed\n",
            stderr: ""
          };
        }
        if (args[0] === "open") {
          return {
            exitCode: 0,
            stdout: "opened\n",
            stderr: ""
          };
        }
        if (args[0] === "snapshot") {
          return {
            exitCode: 0,
            stdout: JSON.stringify({ title: "Blank" }),
            stderr: ""
          };
        }
        if (args[0] === "eval") {
          return {
            exitCode: 0,
            stdout: JSON.stringify({ title: "Blank", url: "about:blank", html: "<html></html>", htmlLength: 13 }),
            stderr: ""
          };
        }
        if (args[0] === "instrumentation") {
          return {
            exitCode: 0,
            stdout: "instrumentation set\n",
            stderr: ""
          };
        }
        return {
          exitCode: 1,
          stdout: "",
          stderr: `unexpected browser command: ${args.join(" ")}`
        };
      }),
      fetcher: createRecordingFetcher()
    });

    assert.equal(exitCode, 0);
    assert.equal(output.errorText(), "");
    const result = JSON.parse(output.text());
    assert.equal(result.status, "recording");
    assert.match(result.output, /recordings\/openruntime-/);
    assert.equal(result.output.endsWith(".orrec"), true);

    const manifest = JSON.parse(readFileSync(join(result.output, "manifest.json"), "utf8"));
    assert.equal(manifest.url, "about:blank");
    assert.equal(manifest.openedUrl, "about:blank");
    assert.deepEqual(browserCalls[1], {
      args: ["open", "about:blank"],
      options: { ui: true }
    });
  } finally {
    if (originalProfileDirectory === undefined) {
      delete process.env.OPENRUNTIME_BROWSER_PROFILE_DIR;
    } else {
      process.env.OPENRUNTIME_BROWSER_PROFILE_DIR = originalProfileDirectory;
    }
    process.chdir(originalCwd);
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});

function createOutput() {
  let stdout = "";
  let stderr = "";
  return {
    stdout: {
      write: (chunk) => {
        stdout += chunk;
      }
    },
    stderr: {
      write: (chunk) => {
        stderr += chunk;
      }
    },
    text: () => stdout,
    errorText: () => stderr
  };
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
}

function createRecordingFetcher(fetchUrls = []) {
  return async (input) => {
    fetchUrls.push(String(input));
    const textUrl = String(input);
    if (textUrl === "http://bridge.test/runtimes") {
      return jsonResponse({
        runtimes: [
          {
            runtimeId: "runtime-1",
            url: "http://app.test/",
            status: "connected",
            connectedAt: 1,
            lastSeenAt: 2
          }
        ]
      });
    }
    if (textUrl === "http://bridge.test/runtimes/runtime-1/targets") {
      return jsonResponse([
        {
          id: "orders:list",
          type: "orders",
          source: "orders",
          statuses: ["loading", "ready", "error"]
        }
      ]);
    }
    if (textUrl === "http://bridge.test/runtimes/runtime-1/snapshot") {
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
    if (textUrl === "http://bridge.test/runtimes/runtime-1/actions") {
      return jsonResponse([
        {
          name: "orders.refresh",
          source: "orders",
          risk: "safe",
          enabled: true,
          hasInputOptions: false
        }
      ]);
    }
    if (textUrl === "http://bridge.test/runtimes/runtime-1/events?limit=50") {
      return jsonResponse([
        {
          id: 1,
          type: "snapshot.updated",
          targetId: "orders:list",
          status: "ready"
        }
      ]);
    }
    return jsonResponse({});
  };
}

function createBrowserRunner(run) {
  return {
    run
  };
}
