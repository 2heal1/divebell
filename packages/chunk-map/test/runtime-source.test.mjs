import assert from "node:assert/strict";
import { Session } from "node:inspector";
import test from "node:test";
import { runInThisContext } from "node:vm";
import { analyzeDivebellCodeUsage } from "../dist/index.js";

function analyze(code, scripts) {
  return analyzeDivebellCodeUsage({
    chunkMap: {
      schemaVersion: 3, generator: "test", buildId: "runtime-identity", publicPath: "/",
      chunks: [{
        id: "runtime", names: [], initial: true, entry: false, entrypoints: [], groups: [],
        parents: [], children: [], modules: [], moduleSize: Buffer.byteLength(code),
        assets: [{ file: "runtime.js", size: Buffer.byteLength(code), sourceMap: "runtime.js.map" }],
        splitRule: { kind: "unknown", name: "Unknown", configPath: null, inferred: true }
      }],
      packages: []
    },
    checkpoints: [{ schemaVersion: 1, label: "ready", scripts }],
    assets: [{
      file: "runtime.js", code, sourceMapPath: "/repo/dist/runtime.js.map",
      sourceMap: { version: 3, sources: ["../src/runtime.js"], mappings: code.split("\n").map(() => "AAAA").join(";") }
    }]
  }).phases[0];
}

function script(source, ranges, scriptId = "1") {
  return {
    scriptId, url: "https://app.test/runtime.js", runtimeSource: source,
    functions: [{ functionName: "", ranges }]
  };
}

function range(startOffset, endOffset, count = 1) { return { startOffset, endOffset, count }; }

test("exact runtime source proves identity and keeps asset coordinates", () => {
  const code = "abcdefghij";
  const phase = analyze(code, [script(code, [range(0, 10), range(4, 8, 0)])]);
  assert.equal(phase.chunks[0].usedBytes, 6);
  assert.equal(phase.codeFiles[0].contentIdentity.status, "exact");
  assert.equal(phase.codeFiles[0].contentIdentity.runtimeOffset, 0);
  assert.deepEqual(phase.contentIdentity, { exact: 1, embedded: 0, unverified: 0, mismatch: 0, verified: true });
});

test("resolves nested zero-count runtime ranges before translating and clipping a wrapped asset", () => {
  const code = "abcdefghij";
  const runtime = `PRE${code}POST`;
  const phase = analyze(code, [script(runtime, [
    range(0, runtime.length), range(2, 12, 0), range(5, 8), range(6, 7, 0)
  ])]);
  assert.equal(phase.codeFiles[0].contentIdentity.status, "embedded");
  assert.equal(phase.codeFiles[0].contentIdentity.runtimeOffset, 3);
  assert.deepEqual(phase.codeFiles[0].executedRanges, [
    { startOffset: 2, endOffset: 3 }, { startOffset: 4, endOffset: 5 }, { startOffset: 9, endOffset: 10 }
  ]);
  assert.equal(phase.chunks[0].usedBytes, 3);
  assert.equal(phase.sources[0].usedBytes, 3);
  assert.equal(phase.contentIdentity.verified, true);
});

test("uses UTF-16 offsets for non-ASCII wrappers and UTF-8 byte totals for asset usage", () => {
  const code = "甲😀乙abc";
  const prefix = "/*🧪中文*/";
  const runtime = prefix + code + "/*后缀*/";
  const phase = analyze(code, [script(runtime, [
    range(0, runtime.length), range(prefix.length + 1, prefix.length + 3, 0)
  ])]);
  const file = phase.codeFiles[0];
  assert.equal(file.contentIdentity.runtimeOffset, prefix.length);
  assert.notEqual(prefix.length, Buffer.byteLength(prefix));
  assert.equal(file.contentIdentity.assetLength, code.length);
  assert.equal(file.contentIdentity.runtimeLength, runtime.length);
  assert.equal(file.totalBytes, Buffer.byteLength(code));
  assert.equal(file.usedBytes, Buffer.byteLength(code) - Buffer.byteLength("😀"));
});

test("clipping must not collapse distinct enclosing ranges before the zero-count override is resolved", () => {
  const code = "abcdefghij";
  const runtime = `PRE${code}POST`;
  const phase = analyze(code, [script(runtime, [
    range(0, runtime.length), range(2, 14, 0), range(5, 6)
  ])]);
  // Both enclosing ranges would become [0, 10] if clipped prematurely,
  // erasing which zero-count range is the narrower controlling scope.
  assert.equal(phase.chunks[0].usedBytes, 1);
  assert.deepEqual(phase.codeFiles[0].executedRanges, [{ startOffset: 2, endOffset: 3 }]);
});

test("wrapper-only execution is not attributed to the embedded asset", () => {
  const code = "abcdefghij";
  const phase = analyze(code, [script(`before${code}after`, [range(0, 6), range(16, 21)])]);
  assert.equal(phase.chunks[0].usedBytes, 0);
  assert.deepEqual(phase.codeFiles[0].executedRanges, []);
});

test("missing or ambiguous asset text excludes a URL match and explains the identity failure", () => {
  for (const [runtimeSource, reason] of [
    ["ABCDEF", "runtime-source-mismatch"],
    ["prefixabcdefabcdefsuffix", "runtime-source-ambiguous"],
    ["prefixaaaaasuffix", "runtime-source-ambiguous"]
  ]) {
    const code = runtimeSource.includes("aaaaa") ? "aaa" : "abcdef";
    const phase = analyze(code, [script(runtimeSource, [range(0, runtimeSource.length)])]);
    assert.equal(phase.scriptsMatched, 0);
    assert.deepEqual(phase.chunks, []);
    assert.deepEqual(phase.codeFiles, []);
    assert.equal(phase.unmatchedScripts[0].reason, reason);
    assert.equal(phase.unmatchedScripts[0].contentIdentity.status, "mismatch");
    assert.equal(phase.contentIdentity.mismatch, 1);
    assert.equal(phase.contentIdentity.verified, false);
  }
});

test("legacy coverage without runtime source remains usable but explicitly unverified", () => {
  const legacy = script(undefined, [range(0, 4)]);
  delete legacy.runtimeSource;
  const phase = analyze("abcdef", [legacy]);
  assert.equal(phase.chunks[0].usedBytes, 4);
  assert.equal(phase.codeFiles[0].contentIdentity.status, "unverified");
  assert.equal(phase.codeFiles[0].contentIdentity.runtimeOffset, undefined);
  assert.equal(phase.contentIdentity.unverified, 1);
  assert.equal(phase.contentIdentity.verified, false);
});

test("normalizes every runtime instance before union and retains each identity", () => {
  const code = "abcdefghij";
  const phase = analyze(code, [
    script(`PRE${code}`, [range(3, 5)], "one"),
    script(`LONGPREFIX${code}`, [range(18, 20)], "two")
  ]);
  assert.equal(phase.scriptsMatched, 2);
  assert.equal(phase.chunks[0].totalBytes, 10);
  assert.equal(phase.chunks[0].usedBytes, 4);
  assert.deepEqual(phase.codeFiles[0].executedRanges, [
    { startOffset: 0, endOffset: 2 }, { startOffset: 8, endOffset: 10 }
  ]);
  assert.equal(phase.codeFiles[0].contentIdentity.status, "embedded");
  assert.equal(phase.codeFiles[0].contentIdentity.runtimeOffset, undefined);
  assert.deepEqual(phase.codeFiles[0].contentIdentity.instances.map((item) => [item.scriptId, item.runtimeOffset]), [
    ["one", 3], ["two", 10]
  ]);
});

test("a rejected stale instance cannot contribute usage even beside a verified same-URL instance", () => {
  const code = "abcdefghij";
  const phase = analyze(code, [
    script(code, [range(0, 2)], "correct"),
    script("ABCDEFGHIJ", [range(0, 10)], "stale")
  ]);
  assert.equal(phase.scriptsMatched, 1);
  assert.equal(phase.chunks[0].usedBytes, 2);
  assert.equal(phase.chunks[0].totalBytes, 10);
  assert.deepEqual(phase.contentIdentity, { exact: 1, embedded: 0, unverified: 0, mismatch: 1, verified: false });
  assert.equal(phase.unmatchedScripts[0].scriptId, "stale");
  assert.deepEqual(phase.codeFiles[0].contentIdentity.instances.map((instance) => instance.scriptId), ["correct"]);
});

test("mixed legacy and verified instances cannot be summarized as fully verified", () => {
  const code = "abcdefghij";
  const legacy = script(undefined, [range(8, 10)], "legacy");
  delete legacy.runtimeSource;
  const phase = analyze(code, [script(code, [range(0, 2)], "correct"), legacy]);
  assert.equal(phase.chunks[0].usedBytes, 4);
  assert.equal(phase.codeFiles[0].contentIdentity.status, "unverified");
  assert.deepEqual(phase.contentIdentity, { exact: 1, embedded: 0, unverified: 1, mismatch: 0, verified: false });
});

test("real V8 precise coverage gives equal asset usage with and without a Unicode wrapper", async () => {
  const code = '(()=>{const unused=()=>"未执行😀";const live=()=>"已执行";return live();})();';
  const prefix = '(function(){/*框架包装🧪*/';
  const wrapped = prefix + code + "\n})();";
  const session = new Session();
  session.connect();
  const post = (method, params = {}) => new Promise((resolve, reject) => {
    session.post(method, params, (error, result) => error ? reject(error) : resolve(result));
  });
  try {
    await post("Debugger.enable");
    await post("Profiler.enable");
    await post("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
    runInThisContext(code, { filename: "https://fixture.test/direct.js" });
    runInThisContext(wrapped, { filename: "https://fixture.test/wrapped.js" });
    const { result } = await post("Profiler.takePreciseCoverage");
    const phases = [];
    for (const filename of ["direct", "wrapped"]) {
      const captured = result.find((item) => item.url === `https://fixture.test/${filename}.js`);
      assert.ok(captured);
      assert.ok(captured.functions.some((fn) => fn.ranges.some((item) => item.count === 0)));
      const { scriptSource } = await post("Debugger.getScriptSource", { scriptId: captured.scriptId });
      phases.push(analyze(code, [{ ...captured, url: "https://app.test/runtime.js", runtimeSource: scriptSource }]));
    }
    assert.equal(phases[0].codeFiles[0].contentIdentity.status, "exact");
    assert.equal(phases[1].codeFiles[0].contentIdentity.status, "embedded");
    assert.equal(phases[1].codeFiles[0].contentIdentity.runtimeOffset, prefix.length);
    assert.deepEqual(phases[1].codeFiles[0].executedRanges, phases[0].codeFiles[0].executedRanges);
    assert.equal(phases[1].chunks[0].usedBytes, phases[0].chunks[0].usedBytes);
    assert.ok(phases[0].chunks[0].usedBytes < Buffer.byteLength(code));
  } finally {
    await post("Profiler.stopPreciseCoverage");
    session.disconnect();
  }
});
