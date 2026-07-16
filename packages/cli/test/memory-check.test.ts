import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "@rstest/core";

import { runCli } from "../dist/index.js";
import { createBrowserRunner, createOutput } from "./helpers.js";

test("memory check runs a readable scenario and owns the full browser workflow", async () => {
  const directory = mkdtempSync(join(tmpdir(), "openruntime-memory-check-"));
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
  const calls: string[][] = [];
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
