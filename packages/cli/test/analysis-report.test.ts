import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "@rstest/core";

import { createCodeUsageReportHtml } from "../dist/features/analysis/report.js";
import { runCli } from "../dist/index.js";

import { createOutput } from "./helpers.js";

const report = {
  url: "http://localhost:19081/</script><script>alert(1)</script>",
  usage: {
    schemaVersion: 1,
    buildId: "build-1",
    phases: [{
      label: "first-screen",
      scriptsObserved: 2,
      unmatchedScriptUrls: [],
      chunks: [{
        chunkId: "140",
        files: ["static/js/140.js"],
        initial: true,
        totalBytes: 1000,
        usedBytes: 100,
        usedRatio: 0.1
      }],
      sources: [{
        sourcePath: "/repo/node_modules/demo/index.js",
        owner: {
          kind: "third-party",
          packageName: "demo",
          packageVersion: "1.0.0",
          packageSubpath: "index.js"
        },
        chunkIds: ["140"],
        totalBytes: 1000,
        usedBytes: 100,
        usedRatio: 0.1
      }],
      packages: [{
        kind: "third-party",
        packageName: "demo",
        packageVersion: "1.0.0",
        chunkIds: ["140"],
        sourceCount: 1,
        totalBytes: 1000,
        usedBytes: 100,
        usedRatio: 0.1
      }]
    }]
  }
};

test("creates a self-contained and safely escaped report", async () => {
  const html = await createCodeUsageReportHtml(report);

  assert.match(html, /代码使用分析/);
  assert.match(html, /data-view="application"[^>]*>业务代码/);
  assert.match(html, /view: "application"/);
  assert.match(html, /filter\(isBusinessSource\)/);
  assert.match(html, /demo/);
  assert.doesNotMatch(html, /__OPENRUNTIME_REPORT_DATA__/);
  assert.doesNotMatch(html, /<\/script><script>alert\(1\)<\/script>/);
  assert.match(html, /\\u003c\/script\\u003e/);
});

test("code-usage report generates an HTML file without requiring a page session", async () => {
  const directory = mkdtempSync(join(tmpdir(), "openruntime-analysis-report-"));
  const inputPath = join(directory, "report.json");
  const outputPath = join(directory, "visual-report.html");
  writeFileSync(inputPath, JSON.stringify(report), "utf8");
  let openCalls = 0;
  const output = createOutput();

  try {
    const exitCode = await runCli([
      "code-usage",
      "report",
      inputPath,
      "--output",
      outputPath,
      "--no-open"
    ], {
      stdout: output.stdout,
      stderr: output.stderr,
      htmlReportOpener: async () => { openCalls += 1; }
    });

    assert.equal(exitCode, 0);
    assert.equal(openCalls, 0);
    assert.equal(output.errorText(), "");
    assert.match(readFileSync(outputPath, "utf8"), /first-screen/);
    const result = JSON.parse(output.text());
    assert.equal(result.status, "ok");
    assert.equal(result.data.htmlPath, outputPath);
    assert.equal(result.data.phaseCount, 1);
    assert.equal(result.data.opened, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("code-usage report opens the generated file by default", async () => {
  const directory = mkdtempSync(join(tmpdir(), "openruntime-analysis-open-"));
  const inputPath = join(directory, "report.json");
  writeFileSync(inputPath, JSON.stringify(report), "utf8");
  const opened: string[] = [];
  const output = createOutput();

  try {
    const exitCode = await runCli(["code-usage", "report", inputPath], {
      stdout: output.stdout,
      stderr: output.stderr,
      htmlReportOpener: async (path) => { opened.push(path); }
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(opened, [join(directory, "report.html")]);
    assert.equal(JSON.parse(output.text()).data.opened, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("code-usage report rejects unrelated JSON instead of creating an empty page", async () => {
  const directory = mkdtempSync(join(tmpdir(), "openruntime-analysis-invalid-"));
  const inputPath = join(directory, "report.json");
  writeFileSync(inputPath, JSON.stringify({ ok: true }), "utf8");
  const output = createOutput();

  try {
    const exitCode = await runCli(["code-usage", "report", inputPath, "--no-open"], {
      stdout: output.stdout,
      stderr: output.stderr,
      htmlReportOpener: async () => {}
    });

    assert.equal(exitCode, 1);
    const result = JSON.parse(output.text());
    assert.equal(result.status, "error");
    assert.equal(result.error.code, "ANALYSIS_REPORT_INVALID");
    assert.match(result.message, /at least one usage phase/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("code-usage analyze accepts an explicit Chunk Map path and multiple local checkpoints", async () => {
  const directory = mkdtempSync(join(tmpdir(), "openruntime-code-usage-analyze-"));
  const assetDirectory = join(directory, "dist");
  const scriptDirectory = join(assetDirectory, "static/js");
  const chunkMapPath = join(assetDirectory, "openruntime-chunks.json");
  const firstCoveragePath = join(directory, "first.coverage.json");
  const secondCoveragePath = join(directory, "second.coverage.json");
  const reportPath = join(directory, "report.json");
  mkdirSync(scriptDirectory, { recursive: true });
  writeFileSync(join(scriptDirectory, "main.js"), "aaaa\nbbbb\n", "utf8");
  writeFileSync(join(scriptDirectory, "main.js.map"), JSON.stringify({
    version: 3,
    sources: ["../../../src/app.ts", "../../../node_modules/demo/index.js"],
    mappings: "AAAA;ACAA"
  }), "utf8");
  writeFileSync(chunkMapPath, JSON.stringify({
    schemaVersion: 2,
    generator: "@openruntime/rspack-plugin",
    buildId: "build-online-1",
    publicPath: "/",
    chunks: [{
      id: "main",
      names: ["main"],
      assets: [{
        file: "static/js/main.js",
        size: 10,
        sourceMap: "static/js/main.js.map"
      }],
      initial: true,
      entry: true,
      entrypoints: ["main"],
      groups: ["main"],
      parents: [],
      children: [],
      modules: [{
        id: "app",
        identifier: join(directory, "src/app.ts"),
        name: "./src/app.ts",
        sourcePath: join(directory, "src/app.ts"),
        moduleType: "javascript/auto",
        size: 5,
        owner: {
          kind: "application",
          packageName: "example-app",
          packageVersion: "1.0.0",
          packageSubpath: "src/app.ts"
        }
      }, {
        id: "demo",
        identifier: join(directory, "node_modules/demo/index.js"),
        name: "./node_modules/demo/index.js",
        sourcePath: join(directory, "node_modules/demo/index.js"),
        moduleType: "javascript/auto",
        size: 5,
        owner: {
          kind: "third-party",
          packageName: "demo",
          packageVersion: "1.0.0",
          packageSubpath: "index.js"
        }
      }],
      moduleSize: 10
    }],
    packages: []
  }), "utf8");
  const checkpoint = (label: string, secondLineCount: number) => ({
    schemaVersion: 1,
    label,
    scripts: [{
      scriptId: label,
      url: "https://online.example/static/js/main.js?build=1",
      functions: [{
        functionName: "",
        ranges: [
          { startOffset: 0, endOffset: 10, count: 1 },
          { startOffset: 5, endOffset: 10, count: secondLineCount }
        ]
      }]
    }]
  });
  writeFileSync(firstCoveragePath, JSON.stringify(checkpoint("first-screen", 0)), "utf8");
  writeFileSync(secondCoveragePath, JSON.stringify(checkpoint("orders", 1)), "utf8");
  const output = createOutput();

  try {
    const exitCode = await runCli([
      "code-usage",
      "analyze",
      "--chunk-map",
      chunkMapPath,
      "--coverage",
      firstCoveragePath,
      "--coverage",
      secondCoveragePath,
      "--output",
      reportPath
    ], {
      stdout: output.stdout,
      stderr: output.stderr
    });

    assert.equal(exitCode, 0);
    assert.equal(output.errorText(), "");
    const commandResult = JSON.parse(output.text());
    assert.equal(commandResult.data.phaseCount, 2);
    assert.equal(commandResult.data.chunkMap, chunkMapPath);
    const analysis = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.deepEqual(analysis.phases.map((phase: { label: string }) => phase.label), [
      "first-screen",
      "orders"
    ]);
    assert.equal(analysis.phases[0].unmatchedScriptUrls.length, 0);
    const firstDemo = analysis.phases[0].packages.find(
      (item: { packageName: string }) => item.packageName === "demo"
    );
    const secondDemo = analysis.phases[1].packages.find(
      (item: { packageName: string }) => item.packageName === "demo"
    );
    assert.equal(firstDemo.usedBytes, 0);
    assert.equal(secondDemo.usedBytes, 5);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
