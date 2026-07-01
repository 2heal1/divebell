import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { test } from "@rstest/core";

import {
  cliPackageInfo,
  createOpenRuntimeCli,
  getCliCommandName,
  runCli,
  type OpenRuntimeCliExtension
} from "../dist/index.js";
import { createDefaultBrowserProfileDirectory, createNextBrowserEnvironment, type BrowserRunOptions, type BrowserRunner } from "../dist/browser.js";
import { isEntryPoint } from "../dist/entry.js";
import { createCliReferenceMarkdown, createCliSkillSectionMarkdown } from "../dist/help.js";
import { exportChromeAuthProfile, filterStorageStateByDomains, resolveChromeProfile } from "../dist/profile.js";

test("exposes the cli package marker", () => {
  assert.equal(getCliCommandName(), "open-runtime");
  assert.deepEqual(cliPackageInfo, {
    name: "@openruntime/cli",
    phase: "phase-0",
    role: "agent command line"
  });
});

test("prints explicit runtime resource help", async () => {
  const output = createOutput();
  const exitCode = await runCli(["--help"], {
    stdout: output.stdout,
    stderr: output.stderr
  });

  assert.equal(exitCode, 0);
  assert.equal(output.errorText(), "");
  assert.match(output.text(), /open-runtime snapshot .*--id <id>/);
  assert.match(output.text(), /open-runtime events .*--target-id <id>.*--limit <n>.*--query <keyword>/);
  assert.match(output.text(), /open-runtime actions .*--name <name>/);
  assert.match(output.text(), /open-runtime open <url> .*--ui/);
  assert.match(output.text(), /open-runtime export-profile .*--source chrome\|openruntime.*--domain <domain>.*--chrome-profile <name>/);
  assert.match(output.text(), /open-runtime import-profile <content-or-path> \| --input <path>/);
  assert.match(output.text(), /open-runtime record --url <url> --out <path>/);
  assert.match(output.text(), /open-runtime record start \[--url <url>\] \[--out <path>\]/);
  assert.match(output.text(), /open-runtime record stop --out <path>/);
  assert.match(output.text(), /open-runtime record generate-script --input <path>/);
  assert.match(output.text(), /open-runtime network \[--url <query>\]/);
  assert.match(output.text(), /open-runtime console \[--level <level>\] \[--query <keyword>\] \[--limit <n>\]/);
  assert.match(output.text(), /open-runtime wait-for .*--next/);
  assert.doesNotMatch(output.text(), /open-runtime vmok /);
});

test("prints help for command help without executing the command", async () => {
  for (const command of ["start", "open", "events"]) {
    let touchedSideEffect = false;
    const output = createOutput();
    const exitCode = await runCli([command, "--help"], {
      stdout: output.stdout,
      stderr: output.stderr,
      fetcher: async () => {
        touchedSideEffect = true;
        throw new Error("fetcher should not be called");
      },
      bridgeStarter: {
        start: async () => {
          touchedSideEffect = true;
          throw new Error("bridge should not be started");
        }
      },
      browserRunner: createBrowserRunner(async () => {
        touchedSideEffect = true;
        return {
          exitCode: 1,
          stdout: "",
          stderr: "browser should not be opened"
        };
      })
    });

    assert.equal(exitCode, 0);
    assert.equal(output.errorText(), "");
    assert.match(output.text(), /Usage:/);
    assert.equal(touchedSideEffect, false);
  }
});

test("generates CLI reference markdown from the help table", () => {
  const markdown = createCliReferenceMarkdown();

  assert.match(markdown, /open-runtime open <url>/);
  assert.match(markdown, /open-runtime export-profile .*--source chrome\|openruntime.*--domain <domain>/);
  assert.match(markdown, /open-runtime import-profile <content-or-path>/);
  assert.match(markdown, /open-runtime record --url <url> --out <path>/);
  assert.match(markdown, /open-runtime record start \[--url <url>\] \[--out <path>\]/);
  assert.match(markdown, /open-runtime record stop --out <path>/);
  assert.match(markdown, /open-runtime record generate-script --input <path>/);
  assert.match(markdown, /open-runtime get-window <path>/);
  assert.match(markdown, /open-runtime network \[--url <query>\]/);
  assert.match(markdown, /open-runtime console \[--level <level>\]/);
  assert.match(markdown, /open-runtime wait-for .*<target-id> <status>.*--next/);
  assert.doesNotMatch(markdown, /open-runtime vmok /);
});

test("generates the skill CLI command section from the help table", () => {
  const markdown = createCliSkillSectionMarkdown();

  assert.match(markdown, /^## CLI 命令/m);
  assert.match(markdown, /open-runtime open <url>/);
  assert.match(markdown, /open-runtime export-profile .*--source chrome\|openruntime.*--domain <domain>/);
  assert.match(markdown, /open-runtime import-profile <content-or-path>/);
  assert.match(markdown, /open-runtime record --url <url> --out <path>/);
  assert.match(markdown, /open-runtime record start \[--url <url>\] \[--out <path>\]/);
  assert.match(markdown, /open-runtime record stop --out <path>/);
  assert.match(markdown, /open-runtime record generate-script --input <path>/);
  assert.match(markdown, /open-runtime get-window <path>/);
  assert.match(markdown, /open-runtime network \[--url <query>\]/);
  assert.match(markdown, /open-runtime console \[--level <level>\]/);
  assert.match(markdown, /open-runtime wait-for .*<target-id> <status>.*--next/);
  assert.doesNotMatch(markdown, /open-runtime vmok /);
});

test("registers an extension command and merges its help entries", async () => {
  const extension: OpenRuntimeCliExtension = {
    name: "demo",
    commandReferences: [
      {
        category: "Extensions",
        usage: "open-runtime demo ping [--url <url>]",
        description: "Runs a demo extension command."
      }
    ],
    exampleReferences: [
      {
        command: "open-runtime demo ping",
        description: "Runs the demo extension."
      }
    ],
    run: async ({ args, stdout, bridgeUrl, runtimeSelector }) => {
      stdout.write(`${JSON.stringify({
        command: args.command,
        bridgeUrl,
        runtimeSelector
      })}\n`);
      return 0;
    }
  };
  const cli = createOpenRuntimeCli({ extensions: [extension] });

  assert.match(cli.createHelpText(), /open-runtime demo ping/);
  assert.deepEqual(cli.getCommandReferences().at(-1), extension.commandReferences?.[0]);
  assert.deepEqual(cli.getExampleReferences().at(-1), extension.exampleReferences?.[0]);

  const output = createOutput();
  const exitCode = await cli.run([
    "demo",
    "ping",
    "--bridge",
    "http://bridge.test",
    "--session",
    "session-1",
    "--url",
    "http://app.test/"
  ], {
    stdout: output.stdout,
    stderr: output.stderr
  });

  assert.equal(exitCode, 0);
  assert.equal(output.errorText(), "");
  assert.deepEqual(JSON.parse(output.text()), {
    command: ["demo", "ping"],
    bridgeUrl: "http://bridge.test",
    runtimeSelector: {
      sessionId: "session-1",
      url: "http://app.test/?openruntimeSessionId=session-1"
    }
  });
});

test("rejects extensions that conflict with built-in commands", () => {
  assert.throws(
    () => createOpenRuntimeCli({
      extensions: [
        {
          name: "snapshot",
          run: async () => 0
        }
      ]
    }),
    /conflicts with a built-in command/
  );
});

test("rejects duplicate extension command names", () => {
  assert.throws(
    () => createOpenRuntimeCli({
      extensions: [
        {
          name: "demo",
          run: async () => 0
        },
        {
          name: "demo",
          run: async () => 0
        }
      ]
    }),
    /registered more than once/
  );
});

test("configures next-browser with a persistent OpenRuntime profile", () => {
  const env = createNextBrowserEnvironment({
    NODE_OPTIONS: "--enable-source-maps",
    OPENRUNTIME_BROWSER_PROFILE_DIR: "/tmp/custom-openruntime-profile"
  });

  assert.equal(env.OPENRUNTIME_NEXT_BROWSER_PROFILE_DIR, "/tmp/custom-openruntime-profile");
  assert.equal(env.NEXT_BROWSER_HEADLESS, "1");
  assert.match(env.NODE_OPTIONS ?? "", /--enable-source-maps/);
  assert.match(env.NODE_OPTIONS ?? "", /--import file:\/\//);
});

test("allows visible browser mode for next-browser", () => {
  const env = createNextBrowserEnvironment({
    NEXT_BROWSER_HEADLESS: "1"
  }, undefined, { ui: true });

  assert.equal(env.NEXT_BROWSER_HEADLESS, undefined);
});

test("uses the default OpenRuntime browser profile directory", () => {
  const env = createNextBrowserEnvironment({});

  assert.equal(env.OPENRUNTIME_NEXT_BROWSER_PROFILE_DIR, createDefaultBrowserProfileDirectory());
});

test("records browser snapshots and OpenRuntime runtime samples into an orrec directory", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-recording-"));
  const outputDir = join(tempDir, "demo.orrec");
  const browserCalls: Array<{ args: string[]; options?: BrowserRunOptions }> = [];
  const fetchUrls: string[] = [];
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
  const browserCalls: Array<{ args: string[]; options?: BrowserRunOptions }> = [];
  const fetchUrls: string[] = [];

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
    assert.equal(completedManifest.counts.operations, 9);

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
  const browserCalls: Array<{ args: string[]; options?: BrowserRunOptions }> = [];

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

test("starts a manual recording with a blank page and default recordings output", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-default-recording-"));
  const originalCwd = process.cwd();
  const originalProfileDirectory = process.env.OPENRUNTIME_BROWSER_PROFILE_DIR;
  process.env.OPENRUNTIME_BROWSER_PROFILE_DIR = join(tempDir, "browser-profile");
  const browserCalls: Array<{ args: string[]; options?: BrowserRunOptions }> = [];
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

test("resolves the last used local Chrome profile by default", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-cli-chrome-profile-"));
  try {
    mkdirSync(join(tempDir, "Default"), {
      recursive: true
    });
    mkdirSync(join(tempDir, "Profile 1"), {
      recursive: true
    });
    writeFileSync(join(tempDir, "Local State"), JSON.stringify({
      profile: {
        last_used: "Profile 1",
        info_cache: {
          Default: {
            name: "匿名",
            user_name: ""
          },
          "Profile 1": {
            name: "work",
            user_name: "work@example.com"
          }
        }
      }
    }));

    assert.equal(resolveChromeProfile({
      userDataDirectory: tempDir,
      env: {
        HOME: tempDir
      },
      platform: "darwin"
    }).profileDirectoryName, "Profile 1");
    assert.equal(resolveChromeProfile({
      userDataDirectory: tempDir,
      profile: "work@example.com"
    }).profileDirectoryName, "Profile 1");
  } finally {
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});

test("fails fast when the local Chrome profile is already in use", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-cli-chrome-profile-lock-"));
  try {
    mkdirSync(join(tempDir, "Profile 1"), {
      recursive: true
    });
    writeFileSync(join(tempDir, "Local State"), JSON.stringify({
      profile: {
        last_used: "Profile 1",
        info_cache: {
          "Profile 1": {
            name: "work",
            user_name: "work@example.com"
          }
        }
      }
    }));
    writeFileSync(join(tempDir, "SingletonLock"), "");

    await assert.rejects(
      exportChromeAuthProfile({
        userDataDirectory: tempDir
      }),
      /Could not read Chrome profile "work \/ work@example\.com \/ Profile 1"\. Chrome profile is currently in use\. Quit Google Chrome and retry\./
    );
  } finally {
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});

test("filters exported auth state by domain", () => {
  assert.deepEqual(filterStorageStateByDomains({
    cookies: [
      {
        name: "github-session",
        domain: ".github.com",
        path: "/"
      },
      {
        name: "api-session",
        domain: "api.github.com",
        path: "/"
      },
      {
        name: "npm-session",
        domain: "npmjs.com",
        path: "/"
      }
    ],
    origins: [
      {
        origin: "https://github.com",
        localStorage: [
          {
            name: "theme",
            value: "dark"
          }
        ]
      },
      {
        origin: "https://gist.github.com",
        localStorage: []
      },
      {
        origin: "https://npmjs.com",
        localStorage: []
      }
    ]
  }, ["github.com"]), {
    cookies: [
      {
        name: "github-session",
        domain: ".github.com",
        path: "/"
      },
      {
        name: "api-session",
        domain: "api.github.com",
        path: "/"
      }
    ],
    origins: [
      {
        origin: "https://github.com",
        localStorage: [
          {
            name: "theme",
            value: "dark"
          }
        ]
      },
      {
        origin: "https://gist.github.com",
        localStorage: []
      }
    ]
  });
});

test("passes keyword query to events", async () => {
  const calls: string[] = [];
  const output = createOutput();
  const exitCode = await runCli(["events", "--bridge", "http://bridge.test", "--query", "react", "--limit", "50"], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      calls.push(String(url));
      if (String(url).endsWith("/runtimes")) {
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

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-1/events?limit=50&query=react");
      return jsonResponse({
        events: [],
        latestEventId: 0,
        truncated: false
      });
    }
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [
    "http://bridge.test/runtimes",
    "http://bridge.test/runtimes/runtime-1/events?limit=50&query=react"
  ]);
});

test("keeps the persistent profile when next-browser closes its temporary profile", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-cli-profile-"));
  const profileDirectory = join(tempDir, "profile");
  const temporaryProfileDirectory = join(tempDir, "next-browser-profile-test");
  const preloadUrl = pathToFileURL(join(process.cwd(), "dist", "next-browser-profile-preload.js")).href;
  const script = [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    `const tempProfile = ${JSON.stringify(temporaryProfileDirectory)};`,
    "fs.mkdirSync(tempProfile, { recursive: true });",
    "fs.writeFileSync(path.join(tempProfile, 'login-state'), 'kept');",
    "fs.rmSync(tempProfile, { recursive: true, force: true });"
  ].join("");

  try {
    const result = spawnSync(process.execPath, ["--import", preloadUrl, "-e", script], {
      encoding: "utf8",
      env: {
        ...process.env,
        OPENRUNTIME_NEXT_BROWSER_PROFILE_DIR: profileDirectory
      }
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(profileDirectory, "login-state")), true);
  } finally {
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});

test("exports local Chrome auth profile by default", async () => {
  const output = createOutput();
  let chromeOptions: unknown;
  let browserWasClosed = false;
  const exitCode = await runCli([
    "export-profile",
    "--chrome-profile",
    "work@example.com",
    "--chrome-user-data-dir",
    "/tmp/chrome-user-data",
    "--domain",
    "github.com",
    "--timeout",
    "120000",
    "--output",
    "/tmp/chrome-auth.oprprofile"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    browserRunner: createBrowserRunner(async () => {
      browserWasClosed = true;
      return {
        exitCode: 0,
        stdout: "",
        stderr: ""
      };
    }),
    exportChromeAuthProfile: async (options) => {
      chromeOptions = options;
      return {
        kind: "auth",
        path: "/tmp/chrome-auth.oprprofile"
      };
    }
  });

  assert.equal(exitCode, 0);
  assert.equal(output.errorText(), "");
  assert.equal(output.text(), "/tmp/chrome-auth.oprprofile\n");
  assert.equal(browserWasClosed, false);
  assert.deepEqual(chromeOptions, {
    outputPath: "/tmp/chrome-auth.oprprofile",
    userDataDirectory: "/tmp/chrome-user-data",
    profile: "work@example.com",
    timeout: 120000,
    domains: ["github.com"]
  });
});

test("writes oversized profile export content to a temporary file", async () => {
  const output = createOutput();
  const content = `openruntime-profile:v1:auth:${"a".repeat(40_000)}`;
  const exitCode = await runCli(["export-profile"], {
    stdout: output.stdout,
    stderr: output.stderr,
    exportChromeAuthProfile: async () => ({
      kind: "auth",
      content
    })
  });
  const path = output.text().trim();

  try {
    assert.equal(exitCode, 0);
    assert.equal(output.errorText(), "");
    assert.match(path, /openruntime-profile-export-.+\/openruntime-profile\.oprprofile$/);
    assert.equal(readFileSync(path, "utf8"), `${content}\n`);
  } finally {
    if (path.includes("openruntime-profile-export-") && existsSync(path)) {
      rmSync(dirname(path), {
        recursive: true,
        force: true
      });
    }
  }
});

test("rejects full profile export", async () => {
  const output = createOutput();
  let chromeWasRead = false;
  const exitCode = await runCli(["export-profile", "--full"], {
    stdout: output.stdout,
    stderr: output.stderr,
    exportChromeAuthProfile: async () => {
      chromeWasRead = true;
      return {
        kind: "auth",
        content: "unexpected"
      };
    }
  });

  assert.equal(exitCode, 1);
  assert.equal(output.text(), "");
  assert.match(output.errorText(), /--full is not supported by export-profile/);
  assert.equal(chromeWasRead, false);
});

test("prints runtimes from the configured bridge", async () => {
  const output = createOutput();
  const exitCode = await runCli(["runtimes", "--bridge", "http://bridge.test"], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      assert.equal(String(url), "http://bridge.test/runtimes");
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
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(JSON.parse(output.text()), {
    bridgeUrl: "http://bridge.test",
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
});

test("selects the latest matching runtime for read commands", async () => {
  const calls: string[] = [];
  const output = createOutput();
  const exitCode = await runCli(["snapshot", "--bridge", "http://bridge.test", "--url", "http://app.test/"], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      calls.push(String(url));
      if (String(url).endsWith("/runtimes")) {
        return jsonResponse({
          runtimes: [
            {
              runtimeId: "runtime-old",
              url: "http://app.test/",
              status: "connected",
              connectedAt: 1,
              lastSeenAt: 2
            },
            {
              runtimeId: "runtime-new",
              url: "http://app.test/",
              status: "connected",
              connectedAt: 3,
              lastSeenAt: 4
            }
          ]
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-new/snapshot");
      return jsonResponse({
        targets: {},
        latestEventId: 0,
        capturedAt: 10
      });
    }
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [
    "http://bridge.test/runtimes",
    "http://bridge.test/runtimes/runtime-new/snapshot"
  ]);
  assert.deepEqual(JSON.parse(output.text()), {
    runtime: {
      runtimeId: "runtime-new",
      url: "http://app.test/",
      status: "connected",
      connectedAt: 3,
      lastSeenAt: 4
    },
    result: {
      targets: {},
      latestEventId: 0,
      capturedAt: 10
    }
  });
});

test("matches runtime url when root path trailing slash differs", async () => {
  const output = createOutput();
  const exitCode = await runCli(["snapshot", "--bridge", "http://bridge.test", "--url", "http://app.test"], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      if (String(url).endsWith("/runtimes")) {
        return jsonResponse({
          runtimes: [
            {
              runtimeId: "runtime-root",
              url: "http://app.test/",
              status: "connected",
              connectedAt: 1,
              lastSeenAt: 2
            }
          ]
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-root/snapshot");
      return jsonResponse({
        targets: {},
        latestEventId: 0,
        capturedAt: 10
      });
    }
  });

  assert.equal(exitCode, 0);
  assert.equal(JSON.parse(output.text()).runtime.runtimeId, "runtime-root");
});

test("matches runtime url when the runtime only adds the OpenRuntime session query", async () => {
  const output = createOutput();
  const exitCode = await runCli(["snapshot", "--bridge", "http://bridge.test", "--url", "http://app.test"], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      if (String(url).endsWith("/runtimes")) {
        return jsonResponse({
          runtimes: [
            {
              runtimeId: "runtime-session-url",
              url: "http://app.test/?openruntimeSessionId=session-orders",
              status: "connected",
              connectedAt: 1,
              lastSeenAt: 2
            }
          ]
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-session-url/snapshot");
      return jsonResponse({
        targets: {},
        latestEventId: 0,
        capturedAt: 10
      });
    }
  });

  assert.equal(exitCode, 0);
  assert.equal(JSON.parse(output.text()).runtime.runtimeId, "runtime-session-url");
});

test("selects the latest matching runtime by session", async () => {
  const calls: string[] = [];
  const output = createOutput();
  const exitCode = await runCli(["snapshot", "--bridge", "http://bridge.test", "--session", "session-orders"], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      calls.push(String(url));
      if (String(url).endsWith("/runtimes")) {
        return jsonResponse({
          runtimes: [
            {
              runtimeId: "runtime-other",
              url: "http://app.test/orders",
              sessionId: "session-other",
              status: "connected",
              connectedAt: 1,
              lastSeenAt: 20
            },
            {
              runtimeId: "runtime-before-refresh",
              url: "http://app.test/orders?openruntimeSessionId=session-orders",
              sessionId: "session-orders",
              status: "disconnected",
              connectedAt: 1,
              lastSeenAt: 2,
              disconnectedAt: 3
            },
            {
              runtimeId: "runtime-after-refresh",
              url: "http://app.test/orders?openruntimeSessionId=session-orders",
              sessionId: "session-orders",
              status: "connected",
              connectedAt: 4,
              lastSeenAt: 5
            }
          ]
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-after-refresh/snapshot");
      return jsonResponse({
        targets: {},
        latestEventId: 0,
        capturedAt: 10
      });
    }
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [
    "http://bridge.test/runtimes",
    "http://bridge.test/runtimes/runtime-after-refresh/snapshot"
  ]);
  assert.equal(JSON.parse(output.text()).runtime.runtimeId, "runtime-after-refresh");
});

test("selects runtime by session from the runtime url when sessionId is not exposed", async () => {
  const output = createOutput();
  const exitCode = await runCli(["snapshot", "--bridge", "http://bridge.test", "--session", "session-orders"], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      if (String(url).endsWith("/runtimes")) {
        return jsonResponse({
          runtimes: [
            {
              runtimeId: "runtime-other",
              url: "http://app.test/orders?openruntimeSessionId=session-other",
              status: "connected",
              connectedAt: 1,
              lastSeenAt: 20
            },
            {
              runtimeId: "runtime-orders",
              url: "http://app.test/orders?openruntimeSessionId=session-orders",
              status: "connected",
              connectedAt: 1,
              lastSeenAt: 30
            }
          ]
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-orders/snapshot");
      return jsonResponse({
        targets: {},
        latestEventId: 0,
        capturedAt: 10
      });
    }
  });

  assert.equal(exitCode, 0);
  assert.equal(JSON.parse(output.text()).runtime.runtimeId, "runtime-orders");
});

test("runs execution commands against the selected runtime", async () => {
  const calls: Array<{ url: string; method?: string; body?: unknown }> = [];
  const runtimes = [
    {
      runtimeId: "runtime-1",
      url: "http://app.test/",
      status: "connected",
      connectedAt: 1,
      lastSeenAt: 2
    }
  ];
  const fetcher = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const call: {
      url: string;
      method?: string;
      body?: unknown;
    } = {
      url: String(url)
    };
    if (init?.method !== undefined) {
      call.method = init.method;
    }
    if (init?.body !== undefined) {
      call.body = JSON.parse(String(init.body));
    }
    calls.push(call);

    const textUrl = String(url);
    if (textUrl.endsWith("/runtimes")) {
      return jsonResponse({ runtimes });
    }
    if (textUrl.includes("/actions/route.pick/options")) {
      return jsonResponse([{ value: "hangzhou" }]);
    }
    if (textUrl.includes("/actions/route.pick/run")) {
      return jsonResponse({ success: true, actionName: "route.pick" });
    }
    if (textUrl.endsWith("/wait-for")) {
      return jsonResponse({
        success: true,
        condition: {
          id: "route:/home",
          status: "ready"
        },
        snapshot: {
          targets: {},
          latestEventId: 0,
          capturedAt: 10
        }
      });
    }

    return jsonResponse({});
  };

  assert.equal(await runCli([
    "input-options",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://app.test/",
    "--action",
    "route.pick",
    "--input",
    "city",
    "--payload",
    "{\"region\":\"zhejiang\"}",
    "--timeout",
    "20"
  ], {
    stdout: createOutput().stdout,
    stderr: createOutput().stderr,
    fetcher
  }), 0);

  assert.equal(await runCli([
    "run-action",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://app.test/",
    "route.pick",
    "--payload",
    "{\"city\":\"hangzhou\"}"
  ], {
    stdout: createOutput().stdout,
    stderr: createOutput().stderr,
    fetcher
  }), 0);

  assert.equal(await runCli([
    "wait-for",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://app.test/",
    "route:/home",
    "ready",
    "--strict",
    "--where",
    "matches.pathname=/orders",
    "--where",
    "data.mounted=true",
    "--where",
    "data.matchedCount=1",
    "--where",
    "data.optional=null",
    "--timeout",
    "30"
  ], {
    stdout: createOutput().stdout,
    stderr: createOutput().stderr,
    fetcher
  }), 0);

  assert.deepEqual(calls, [
    {
      url: "http://bridge.test/runtimes"
    },
    {
      url: "http://bridge.test/runtimes/runtime-1/actions/route.pick/options?input=city&payload=%7B%22region%22%3A%22zhejiang%22%7D&timeout=20"
    },
    {
      url: "http://bridge.test/runtimes"
    },
    {
      url: "http://bridge.test/runtimes/runtime-1/actions/route.pick/run",
      method: "POST",
      body: {
        payload: {
          city: "hangzhou"
        }
      }
    },
    {
      url: "http://bridge.test/runtimes"
    },
    {
      url: "http://bridge.test/runtimes/runtime-1/wait-for",
      method: "POST",
      body: {
        targetId: "route:/home",
        status: "ready",
        timeout: 30,
        where: [
          {
            path: "matches.pathname",
            equals: "/orders"
          },
          {
            path: "data.mounted",
            equals: true
          },
          {
            path: "data.matchedCount",
            equals: 1
          },
          {
            path: "data.optional",
            equals: null
          }
        ]
      }
    }
  ]);
});

test("wait-for follows the latest matching runtime unless strict mode is set", async () => {
  const calls: Array<{ url: string; method?: string; body?: unknown }> = [];
  const output = createOutput();
  const exitCode = await runCli([
    "wait-for",
    "--bridge",
    "http://bridge.test",
    "--runtime",
    "runtime-before-refresh",
    "--url",
    "http://app.test/orders",
    "modern:route",
    "ready",
    "--timeout",
    "300"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url, init) => {
      const call: {
        url: string;
        method?: string;
        body?: unknown;
      } = {
        url: String(url)
      };
      if (init?.method !== undefined) {
        call.method = init.method;
      }
      if (init?.body !== undefined) {
        call.body = JSON.parse(String(init.body));
      }
      calls.push(call);

      if (String(url) === "http://bridge.test/runtimes") {
        return jsonResponse({
          runtimes: [
            {
              runtimeId: "runtime-before-refresh",
              url: "http://app.test/orders",
              status: "disconnected",
              connectedAt: 1,
              lastSeenAt: 2,
              disconnectedAt: 3
            },
            {
              runtimeId: "runtime-after-refresh",
              url: "http://app.test/orders",
              status: "connected",
              connectedAt: 4,
              lastSeenAt: 5
            }
          ]
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-after-refresh/wait-for");
      assert.equal(init?.method, "POST");
      return jsonResponse({
        success: true,
        condition: {
          id: "modern:route",
          status: "ready"
        },
        snapshot: {
          targets: {},
          latestEventId: 0,
          capturedAt: 10
        }
      });
    }
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls.map((call) => call.url), [
    "http://bridge.test/runtimes",
    "http://bridge.test/runtimes/runtime-after-refresh/wait-for"
  ]);
  assert.equal(JSON.parse(output.text()).runtime.runtimeId, "runtime-after-refresh");
});

test("wait-for waits for a runtime to connect when none is currently connected", async () => {
  const calls: string[] = [];
  let runtimesCalls = 0;

  const output = createOutput();
  const exitCode = await runCli([
    "wait-for",
    "--bridge",
    "http://bridge.test",
    "modern:route",
    "ready",
    "--timeout",
    "350"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url, init) => {
      calls.push(String(url));

      if (String(url) === "http://bridge.test/runtimes") {
        runtimesCalls += 1;
        return jsonResponse({
          runtimes: runtimesCalls < 2
            ? []
            : [
                {
                  runtimeId: "runtime-new",
                  url: "http://app.test/orders",
                  status: "connected",
                  connectedAt: 1,
                  lastSeenAt: 2
                }
              ]
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-new/wait-for");
      assert.equal(init?.method, "POST");
      return jsonResponse({
        success: true,
        condition: {
          id: "modern:route",
          status: "ready"
        },
        snapshot: {
          targets: {},
          latestEventId: 0,
          capturedAt: 10
        }
      });
    }
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [
    "http://bridge.test/runtimes",
    "http://bridge.test/runtimes",
    "http://bridge.test/runtimes/runtime-new/wait-for"
  ]);
  assert.equal(JSON.parse(output.text()).runtime.runtimeId, "runtime-new");
});

test("wait-for keeps following when the current runtime has not registered the target", async () => {
  const calls: string[] = [];
  let runtimesCalls = 0;

  const output = createOutput();
  const exitCode = await runCli([
    "wait-for",
    "--bridge",
    "http://bridge.test",
    "modern:route",
    "ready",
    "--timeout",
    "500"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      calls.push(String(url));

      if (String(url) === "http://bridge.test/runtimes") {
        runtimesCalls += 1;
        return jsonResponse({
          runtimes: runtimesCalls < 2
            ? [
                {
                  runtimeId: "runtime-old",
                  url: "http://app.test/orders",
                  status: "connected",
                  connectedAt: 1,
                  lastSeenAt: 2
                }
              ]
            : [
                {
                  runtimeId: "runtime-old",
                  url: "http://app.test/orders",
                  status: "disconnected",
                  connectedAt: 1,
                  lastSeenAt: 2,
                  disconnectedAt: 3
                },
                {
                  runtimeId: "runtime-new",
                  url: "http://app.test/orders",
                  status: "connected",
                  connectedAt: 4,
                  lastSeenAt: 5
                }
              ]
        });
      }

      if (String(url) === "http://bridge.test/runtimes/runtime-old/wait-for") {
        return jsonResponse({
          success: false,
          condition: {
            id: "modern:route",
            status: "ready"
          },
          snapshot: {
            targets: {},
            latestEventId: 0,
            capturedAt: 10
          },
          reason: "Target is not registered."
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-new/wait-for");
      return jsonResponse({
        success: true,
        condition: {
          id: "modern:route",
          status: "ready"
        },
        snapshot: {
          targets: {},
          latestEventId: 0,
          capturedAt: 20
        }
      });
    }
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [
    "http://bridge.test/runtimes",
    "http://bridge.test/runtimes/runtime-old/wait-for",
    "http://bridge.test/runtimes",
    "http://bridge.test/runtimes/runtime-new/wait-for"
  ]);
  assert.equal(JSON.parse(output.text()).runtime.runtimeId, "runtime-new");
});

test("wait-for next ignores runtimes that were connected before the command started", async () => {
  const calls: string[] = [];
  let runtimesCalls = 0;

  const output = createOutput();
  const exitCode = await runCli([
    "wait-for",
    "--bridge",
    "http://bridge.test",
    "modern:route",
    "ready",
    "--next",
    "--timeout",
    "500"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url, init) => {
      calls.push(String(url));

      if (String(url) === "http://bridge.test/runtimes") {
        runtimesCalls += 1;
        return jsonResponse({
          runtimes: runtimesCalls < 3
            ? [
                {
                  runtimeId: "runtime-existing",
                  url: "http://app.test/orders",
                  status: "connected",
                  connectedAt: 1,
                  lastSeenAt: 2
                }
              ]
            : [
                {
                  runtimeId: "runtime-existing",
                  url: "http://app.test/orders",
                  status: "connected",
                  connectedAt: 1,
                  lastSeenAt: 2
                },
                {
                  runtimeId: "runtime-next",
                  url: "http://app.test/orders",
                  status: "connected",
                  connectedAt: 3,
                  lastSeenAt: 4
                }
              ]
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-next/wait-for");
      assert.equal(init?.method, "POST");
      return jsonResponse({
        success: true,
        condition: {
          id: "modern:route",
          status: "ready"
        },
        snapshot: {
          targets: {},
          latestEventId: 0,
          capturedAt: 10
        }
      });
    }
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [
    "http://bridge.test/runtimes",
    "http://bridge.test/runtimes",
    "http://bridge.test/runtimes",
    "http://bridge.test/runtimes/runtime-next/wait-for"
  ]);
  assert.equal(JSON.parse(output.text()).runtime.runtimeId, "runtime-next");
});

test("wait-for next reports when no new runtime connects before timeout", async () => {
  const output = createOutput();
  const exitCode = await runCli([
    "wait-for",
    "--bridge",
    "http://bridge.test",
    "modern:route",
    "ready",
    "--next",
    "--timeout",
    "20"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      assert.equal(String(url), "http://bridge.test/runtimes");
      return jsonResponse({
        runtimes: [
          {
            runtimeId: "runtime-existing",
            url: "http://app.test/orders",
            status: "connected",
            connectedAt: 1,
            lastSeenAt: 2
          }
        ]
      });
    }
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(JSON.parse(output.text()), {
    result: {
      success: false,
      condition: {
        id: "modern:route",
        status: "ready"
      },
      reason: "No new connected runtime was found before timeout."
    }
  });
  assert.equal(output.errorText(), "No new connected runtime was found before timeout.\n");
});

test("wait-for rejects next with strict mode", async () => {
  const output = createOutput();
  const exitCode = await runCli([
    "wait-for",
    "--bridge",
    "http://bridge.test",
    "modern:route",
    "ready",
    "--next",
    "--strict"
  ], {
    stdout: output.stdout,
    stderr: output.stderr
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(JSON.parse(output.text()), {
    result: {
      success: false,
      condition: {
        id: "modern:route",
        status: "ready"
      },
      reason: "--next cannot be used with --strict."
    }
  });
  assert.equal(output.errorText(), "--next cannot be used with --strict.\n");
});

test("wait-for returns a failing exit code with structured output when the condition is not met", async () => {
  const output = createOutput();
  const exitCode = await runCli([
    "wait-for",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://app.test/orders",
    "modern:route",
    "ready",
    "--timeout",
    "20"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      if (String(url) === "http://bridge.test/runtimes") {
        return jsonResponse({
          runtimes: [
            {
              runtimeId: "runtime-1",
              url: "http://app.test/orders",
              status: "connected",
              connectedAt: 1,
              lastSeenAt: 2
            }
          ]
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-1/wait-for");
      return jsonResponse({
        success: false,
        condition: {
          id: "modern:route",
          status: "ready"
        },
        snapshot: {
          targets: {},
          latestEventId: 0,
          capturedAt: 10
        },
        reason: "Timed out waiting for target status."
      });
    }
  });

  assert.equal(exitCode, 1);
  assert.equal(output.errorText(), "");
  assert.deepEqual(JSON.parse(output.text()), {
    runtime: {
      runtimeId: "runtime-1",
      url: "http://app.test/orders",
      status: "connected",
      connectedAt: 1,
      lastSeenAt: 2
    },
    result: {
      success: false,
      condition: {
        id: "modern:route",
        status: "ready"
      },
      snapshot: {
        targets: {},
        latestEventId: 0,
        capturedAt: 10
      },
      reason: "Timed out waiting for target status."
    }
  });
});

test("opens a browser page and auto-starts the bridge when needed", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  let bridgeStarted = false;

  const exitCode = await runCli(["open", "http://app.test/", "--port", "18080"], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      assert.equal(String(url), "http://localhost:18080/runtimes");
      if (!bridgeStarted) {
        throw new TypeError("fetch failed");
      }
      return jsonResponse({ runtimes: [] });
    },
    bridgeStarter: {
      start: async ({ port }) => {
        assert.equal(port, 18080);
        bridgeStarted = true;
      }
    },
    browserRunner: createBrowserRunner(async (args) => {
      browserCalls.push(args);
      return {
        exitCode: 0,
        stdout: "opened\n",
        stderr: ""
      };
    })
  });

  assert.equal(exitCode, 0);
  assert.equal(output.text(), "opened\n");
  assert.equal(output.errorText(), "");
  assert.deepEqual(browserCalls, [["open", "http://app.test/"]]);
});

test("opens a browser page with a stable OpenRuntime session", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];

  const exitCode = await runCli(["open", "http://app.test/orders?region=cn#details", "--session", "session-orders"], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async () => jsonResponse({ runtimes: [] }),
    bridgeStarter: {
      start: async () => ({ pid: 12345 })
    },
    browserRunner: createBrowserRunner(async (args) => {
      browserCalls.push(args);
      return {
        exitCode: 0,
        stdout: "opened\n",
        stderr: ""
      };
    })
  });

  assert.equal(exitCode, 0);
  assert.equal(output.text(), "opened\n");
  assert.deepEqual(browserCalls, [[
    "open",
    "http://app.test/orders?region=cn&openruntimeSessionId=session-orders#details"
  ]]);
});

test("opens a browser page without touching the bridge when no-bridge is set", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  const browserOptions: Array<BrowserRunOptions | undefined> = [];

  const exitCode = await runCli(["open", "http://app.test/", "--no-bridge"], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async () => {
      throw new Error("bridge should not be fetched");
    },
    bridgeStarter: {
      start: async () => {
        throw new Error("bridge should not be started");
      }
    },
    browserRunner: createBrowserRunner(async (args, options) => {
      browserCalls.push(args);
      browserOptions.push(options);
      return {
        exitCode: 0,
        stdout: "opened\n",
        stderr: ""
      };
    })
  });

  assert.equal(exitCode, 0);
  assert.equal(output.text(), "opened\n");
  assert.deepEqual(browserCalls, [["open", "http://app.test/"]]);
  assert.deepEqual(browserOptions, [{ ui: false }]);
});

test("opens a visible browser page when ui is set and keeps the session query", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  const browserOptions: Array<BrowserRunOptions | undefined> = [];

  const exitCode = await runCli(["open", "http://app.test/orders", "--session", "session-orders", "--ui", "--no-bridge"], {
    stdout: output.stdout,
    stderr: output.stderr,
    browserRunner: createBrowserRunner(async (args, options) => {
      browserCalls.push(args);
      browserOptions.push(options);
      return {
        exitCode: 0,
        stdout: "opened\n",
        stderr: ""
      };
    })
  });

  assert.equal(exitCode, 0);
  assert.equal(output.text(), "opened\n");
  assert.deepEqual(browserCalls, [["open", "http://app.test/orders?openruntimeSessionId=session-orders"]]);
  assert.deepEqual(browserOptions, [{ ui: true }]);
});

test("clicks interactive text with an exact page-side lookup", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];

  const exitCode = await runCli(["click", "Refresh order"], {
    stdout: output.stdout,
    stderr: output.stderr,
    browserRunner: createBrowserRunner(async (args) => {
      browserCalls.push(args);
      return {
        exitCode: 0,
        stdout: "{\"clicked\":true}\n",
        stderr: ""
      };
    })
  });

  assert.equal(exitCode, 0);
  assert.equal(output.text(), "clicked\n");
  assert.equal(output.errorText(), "");
  assert.equal(browserCalls.length, 1);
  assert.equal(browserCalls[0]?.[0], "eval");
  assert.match(browserCalls[0]?.[1] ?? "", /Refresh order/);
  assert.match(browserCalls[0]?.[1] ?? "", /querySelectorAll/);
});

test("delegates click refs and explicit selectors to next-browser", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];

  for (const target of ["e7", "[data-testid=refresh-order]", "text=Refresh order"]) {
    const exitCode = await runCli(["click", target], {
      stdout: output.stdout,
      stderr: output.stderr,
      browserRunner: createBrowserRunner(async (args) => {
        browserCalls.push(args);
        return {
          exitCode: 0,
          stdout: "clicked\n",
          stderr: ""
        };
      })
    });
    assert.equal(exitCode, 0);
  }

  assert.equal(output.text(), "clicked\nclicked\nclicked\n");
  assert.deepEqual(browserCalls, [
    ["click", "e7"],
    ["click", "[data-testid=refresh-order]"],
    ["click", "text=Refresh order"]
  ]);
});

test("reports interactive text click errors without broad text fallback", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];

  const exitCode = await runCli(["click", "Refresh order"], {
    stdout: output.stdout,
    stderr: output.stderr,
    browserRunner: createBrowserRunner(async (args) => {
      browserCalls.push(args);
      return {
        exitCode: 1,
        stdout: "",
        stderr: "Multiple interactive elements matched text \"Refresh order\""
      };
    })
  });

  assert.equal(exitCode, 1);
  assert.equal(output.text(), "");
  assert.match(output.errorText(), /Multiple interactive elements matched text "Refresh order"/);
  assert.equal(browserCalls.length, 1);
  assert.equal(browserCalls[0]?.[0], "eval");
});

test("starts the bridge in the background and returns after it is reachable", async () => {
  const output = createOutput();
  const stateDirectory = mkdtempSync(join(tmpdir(), "openruntime-cli-state-"));
  let bridgeStarted = false;

  try {
    const exitCode = await runCli(["start", "--port", "18081"], {
      stdout: output.stdout,
      stderr: output.stderr,
      bridgeStateDirectory: stateDirectory,
      fetcher: async (url) => {
        assert.equal(String(url), "http://localhost:18081/runtimes");
        if (!bridgeStarted) {
          throw new TypeError("fetch failed");
        }
        return jsonResponse({ runtimes: [] });
      },
      bridgeStarter: {
        start: async ({ port }) => {
          assert.equal(port, 18081);
          bridgeStarted = true;
          return { pid: 12345 };
        }
      }
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(output.text()), {
      bridgeUrl: "http://localhost:18081",
      pid: 12345,
      status: "started"
    });
  } finally {
    rmSync(stateDirectory, {
      recursive: true,
      force: true
    });
  }
});

test("stops by closing the browser session before stopping the bridge", async () => {
  const stateDirectory = mkdtempSync(join(tmpdir(), "openruntime-cli-state-"));
  const order: string[] = [];
  let bridgeStarted = false;

  try {
    assert.equal(await runCli(["start", "--port", "18082"], {
      stdout: createOutput().stdout,
      stderr: createOutput().stderr,
      bridgeStateDirectory: stateDirectory,
      fetcher: async () => {
        if (!bridgeStarted) {
          throw new TypeError("fetch failed");
        }
        return jsonResponse({ runtimes: [] });
      },
      bridgeStarter: {
        start: async () => {
          bridgeStarted = true;
          return { pid: 23456 };
        }
      }
    }), 0);

    const output = createOutput();
    const exitCode = await runCli(["stop", "--port", "18082"], {
      stdout: output.stdout,
      stderr: output.stderr,
      bridgeStateDirectory: stateDirectory,
      browserRunner: createBrowserRunner(async (args) => {
        order.push(args.join(" "));
        return {
          exitCode: 0,
          stdout: "",
          stderr: ""
        };
      }),
      bridgeProcessController: {
        isRunning: (pid) => {
          assert.equal(pid, 23456);
          return true;
        },
        stop: (pid) => {
          assert.equal(pid, 23456);
          order.push("bridge stop");
        }
      }
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(order, ["close", "bridge stop"]);
    assert.deepEqual(JSON.parse(output.text()), {
      browser: {
        command: "close",
        exitCode: 0
      },
      bridge: {
        bridgeUrl: "http://localhost:18082",
        pid: 23456,
        stopped: true
      }
    });
  } finally {
    rmSync(stateDirectory, {
      recursive: true,
      force: true
    });
  }
});

test("reads a window value through browser eval", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];

  const exitCode = await runCli(["get-window", "gf_data_v1"], {
    stdout: output.stdout,
    stderr: output.stderr,
    browserRunner: createBrowserRunner(async (args) => {
      browserCalls.push(args);
      assert.equal(args[0], "eval");
      assert.match(args[1] ?? "", /gf_data_v1/);
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          path: "gf_data_v1",
          found: true,
          value: {
            route: "route-a"
          }
        }),
        stderr: ""
      };
    })
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(JSON.parse(output.text()), {
    path: "gf_data_v1",
    found: true,
    value: {
      route: "route-a"
    }
  });
  assert.equal(browserCalls.length, 1);
});

test("waits for a browser eval condition", async () => {
  const output = createOutput();
  let attempts = 0;

  const exitCode = await runCli(["wait-eval", "window.gf_data_v1 != null", "--timeout", "500"], {
    stdout: output.stdout,
    stderr: output.stderr,
    browserRunner: createBrowserRunner(async (args) => {
      assert.equal(args[0], "eval");
      assert.match(args[1] ?? "", /window\.gf_data_v1/);
      attempts += 1;
      return {
        exitCode: 0,
        stdout: attempts === 1 ? "false\n" : "true\n",
        stderr: ""
      };
    })
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(JSON.parse(output.text()), {
    success: true,
    condition: {
      script: "window.gf_data_v1 != null"
    },
    value: true
  });
  assert.equal(attempts, 2);
});

test("filters browser network requests by url", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];

  const exitCode = await runCli(["network", "--url", "/api/orders"], {
    stdout: output.stdout,
    stderr: output.stderr,
    browserRunner: createBrowserRunner(async (args) => {
      browserCalls.push(args);
      return {
        exitCode: 0,
        stdout: [
          "# Network requests since last navigation",
          "# Columns: idx status method type ms url [next-action=...]",
          "# Use `network <idx>` for headers and body.",
          "",
          "0 200 GET fetch 12ms http://app.test/api/orders",
          "1 200 GET script 3ms http://app.test/assets/app.js",
          "2 FAIL GET xhr - http://app.test/api/orders/failed"
        ].join("\n"),
        stderr: ""
      };
    })
  });

  assert.equal(exitCode, 0);
  assert.equal(output.text(), [
    "# Network requests since last navigation",
    "# Columns: idx status method type ms url [next-action=...]",
    "",
    "0 200 GET fetch 12ms http://app.test/api/orders",
    "2 FAIL GET xhr - http://app.test/api/orders/failed",
    ""
  ].join("\n"));
  assert.deepEqual(browserCalls, [["network"]]);
});

test("filters browser console entries by level query and limit", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];

  const exitCode = await runCli(["console", "--level", "error", "--query", "react", "--limit", "1"], {
    stdout: output.stdout,
    stderr: output.stderr,
    browserRunner: createBrowserRunner(async (args) => {
      browserCalls.push(args);
      return {
        exitCode: 0,
        stdout: JSON.stringify([
          { level: "warn", args: "React warning", timestamp: 1 },
          { level: "error", args: "plain error", timestamp: 2 },
          { level: "error", args: "ReactCurrentDispatcher failed", timestamp: 3 },
          { level: "error", args: "React hydration failed", timestamp: 4 }
        ]),
        stderr: ""
      };
    })
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(JSON.parse(output.text()), {
    entries: [
      {
        level: "error",
        args: "React hydration failed",
        timestamp: 4
      }
    ],
    summary: {
      total: 1,
      log: 0,
      info: 0,
      warn: 0,
      error: 1
    }
  });
  assert.deepEqual(browserCalls, [[
    "eval",
    [
      "(() => {",
      "  const logs = window.__NEXT_BROWSER_CONSOLE_LOGS__;",
      "  return Array.isArray(logs) ? logs : [];",
      "})()"
    ].join("\n")
  ]]);
});

test("suggests open when wait-for cannot find a matching runtime", async () => {
  const output = createOutput();
  const exitCode = await runCli([
    "wait-for",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://app.test/route-a",
    "modern:route",
    "ready",
    "--timeout",
    "1"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      assert.equal(String(url), "http://bridge.test/runtimes");
      return jsonResponse({ runtimes: [] });
    }
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(JSON.parse(output.text()), {
    result: {
      success: false,
      condition: {
        id: "modern:route",
        status: "ready"
      },
      reason: "No connected runtime matched URL \"http://app.test/route-a\".\nUse --open to open the page before waiting."
    }
  });
  assert.equal(
    output.errorText(),
    "No connected runtime matched URL \"http://app.test/route-a\".\nUse --open to open the page before waiting.\n"
  );
});

test("opens a page before wait-for when open is set", async () => {
  const calls: Array<{ url: string; method?: string; body?: unknown }> = [];
  const browserCalls: string[][] = [];
  let opened = false;

  const output = createOutput();
  const exitCode = await runCli([
    "wait-for",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://app.test/route-a",
    "modern:route",
    "ready",
    "--where",
    "pathname=/route-a",
    "--open",
    "--timeout",
    "500"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url, init) => {
      const call: {
        url: string;
        method?: string;
        body?: unknown;
      } = {
        url: String(url)
      };
      if (init?.method !== undefined) {
        call.method = init.method;
      }
      if (init?.body !== undefined) {
        call.body = JSON.parse(String(init.body));
      }
      calls.push(call);

      if (String(url) === "http://bridge.test/runtimes") {
        return jsonResponse({
          runtimes: opened
            ? [
                {
                  runtimeId: "runtime-1",
                  url: "http://app.test/route-a",
                  status: "connected",
                  connectedAt: 1,
                  lastSeenAt: 2
                }
              ]
            : []
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-1/wait-for");
      return jsonResponse({
        success: true,
        condition: {
          id: "modern:route",
          status: "ready"
        },
        target: {
          id: "modern:route",
          type: "modern.route",
          status: "ready",
          updatedAt: 10,
          data: {
            pathname: "/route-a"
          }
        },
        snapshot: {
          targets: {},
          latestEventId: 0,
          capturedAt: 10
        }
      });
    },
    browserRunner: createBrowserRunner(async (args) => {
      browserCalls.push(args);
      opened = true;
      return {
        exitCode: 0,
        stdout: "opened\n",
        stderr: ""
      };
    })
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(browserCalls, [["open", "http://app.test/route-a"]]);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.slice(0, 3), [
    {
      url: "http://bridge.test/runtimes"
    },
    {
      url: "http://bridge.test/runtimes"
    },
    {
      url: "http://bridge.test/runtimes"
    }
  ]);
  assert.equal(calls[3]?.url, "http://bridge.test/runtimes/runtime-1/wait-for");
  assert.equal(calls[3]?.method, "POST");
  const waitBody = calls[3]?.body as { timeout?: unknown };
  if (typeof waitBody.timeout !== "number") {
    assert.fail("wait-for timeout should be a number.");
  }
  assert.ok(waitBody.timeout >= 1);
  assert.ok(waitBody.timeout <= 500);
  assert.deepEqual(calls[3]?.body, {
    targetId: "modern:route",
    status: "ready",
    timeout: waitBody.timeout,
    where: [
      {
        path: "pathname",
        equals: "/route-a"
      }
    ]
  });
  assert.equal(JSON.parse(output.text()).result.success, true);
});

test("opens and follows a session before wait-for when open is set", async () => {
  const browserCalls: string[][] = [];
  let opened = false;

  const output = createOutput();
  const exitCode = await runCli([
    "wait-for",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://app.test/route-a",
    "--session",
    "session-route-a",
    "modern:route",
    "ready",
    "--open",
    "--timeout",
    "500"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url, init) => {
      if (String(url) === "http://bridge.test/runtimes") {
        return jsonResponse({
          runtimes: opened
            ? [
                {
                  runtimeId: "runtime-session",
                  url: "http://app.test/route-a?openruntimeSessionId=session-route-a",
                  sessionId: "session-route-a",
                  status: "connected",
                  connectedAt: 1,
                  lastSeenAt: 2
                }
              ]
            : []
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-session/wait-for");
      assert.equal(init?.method, "POST");
      return jsonResponse({
        success: true,
        condition: {
          id: "modern:route",
          status: "ready"
        },
        snapshot: {
          targets: {},
          latestEventId: 0,
          capturedAt: 10
        }
      });
    },
    browserRunner: createBrowserRunner(async (args) => {
      browserCalls.push(args);
      opened = true;
      return {
        exitCode: 0,
        stdout: "opened\n",
        stderr: ""
      };
    })
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(browserCalls, [[
    "open",
    "http://app.test/route-a?openruntimeSessionId=session-route-a"
  ]]);
  assert.equal(JSON.parse(output.text()).runtime.runtimeId, "runtime-session");
});

test("rejects invalid payload json", async () => {
  const output = createOutput();
  const exitCode = await runCli([
    "run-action",
    "route.pick",
    "--payload",
    "{"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async () => jsonResponse({ runtimes: [] })
  });

  assert.equal(exitCode, 1);
  assert.equal(output.errorText(), "--payload must be valid JSON.\n");
});

test("recognizes a bin symlink as the cli entrypoint", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-cli-"));
  try {
    const entry = join(process.cwd(), "dist", "index.js");
    const bin = join(tempDir, "open-runtime");
    symlinkSync(entry, bin);

    assert.equal(isEntryPoint(bin, pathToFileURL(entry).href), true);
  } finally {
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});

function createOutput(): {
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
  text(): string;
  errorText(): string;
} {
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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
}

function createRecordingFetcher(fetchUrls: string[] = []): typeof fetch {
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

function createBrowserRunner(
  run: (args: string[], options?: BrowserRunOptions) => Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>
): BrowserRunner {
  return {
    run
  };
}
