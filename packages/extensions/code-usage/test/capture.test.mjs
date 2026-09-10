import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { captureCodeUsage, runCodeUsageCommand } from "../dist/index.js";
import extension from "../dist/extension.js";
import { createDivebellCli, parseCliArgs } from "../../../cli/dist/index.js";
import { createOperationLogKey } from "../../../cli/dist/utils/operation-log.js";

async function fixture(options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "code-usage-capture-test-"));
  const chunkMap = join(directory, "map.json");
  await writeFile(chunkMap, JSON.stringify({ buildId: "build", chunks: [{ id: "app", assets: [{ file: "app.js" }] }] }));
  const outputPath = join(directory, "capture.json");
  let active = options.active ?? true;
  let debuggerEnabled = options.debuggerEnabled ?? true;
  let evalCount = 0;
  let checkpointCount = 0;
  let switched = false;
  const calls = [];
  const script = { scriptId: "42", url: "https://cdn.test/app.js", functions: [{ functionName: "", ranges: [{ startOffset: 0, endOffset: 22, count: 1 }] }] };
  const original = { schemaVersion: 1, captureId: "capture", checkpoint: 1, targetId: "target", url: "about:blank", label: "first-screen", scripts: [script, { scriptId: "9", url: "https://other.test/analytics.js", functions: [] }] };
  const session = () => ({ sessionId: "renderer", targetId: "target", tabId: "t1", documentGeneration: 3, enabled: debuggerEnabled });
  const checkpoint = async (kind, { path, label }) => {
    calls.push(kind);
    if (kind === "stop") active = false;
    await writeFile(path, JSON.stringify({ ...original, label }));
    checkpointCount += 1;
    if (options.checkpointResponseFails) throw new Error("checkpoint response lost");
    return { ...original, label, path };
  };
  const browser = {
    coverage: {
      status: async () => ({ active, captureId: "capture", targetId: options.captureTarget ?? "target", checkpointCount }),
      take: (args) => checkpoint("take", args),
      stop: (args) => checkpoint("stop", args)
    },
    tabs: { list: async () => [{ active: true, tabId: switched ? "t2" : "t1", targetId: switched ? "other-target" : "target", url: "https://app.test/material" }] },
    eval: async () => { if (options.switchesDuringEval) switched = true; return { url: "https://app.test/material", timeOrigin: ++evalCount > 1 && options.navigates ? 2000 : 1000 }; },
    debug: {
      status: async () => ({ connectionGeneration: 7, sessions: [session()] }),
      enable: async ({ tab }) => { assert.equal(tab, "t1"); debuggerEnabled = true; calls.push("enable"); return { enabled: true, connectionGeneration: 7, sessions: [{ tabId: "t1", sessionId: "renderer", debuggerId: "debugger" }] }; },
      disable: async ({ tab }) => { assert.equal(tab, "t1"); debuggerEnabled = false; calls.push("disable"); },
      source: async (scriptId, { tab }) => {
        calls.push(`source:${scriptId}`);
        assert.equal(tab, "t1");
        if (options.sourceFails) throw new Error("source unavailable");
        if (options.concurrentCheckpoint) checkpointCount += 1;
        return {
          script: { ...script, sessionId: "renderer", documentGeneration: 3, connectionGeneration: 7, ...options.sourceIdentity },
          scriptSource: "wrapper:console.log(1);"
        };
      }
    }
  };
  return { directory, browser, calls, original, captureOptions: { chunkMap, outputPath, label: "first-screen" }, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test("capture freezes coverage and adds only matched runtime source with document evidence", async () => {
  const f = await fixture();
  try {
    const result = await captureCodeUsage(f.browser, f.captureOptions);
    const saved = JSON.parse(await readFile(result.outputPath, "utf8"));
    assert.deepEqual(saved.scripts[0].functions, f.original.scripts[0].functions);
    assert.equal(saved.scripts[0].runtimeSource, "wrapper:console.log(1);");
    assert.equal(saved.scripts[1].runtimeSource, undefined);
    assert.equal(saved.url, "about:blank", "retain the raw capture-start URL");
    assert.equal(saved.captureEvidence.url, "https://app.test/material");
    assert.equal(saved.captureEvidence.captureStartedUrl, "about:blank");
    assert.equal(saved.captureEvidence.documentGeneration, 3);
    assert.equal(result.runtimeSourceCount, 1);
    assert.equal(result.stopped, false);
    assert.deepEqual(f.calls, ["take", "enable", "source:42"]);
    assert.equal((await readdir(f.directory)).some((name) => name.startsWith(".code-usage-capture-")), false);
  } finally { await f.cleanup(); }
});

test("capture --stop ends coverage and restores a debugger enabled by this command", async () => {
  const f = await fixture({ debuggerEnabled: false });
  try {
    const result = await captureCodeUsage(f.browser, { ...f.captureOptions, stop: true });
    assert.equal(result.stopped, true);
    assert.deepEqual(f.calls, ["stop", "enable", "source:42", "disable"]);
  } finally { await f.cleanup(); }
});

for (const [name, options, pattern] of [
  ["source URL mismatch", { sourceIdentity: { url: "https://cdn.test/other.js" } }, /Runtime source identity changed/],
  ["source document mismatch", { sourceIdentity: { documentGeneration: 4 } }, /Runtime source identity changed/],
  ["source lookup failure", { sourceFails: true }, /source unavailable/],
  ["checkpoint response lost after saving", { checkpointResponseFails: true }, /checkpoint response lost/],
  ["concurrent coverage checkpoint", { concurrentCheckpoint: true }, /Coverage capture changed/],
  ["same-URL navigation", { navigates: true }, /navigated or changed/]
]) {
  test(`capture rejects ${name}, retains raw evidence, and does not replace an existing output`, async () => {
    const f = await fixture(options);
    try {
      await writeFile(f.captureOptions.outputPath, "previous verified checkpoint");
      await assert.rejects(captureCodeUsage(f.browser, f.captureOptions), (error) => pattern.test(error.message) && /Raw coverage was retained/.test(error.message));
      assert.equal(await readFile(f.captureOptions.outputPath, "utf8"), "previous verified checkpoint");
      const retained = (await readdir(f.directory)).find((name) => name.startsWith(".code-usage-capture-"));
      assert.ok(retained);
      assert.deepEqual(JSON.parse(await readFile(join(f.directory, retained, "raw.coverage.json"), "utf8")), f.original);
    } finally { await f.cleanup(); }
  });
}

test("capture requires active coverage on the current target before taking any checkpoint", async () => {
  for (const options of [{ active: false }, { captureTarget: "other-target" }, { switchesDuringEval: true }]) {
    const f = await fixture(options);
    try {
      await assert.rejects(captureCodeUsage(f.browser, f.captureOptions), /Start coverage|not the target|target changed/);
      assert.deepEqual(f.calls, []);
    } finally { await f.cleanup(); }
  }
});

test("capture command validates options and dispatches a successful checkpoint", async () => {
  const f = await fixture();
  const args = ["code-usage", "capture", "--chunk-map", f.captureOptions.chunkMap, "--output", f.captureOptions.outputPath, "--label", "first-screen"];
  const run = (argv, page = { url: "https://app.test/material" }) => runCodeUsageCommand({
    args: parseCliArgs(argv), page, divebell: { browser: f.browser }, withLoading: async (task) => await task()
  });
  try {
    for (const argv of [[...args, "--label", "duplicate"], ["code-usage", "capture", "unexpected"], [...args, "--stop", "maybe"]]) {
      await assert.rejects(run(argv), (error) => /CODE_USAGE_CAPTURE_(OPTION|USAGE)_INVALID/.test(error.code));
    }
    await assert.rejects(run(args, null), (error) => error.code === "CODE_USAGE_CAPTURE_PAGE_REQUIRED");
    const result = await run(args);
    assert.equal(result.runtimeSourceCount, 1);
  } finally { await f.cleanup(); }
});

test("real CLI help discovers capture in root and Code Usage help", async () => {
  const cli = createDivebellCli({ extensions: [extension] });
  for (const args of [["--help"], ["code-usage", "--help"], ["code-usage", "capture", "--help"]]) {
    let output = "";
    let errors = "";
    const exitCode = await cli.run(args, { stdout: { write: (value) => { output += value; } }, stderr: { write: (value) => { errors += value; } } });
    assert.equal(exitCode, 0, errors);
    assert.match(output, args.length === 1 ? /divebell code-usage -/ : /code-usage capture/);
    if (args.length > 1) assert.match(output, /--chunk-map/);
  }
});

test("real CLI capture accepts restored browser context and reaches the active-coverage guard", async () => {
  const f = await fixture();
  const key = createOperationLogKey(process.cwd());
  await writeFile(join(f.directory, `${key}.json`), JSON.stringify({
    schemaVersion: 1, command: "open", key, cwd: process.cwd(),
    url: "https://app.test/material", normalizedUrl: "https://app.test/material",
    bridgeUrl: "http://bridge.test", bridgePort: null, sessionId: "restored-session",
    openedAt: 1, exitCode: 0, activeExtensions: [],
    browserUi: false, browserReuseInitialBlankPage: false,
    browserRestoreDisabled: false, browserDefaultProfileDisabled: false,
    browserRestoreOptions: { "profile": ["current-profile"] }
  }));
  const cli = createDivebellCli({ extensions: [extension] });
  let stdout = "";
  let stderr = "";
  const calls = [];
  try {
    const exitCode = await cli.run(["code-usage", "capture", "--chunk-map", f.captureOptions.chunkMap,
      "--output", f.captureOptions.outputPath, "--label", "first-screen"], {
      operationLogDirectory: f.directory,
      stdout: { write: (value) => { stdout += value; } },
      stderr: { write: (value) => { stderr += value; } },
      browserRunner: { run: async (args) => {
        calls.push(args);
        return { exitCode: 0, stdout: JSON.stringify({ active: false }), stderr: "" };
      } }
    });
    assert.equal(exitCode, 1, stderr);
    const result = JSON.parse(stdout);
    assert.equal(result.error.code, "CODE_USAGE_CAPTURE_FAILED");
    assert.match(result.message, /Start coverage/);
    assert.deepEqual(calls, [["coverage", "status", "--json"]]);
  } finally { await f.cleanup(); }
});
