import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import extension from "../dist/extension.js";
import { createDivebellCli } from "../../cli/dist/index.js";

const cli = createDivebellCli({ extensions: [extension] });
const runCli = cli.run;

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

function createBrowserRunner(run) {
  return { run };
}

test("memory check runs a readable scenario and owns the full browser workflow", async () => {
  const directory = mkdtempSync(join(tmpdir(), "divebell-memory-check-"));
  const scenarioPath = join(directory, "scenario.mjs");
  const artifactDirectory = join(directory, "artifacts");
  writeFileSync(scenarioPath, `
    export default {
      async setup({ page }) {
        await page.waitEval("true");
      },
      async run({ page }) {
        await page.eval("true");
      }
    };
  `, "utf8");
  const output = createOutput();
  const calls = [];
  let metricIndex = 0;
  const metrics = [
    { jsHeapUsedSize: 1_000_000, jsHeapTotalSize: 2_000_000, documents: 1, nodes: 10, jsEventListeners: 3 },
    { jsHeapUsedSize: 1_020_000, jsHeapTotalSize: 2_000_000, documents: 1, nodes: 10, jsEventListeners: 3 },
    { jsHeapUsedSize: 1_030_000, jsHeapTotalSize: 2_000_000, documents: 1, nodes: 10, jsEventListeners: 3 },
    { jsHeapUsedSize: 1_040_000, jsHeapTotalSize: 2_000_000, documents: 1, nodes: 10, jsEventListeners: 3 }
  ];

  try {
    const exitCode = await runCli([
      "memory",
      "check",
      "--url",
      "https://example.test/",
      "--scenario",
      scenarioPath,
      "--artifact-dir",
      artifactDirectory,
      "--warmup",
      "1",
      "--iterations",
      "2"
    ], {
      stdout: output.stdout,
      stderr: output.stderr,
      browserRunner: createBrowserRunner(async (args) => {
        calls.push(args);
        if (args[0] === "eval") return { exitCode: 0, stdout: "true\n", stderr: "" };
        if (args[0] === "memory" && args[1] === "metrics") {
          const value = metrics[metricIndex++];
          return { exitCode: 0, stdout: `${JSON.stringify(value)}\n`, stderr: "" };
        }
        if (args[0] === "memory" && args[1] === "sampling" && args[2] === "stop") {
          return {
            exitCode: 0,
            stdout: `${JSON.stringify({ topFunctions: [{ functionName: "allocate", selfSize: 1024 }] })}\n`,
            stderr: ""
          };
        }
        return { exitCode: 0, stdout: "{}\n", stderr: "" };
      })
    });

    assert.equal(exitCode, 0);
    assert.equal(output.errorText(), "");
    const commandResult = JSON.parse(output.text());
    assert.equal(commandResult.data.verdict, "no-clear-growth");
    assert.equal(commandResult.data.topFunctions[0].functionName, "allocate");
    const report = JSON.parse(readFileSync(join(artifactDirectory, "report.json"), "utf8"));
    assert.equal(report.baseline.jsHeapUsedSize, 1_000_000);
    assert.equal(report.final.jsHeapUsedSize, 1_040_000);
    assert.deepEqual(calls[0], ["open", "https://example.test/"]);
    assert.deepEqual(calls.at(-1), ["close"]);
    assert.equal(calls.filter((args) => args[0] === "memory" && args[1] === "metrics").length, 4);
    assert.equal(calls.filter((args) => args[0] === "eval" && args[1] === "true").length, 3);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("forwards supported memory commands as JSON requests", async () => {
  const commands = [
    ["memory", "metrics"],
    ["memory", "status"],
    ["memory", "sampling", "start"],
    ["memory", "sampling", "stop"],
    ["memory", "snapshot"],
    ["memory", "collect-garbage"],
    ["memory", "cancel"]
  ];
  const calls = [];
  for (const argv of commands) {
    const output = createOutput();
    const exitCode = await runCli(argv, {
      stdout: output.stdout,
      stderr: output.stderr,
      browserRunner: createBrowserRunner(async (args) => {
        calls.push(args);
        return { exitCode: 0, stdout: JSON.stringify({ command: args.slice(0, -1) }), stderr: "" };
      })
    });
    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(output.text()).data, { command: argv });
  }
  assert.deepEqual(calls, commands.flatMap((argv) => argv[1] === "metrics"
    ? [["memory", "collect-garbage", "--json"], ["memory", "metrics", "--json"]]
    : [[...argv, "--json"]]));
});

test("throws browser command failures into the shared error formatter", async () => {
  const output = createOutput();
  const exitCode = await runCli(["memory", "status"], {
    stdout: output.stdout,
    stderr: output.stderr,
    browserRunner: createBrowserRunner(async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "memory unavailable"
    }))
  });

  assert.equal(exitCode, 1);
  const result = JSON.parse(output.text());
  assert.equal(result.status, "error");
  assert.equal(result.error.code, "MEMORY_BROWSER_COMMAND_FAILED");
  assert.equal(result.message, "memory unavailable");
});

test("allows memory metrics without garbage collection", async () => {
  const calls = [];
  const output = createOutput();
  assert.equal(await runCli(["memory", "metrics", "--no-gc"], {
    stdout: output.stdout,
    stderr: output.stderr,
    browserRunner: createBrowserRunner(async (args) => {
      calls.push(args);
      return { exitCode: 0, stdout: "{}", stderr: "" };
    })
  }), 0);
  assert.deepEqual(calls, [["memory", "metrics", "--json"]]);
});

test("forwards memory capture paths and limits", async () => {
  const calls = [];
  const commands = [
    {
      cli: ["memory", "sampling", "start", "--sampling-interval", "1024"],
      browser: ["memory", "sampling", "start", "--sampling-interval", "1024", "--json"]
    },
    {
      cli: ["memory", "sampling", "stop", "/tmp/result.heapprofile", "--top", "10", "--max-size", "4096"],
      browser: ["memory", "sampling", "stop", "/tmp/result.heapprofile", "--top", "10", "--max-size", "4096", "--json"]
    },
    {
      cli: ["memory", "snapshot", "/tmp/result.heapsnapshot", "--no-gc", "--timeout", "5000", "--max-size", "8192"],
      browser: ["memory", "snapshot", "/tmp/result.heapsnapshot", "--no-gc", "--timeout", "5000", "--max-size", "8192", "--json"]
    }
  ];
  for (const item of commands) {
    const output = createOutput();
    assert.equal(await runCli(item.cli, {
      stdout: output.stdout,
      stderr: output.stderr,
      browserRunner: createBrowserRunner(async (args) => {
        calls.push(args);
        return { exitCode: 0, stdout: "{}", stderr: "" };
      })
    }), 0);
  }
  assert.deepEqual(calls, commands.map((item) => item.browser));
});
