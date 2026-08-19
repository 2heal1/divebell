import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import extension from "../dist/extension.js";
import {
  captureCodeUsageExperience,
  createCodeUsageReportHtml,
  openCodeUsageExperience,
  runCodeUsageReportCommand,
  startCodeUsageReportServer,
  writeCodeUsageReportHtml
} from "../dist/index.js";
import {
  createDivebellCli,
  parseCliArgs
} from "../../../cli/dist/index.js";

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

const codeFileSource = "const tag = '</script>';\nfunction idle() {}\n";
const report = {
  url: "http://localhost:19081/</script><script>alert(1)</script>",
  experience: {
    mode: "cold",
    phases: [{
      label: "first-screen",
      url: "http://localhost:19081/",
      pathname: "/",
      readyTarget: "modern:route",
      readyDurationMs: 620,
      navigation: {
        responseStartMs: 42,
        domContentLoadedMs: 360,
        loadEventMs: 430
      },
      memory: {
        atReadyBytes: 8 * 1024 * 1024,
        peakBytes: 11 * 1024 * 1024,
        peakTimeMs: 510,
        stableBytes: 6 * 1024 * 1024
      },
      memorySamples: [
        { timeMs: 0, usedBytes: 4 * 1024 * 1024 },
        { timeMs: 620, usedBytes: 8 * 1024 * 1024 }
      ],
      resources: [{
        url: "http://localhost:19081/static/js/140.js",
        initiatorType: "script",
        startTimeMs: 80,
        responseEndMs: 180,
        durationMs: 100,
        transferSize: 800
      }]
    }]
  },
  usage: {
    schemaVersion: 1,
    buildId: "build-1",
    codeFiles: [{
      file: "static/js/140.js",
      code: codeFileSource,
      totalBytes: Buffer.byteLength(codeFileSource)
    }],
    phases: [{
      label: "first-screen",
      scriptsCaptured: 2,
      scriptsObserved: 2,
      scriptsMatched: 2,
      scriptsWithoutUrl: 0,
      unmatchedScriptUrls: [],
      unmatchedScripts: [],
      chunks: [{
        chunkId: "140",
        files: ["static/js/140.js"],
        initial: true,
        entry: true,
        names: ["main"],
        entrypoints: ["main"],
        groups: ["main"],
        parents: [],
        children: [],
        splitRule: {
          kind: "cache-group",
          name: "react",
          configPath: "optimization.splitChunks.cacheGroups.react",
          inferred: false
        },
        totalBytes: 1000,
        usedBytes: 100,
        usedRatio: 0.1,
        mappedBytes: 1000,
        mappedUsedBytes: 100,
        unmappedBytes: 0,
        unmappedUsedBytes: 0
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
        fileRanges: [{
          file: "static/js/140.js",
          mappedRanges: [{ startOffset: 0, endOffset: 8 }],
          executedRanges: [{ startOffset: 0, endOffset: 4 }]
        }],
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
      }],
      codeFiles: [{
        file: "static/js/140.js",
        chunkIds: ["140"],
        totalBytes: Buffer.byteLength(codeFileSource),
        usedBytes: 24,
        usedRatio: 24 / Buffer.byteLength(codeFileSource),
        executedRanges: [{ startOffset: 0, endOffset: 24 }]
      }]
    }]
  }
};

test("injects page-experience sampling only when explicitly enabled", () => {
  assert.equal(openCodeUsageExperience(parseCliArgs([
    "open",
    "https://app.test/"
  ])), undefined);
  const enabled = openCodeUsageExperience(parseCliArgs([
    "open",
    "https://app.test/",
    "--code-usage-experience"
  ]));
  assert.equal(enabled?.scripts.length, 1);
  assert.match(enabled?.scripts[0] ?? "", /__DIVEBELL_PAGE_EXPERIENCE__/);
  assert.match(enabled?.scripts[0] ?? "", /setInterval\(readMemory, 25\)/);
});

test("captures readiness and loading memory without code coverage", async () => {
  const directory = mkdtempSync(join(tmpdir(), "divebell-page-experience-"));
  const outputPath = join(directory, "first-screen.json");
  let metricReads = 0;
  const browser = {
    coverage: {
      status: async () => ({ coverageApiVersion: 1, active: false })
    },
    eval: async () => ({
      url: "https://app.test/",
      pathname: "/",
      readyDurationMs: 640,
      navigation: {
        responseStartMs: 30,
        domContentLoadedMs: 320,
        loadEventMs: 410,
        durationMs: 410,
        transferSize: 200,
        encodedBodySize: 180,
        decodedBodySize: 420
      },
      memory: {
        atReadyBytes: 8_000_000,
        totalAtReadyBytes: 12_000_000,
        peakBytes: 9_000_000,
        peakTimeMs: 500
      },
      memorySamples: [
        { timeMs: 0, usedBytes: 4_000_000, totalBytes: 8_000_000 },
        { timeMs: 640, usedBytes: 8_000_000, totalBytes: 12_000_000 }
      ],
      resources: [{
        url: "https://app.test/main.js",
        initiatorType: "script",
        startTimeMs: 40,
        responseEndMs: 140,
        durationMs: 100,
        transferSize: 100,
        encodedBodySize: 80,
        decodedBodySize: 200
      }]
    }),
    wait: async milliseconds => {
      assert.equal(milliseconds, 250);
    },
    memory: {
      metrics: async () => {
        metricReads += 1;
        return {
          memoryApiVersion: 1,
          browserSession: "test",
          targetId: "target",
          url: "https://app.test/",
          timestamp: new Date().toISOString(),
          jsHeapUsedSize: metricReads === 1 ? 8_100_000 : 7_500_000,
          jsHeapTotalSize: 12_000_000,
          documents: 1,
          nodes: 10,
          jsEventListeners: 2
        };
      }
    }
  };

  try {
    const result = await captureCodeUsageExperience(browser, {
      outputPath,
      label: "first-screen",
      readyTarget: "sandbox preview ready",
      settleMs: 250
    });
    assert.equal(result.outputPath, outputPath);
    assert.equal(result.phase.readyDurationMs, 640);
    assert.equal(result.phase.memory.atReadyBytes, 8_000_000);
    assert.equal(result.phase.memory.peakBytes, 9_000_000);
    assert.equal(result.phase.memory.stableBytes, 7_500_000);
    assert.deepEqual(JSON.parse(readFileSync(outputPath, "utf8")), result.phase);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("creates a self-contained and safely escaped report", async () => {
  const html = await createCodeUsageReportHtml(report);

  assert.match(html, /<html lang="en">/);
  assert.match(html, />Page experience report</);
  assert.doesNotMatch(html, /data-i18n|language-toggle|detectBrowserLocale|switchLanguage|languagechange/);
  assert.doesNotMatch(html, /\p{Script=Han}/u);
  assert.match(html, /Page readiness, JavaScript heap memory, resource loading, and code usage/);
  assert.match(html, /JavaScript heap when ready/);
  assert.match(html, /Chunk loading analysis/);
  assert.match(html, /Initiator/);
  assert.match(html, /Split rule/);
  assert.match(html, /optimization\.splitChunks\.cacheGroups\.react/);
  assert.match(html, /Metric summary[\s\S]*Loading, memory, and code usage results/);
  assert.match(html, /Code usage analysis/);
  assert.match(html, /Coverage scope/);
  assert.match(html, /scripts outside this build/);
  assert.match(html, /Source-mapped size/);
  assert.match(html, /Built file size/);
  assert.doesNotMatch(html, /items\.slice\(0, 40\)/);
  assert.match(html, /aria-describedby="code-usage-help"/);
  assert.match(html, /Built-file size for chunks, source-mapped size for files and dependencies/);
  assert.match(html, /readyDurationMs/);
  assert.match(html, /data-view="application"[^>]*>Application code/);
  assert.match(html, /view: "application"/);
  assert.match(html, /filter\(isBusinessSource\)/);
  assert.match(html, /demo/);
  assert.doesNotMatch(html, /const tag/);
  assert.doesNotMatch(html, /__DIVEBELL_REPORT_DATA__/);
  assert.doesNotMatch(html, /<\/script><script>alert\(1\)<\/script>/);
  assert.match(html, /\\u003c\/script\\u003e/);
});

test("keeps page-experience panels hidden in code-only reports", async () => {
  const html = await createCodeUsageReportHtml(report.usage);

  assert.match(html, /\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
  assert.match(html, /getElementById\("experience-summary"\)\.hidden = true/);
  assert.match(html, /getElementById\("experience-loading"\)\.hidden = true/);
  assert.match(html, /if \(hasExperience\) \{\s*renderExperience\(/);
});

test("code-usage report generates an HTML file without requiring a page session", async () => {
  const directory = mkdtempSync(join(tmpdir(), "divebell-analysis-report-"));
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
      stderr: output.stderr
    });

    assert.equal(exitCode, 0);
    assert.equal(openCalls, 0);
    assert.equal(output.errorText(), "");
    const result = JSON.parse(output.text());
    assert.equal(result.status, "ok");
    assert.equal(result.data.htmlPath, outputPath);
    assert.equal(result.data.dataPath, join(directory, "visual-report-data.js"));
    assert.equal(result.data.phaseCount, 1);
    assert.equal(result.data.opened, false);
    assert.equal(result.data.codeFileCount, 1);
    assert.equal(result.data.codeViewerPageCount, 1);
    assert.equal(result.data.codeDirectory, join(directory, "visual-report-code"));
    const mainHtml = readFileSync(outputPath, "utf8");
    assert.match(mainHtml, /codeViewers/);
    assert.match(mainHtml, /visual-report-data\.js/);
    assert.match(mainHtml, /Loading report/);
    assert.doesNotMatch(mainHtml, /data-i18n|language-toggle|\p{Script=Han}/u);
    assert.doesNotMatch(mainHtml, /const tag/);
    const mainData = readFileSync(join(directory, "visual-report-data.js"), "utf8");
    assert.match(mainData, /first-screen/);
    assert.doesNotMatch(mainData, /const tag/);
    const viewerFiles = readdirSync(result.data.codeDirectory);
    assert.equal(viewerFiles.length, 2);
    const viewerHtmlFile = viewerFiles.find((file) => file.endsWith(".html"));
    const viewerDataFile = viewerFiles.find((file) => file.endsWith("-data.js"));
    assert.ok(viewerHtmlFile);
    assert.ok(viewerDataFile);
    const viewerHtml = readFileSync(join(result.data.codeDirectory, viewerHtmlFile), "utf8");
    const viewerData = readFileSync(join(result.data.codeDirectory, viewerDataFile), "utf8");
    assert.doesNotMatch(viewerHtml, /const tag/);
    assert.match(viewerHtml, /Preparing code/);
    assert.match(viewerHtml, /<html lang="en">/);
    assert.match(viewerHtml, />Navigation scope</);
    assert.doesNotMatch(viewerHtml, /data-i18n|language-toggle|detectBrowserLocale|switchLanguage|languagechange/);
    assert.doesNotMatch(viewerHtml, /\p{Script=Han}/u);
    assert.match(viewerData, /const tag/);
    assert.match(viewerData, /\\u003c\/script/);
    assert.match(viewerHtml, /Current source/);
    assert.match(viewerHtml, /All executed/);
    assert.match(viewerHtml, />Previous</);
    assert.match(viewerHtml, />Next</);
    assert.match(viewerHtml, /source-highlight-toggle/);
    assert.match(viewerHtml, /Current source executed/);
    assert.match(viewerData, /fileRanges|sourcePath/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("splits a large JavaScript file into bounded viewer pages", async () => {
  const directory = mkdtempSync(join(tmpdir(), "divebell-analysis-large-code-"));
  const inputPath = join(directory, "report.json");
  const outputPath = join(directory, "report.html");
  const largeCode = `${"x".repeat(2 * 1024 * 1024 - 1)}😀${"y".repeat(32)}`;
  const largeReport = structuredClone(report);
  largeReport.usage.codeFiles = [{
    file: "static/js/large.js",
    code: largeCode,
    totalBytes: largeCode.length
  }];
  largeReport.usage.phases[0].chunks[0].files = ["static/js/large.js"];
  largeReport.usage.phases[0].codeFiles = [{
    file: "static/js/large.js",
    chunkIds: ["140"],
    totalBytes: largeCode.length,
    usedBytes: 64,
    usedRatio: 64 / largeCode.length,
    executedRanges: [{ startOffset: 0, endOffset: 32 }, { startOffset: largeCode.length - 32, endOffset: largeCode.length }]
  }];
  writeFileSync(inputPath, JSON.stringify(largeReport), "utf8");

  try {
    const result = await writeCodeUsageReportHtml({ inputPath, outputPath });
    assert.equal(result.dataPath, join(directory, "report-data.js"));
    assert.equal(result.codeFileCount, 1);
    assert.equal(result.codeViewerPageCount, 2);
    const viewerFiles = readdirSync(result.codeDirectory).sort();
    assert.equal(viewerFiles.length, 4);
    const viewerHtmlFiles = viewerFiles.filter((file) => file.endsWith(".html"));
    const viewerDataFiles = viewerFiles.filter((file) => file.endsWith("-data.js"));
    assert.equal(viewerHtmlFiles.length, 2);
    assert.equal(viewerDataFiles.length, 2);
    assert.ok(viewerDataFiles.every((file) => statSync(join(result.codeDirectory, file)).size < 2.2 * 1024 * 1024));
    const viewerPages = viewerHtmlFiles.map((file) => readFileSync(join(result.codeDirectory, file), "utf8"));
    const viewerData = viewerDataFiles.map((file) => readFileSync(join(result.codeDirectory, file), "utf8"));
    assert.match(viewerPages[0], /nextHref/);
    assert.match(viewerPages[1], /previousHref/);
    assert.ok(viewerData.every((page) => !page.includes("�")));
    assert.match(viewerData[1], /😀/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("streams report records and code before the complete response is ready", async () => {
  const directory = mkdtempSync(join(tmpdir(), "divebell-analysis-stream-"));
  const inputPath = join(directory, "report.json");
  const streamReport = structuredClone(report);
  streamReport.usage.phases[0].sources = Array.from({ length: 24 }, (_, index) => ({
    ...report.usage.phases[0].sources[0],
    sourcePath: `/repo/src/source-${index}.js`
  }));
  streamReport.usage.codeFiles[0].code = "const value = 1;\n".repeat(4_000);
  streamReport.usage.codeFiles[0].totalBytes = Buffer.byteLength(streamReport.usage.codeFiles[0].code);
  writeFileSync(inputPath, JSON.stringify(streamReport), "utf8");
  const server = await startCodeUsageReportServer({ inputPath, port: 0 });

  try {
    const pageResponse = await fetch(server.url);
    const pageHtml = await pageResponse.text();
    assert.match(pageHtml, /const dataMode = "stream"/);
    assert.match(pageHtml, /loadReportStream/);

    const reportResponse = await fetch(new URL("/api/report", server.url));
    const reportReader = reportResponse.body.getReader();
    const firstReportChunk = new TextDecoder().decode((await reportReader.read()).value);
    assert.match(firstReportChunk, /"type":"start"/);
    assert.doesNotMatch(firstReportChunk, /"type":"done"/);
    await reportReader.cancel();

    const file = streamReport.usage.codeFiles[0].file;
    const codePageResponse = await fetch(new URL(`/code?file=${encodeURIComponent(file)}`, server.url));
    const codePageHtml = await codePageResponse.text();
    assert.match(codePageHtml, /loadCodeStream/);

    const codeResponse = await fetch(new URL(`/api/code?file=${encodeURIComponent(file)}`, server.url));
    const codeReader = codeResponse.body.getReader();
    const firstCodeChunk = new TextDecoder().decode((await codeReader.read()).value);
    const firstCodeLines = firstCodeChunk.trim().split("\n");
    assert.match(firstCodeLines[0], /"type":"start"/);
    assert.doesNotMatch(firstCodeChunk, /"type":"done"/);
    const firstCodeRecord = firstCodeLines[1]
      ?? new TextDecoder().decode((await codeReader.read()).value).trim().split("\n")[0];
    assert.match(firstCodeRecord, /"type":"code"/);
    await codeReader.cancel();
  } finally {
    await server.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("keeps reports created before code highlighting compatible", async () => {
  const directory = mkdtempSync(join(tmpdir(), "divebell-analysis-legacy-report-"));
  const inputPath = join(directory, "report.json");
  const outputPath = join(directory, "report.html");
  const legacyReport = structuredClone(report);
  delete legacyReport.usage.codeFiles;
  delete legacyReport.usage.phases[0].codeFiles;
  writeFileSync(inputPath, JSON.stringify(legacyReport), "utf8");

  try {
    const result = await writeCodeUsageReportHtml({ inputPath, outputPath });
    assert.equal(result.codeFileCount, 0);
    assert.equal(result.codeViewerPageCount, 0);
    assert.equal(result.codeDirectory, undefined);
    assert.match(readFileSync(outputPath, "utf8"), /report-data\.js/);
    assert.match(readFileSync(join(directory, "report-data.js"), "utf8"), /first-screen/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("code-usage report opens the generated file by default", async () => {
  const directory = mkdtempSync(join(tmpdir(), "divebell-analysis-open-"));
  const inputPath = join(directory, "report.json");
  writeFileSync(inputPath, JSON.stringify(report), "utf8");
  const opened = [];

  try {
    const args = parseCliArgs(["code-usage", "report", inputPath]);
    const result = await runCodeUsageReportCommand(
      args,
      async (path) => { opened.push(path); }
    );

    assert.deepEqual(opened, [join(directory, "report.html")]);
    assert.equal(result.opened, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("code-usage report rejects unrelated JSON instead of creating an empty page", async () => {
  const directory = mkdtempSync(join(tmpdir(), "divebell-analysis-invalid-"));
  const inputPath = join(directory, "report.json");
  writeFileSync(inputPath, JSON.stringify({ ok: true }), "utf8");
  const output = createOutput();

  try {
    const exitCode = await runCli(["code-usage", "report", inputPath, "--no-open"], {
      stdout: output.stdout,
      stderr: output.stderr
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
  const directory = mkdtempSync(join(tmpdir(), "divebell-code-usage-analyze-"));
  const assetDirectory = join(directory, "dist");
  const scriptDirectory = join(assetDirectory, "static/js");
  const chunkMapPath = join(assetDirectory, "divebell-chunks.json");
  const firstCoveragePath = join(directory, "first.coverage.json");
  const secondCoveragePath = join(directory, "second.coverage.json");
  const firstExperiencePath = join(directory, "first.experience.json");
  const secondExperiencePath = join(directory, "second.experience.json");
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
    generator: "@divebell/rspack-plugin",
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
  const checkpoint = (label, secondLineCount) => ({
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
  const experiencePhase = (label, pathname) => ({
    schemaVersion: 1,
    label,
    url: `https://online.example${pathname}`,
    pathname,
    readyTarget: "page ready",
    readyDurationMs: 500,
    navigation: {},
    memory: {},
    memorySamples: [],
    resources: []
  });
  writeFileSync(firstExperiencePath, JSON.stringify(experiencePhase("first-screen", "/")), "utf8");
  writeFileSync(secondExperiencePath, JSON.stringify(experiencePhase("orders", "/orders")), "utf8");
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
      "--experience",
      firstExperiencePath,
      "--experience",
      secondExperiencePath,
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
    assert.deepEqual(analysis.experience.phases.map((phase) => phase.label), [
      "first-screen",
      "orders"
    ]);
    assert.equal(analysis.experience.mode, "current");
    const usage = analysis.usage;
    assert.deepEqual(usage.phases.map((phase) => phase.label), [
      "first-screen",
      "orders"
    ]);
    assert.equal(usage.phases[0].unmatchedScriptUrls.length, 0);
    const firstDemo = usage.phases[0].packages.find(
      (item) => item.packageName === "demo"
    );
    const secondDemo = usage.phases[1].packages.find(
      (item) => item.packageName === "demo"
    );
    assert.equal(firstDemo.usedBytes, 0);
    assert.equal(secondDemo.usedBytes, 5);
    const firstDemoSource = usage.phases[0].sources.find(
      (item) => item.owner.packageName === "demo"
    );
    const secondDemoSource = usage.phases[1].sources.find(
      (item) => item.owner.packageName === "demo"
    );
    assert.deepEqual(firstDemoSource.fileRanges, [{
      file: "static/js/main.js",
      mappedRanges: [{ startOffset: 5, endOffset: 10 }],
      executedRanges: []
    }]);
    assert.deepEqual(secondDemoSource.fileRanges, [{
      file: "static/js/main.js",
      mappedRanges: [{ startOffset: 5, endOffset: 10 }],
      executedRanges: [{ startOffset: 5, endOffset: 10 }]
    }]);
    assert.deepEqual(usage.codeFiles, [{
      file: "static/js/main.js",
      code: "aaaa\nbbbb\n",
      totalBytes: 10
    }]);
    assert.deepEqual(usage.phases[0].codeFiles[0].executedRanges, [
      { startOffset: 0, endOffset: 5 }
    ]);
    assert.deepEqual(usage.phases[1].codeFiles[0].executedRanges, [
      { startOffset: 0, endOffset: 10 }
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("code-usage analyze reads a Chunk Map, JavaScript, and source maps over HTTP", async () => {
  const directory = mkdtempSync(join(tmpdir(), "divebell-code-usage-http-"));
  const coveragePath = join(directory, "coverage.json");
  const reportPath = join(directory, "report.json");
  const chunkMap = {
    schemaVersion: 2,
    generator: "@divebell/rspack-plugin",
    buildId: "build-http-1",
    publicPath: "/quickstart/",
    chunks: [{
      id: "main",
      names: ["main"],
      assets: [{
        file: "static/js/main.js",
        size: 5,
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
          packageName: "quickstart",
          packageVersion: "1.0.0",
          packageSubpath: "src/app.ts"
        }
      }],
      moduleSize: 5
    }],
    packages: []
  };
  const fixtures = new Map([
    ["/quickstart/divebell-chunks.json", JSON.stringify(chunkMap)],
    ["/quickstart/static/js/main.js", "aaaa"],
    ["/quickstart/static/js/main.js.map", JSON.stringify({
      version: 3,
      sources: ["../../../src/app.ts"],
      mappings: "AAAA"
    })]
  ]);
  const server = createServer((request, response) => {
    const body = fixtures.get(request.url ?? "");
    if (body === undefined) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" }).end(body);
  });
  await new Promise((resolveReady) => server.listen(0, "127.0.0.1", resolveReady));
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const baseUrl = `http://127.0.0.1:${address.port}/quickstart/`;
  writeFileSync(coveragePath, JSON.stringify({
    schemaVersion: 1,
    label: "first-screen",
    scripts: [{
      scriptId: "1",
      url: `${baseUrl}static/js/main.js`,
      functions: [{
        functionName: "",
        ranges: [{ startOffset: 0, endOffset: 4, count: 1 }]
      }]
    }]
  }), "utf8");
  const output = createOutput();

  try {
    const exitCode = await runCli([
      "code-usage",
      "analyze",
      "--chunk-map",
      `${baseUrl}divebell-chunks.json`,
      "--coverage",
      coveragePath,
      "--output",
      reportPath
    ], {
      stdout: output.stdout,
      stderr: output.stderr
    });

    assert.equal(exitCode, 0, output.errorText());
    const result = JSON.parse(output.text());
    assert.equal(result.status, "ok");
    assert.equal(result.data.chunkMap, `${baseUrl}divebell-chunks.json`);
    assert.equal(result.data.assets, baseUrl);
    const saved = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(saved.phases[0].sources[0].owner.packageName, "quickstart");
  } finally {
    await new Promise((resolveClosed) => server.close(resolveClosed));
    rmSync(directory, { recursive: true, force: true });
  }
});
