import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDivebellCodeUsage } from "../dist/index.js";

const MiB = 1024 * 1024;

function analyzeChunks(specs) {
  return analyzeDivebellCodeUsage({
    chunkMap: {
      schemaVersion: 3,
      generator: "test",
      buildId: "opportunity-ranking",
      publicPath: "/",
      chunks: specs.map(({ id, totalBytes }) => ({
        id,
        names: [],
        assets: [{ file: `${id}.js`, size: totalBytes, sourceMap: `${id}.js.map` }],
        initial: true,
        entry: false,
        entrypoints: [],
        groups: [],
        parents: [],
        children: [],
        splitRule: { kind: "unknown", name: "Unknown", configPath: null, inferred: true },
        modules: [],
        moduleSize: totalBytes
      })),
      packages: []
    },
    checkpoints: [{
      schemaVersion: 1,
      label: "first-screen",
      scripts: specs.map(({ id, totalBytes, usedBytes }) => ({
        scriptId: id,
        url: `https://app.test/${id}.js`,
        functions: [{ functionName: "", ranges: [
          { startOffset: 0, endOffset: totalBytes, count: 1 },
          { startOffset: usedBytes, endOffset: totalBytes, count: 0 }
        ] }]
      }))
    }],
    assets: specs.map(({ id, totalBytes, mapped = true }) => ({
      file: `${id}.js`,
      code: "a".repeat(totalBytes),
      sourceMapPath: `/repo/dist/${id}.js.map`,
      sourceMap: {
        version: 3,
        sources: mapped ? [`../node_modules/shared/${id}.js`] : [],
        mappings: mapped ? "AAAA" : ""
      }
    }))
  }).phases[0];
}

test("keeps high-use chunks with more unexecuted bytes ahead of smaller low-use chunks", () => {
  const phase = analyzeChunks([
    { id: "large-80-percent-used", totalBytes: 10 * MiB, usedBytes: 8 * MiB },
    { id: "small-10-percent-used", totalBytes: MiB, usedBytes: Math.floor(MiB / 10) }
  ]);
  const chunks = phase.opportunities.filter((item) => item.kind === "large-low-use-chunk");

  assert.deepEqual(chunks.map((item) => item.id), [
    "chunk:large-80-percent-used",
    "chunk:small-10-percent-used"
  ]);
  assert.equal(chunks[0].usedRatio, 0.8);
  assert.equal(chunks[0].potentialSavingsBytes, 2 * MiB);
  assert.equal(chunks[0].coverageFloorBytes, 8 * MiB);
  assert.equal(chunks[0].score, chunks[0].potentialSavingsBytes);
  // Legacy estimate-named fields are aliases of observations, not rewritten sizes.
  assert.equal(phase.chunks.find((item) => item.chunkId === "large-80-percent-used").totalBytes, 10 * MiB);
  assert.equal(phase.chunks.find((item) => item.chunkId === "large-80-percent-used").usedBytes, 8 * MiB);
});

test("retains high-use source and package attribution without adding it to exclusive chunk savings", () => {
  const phase = analyzeChunks([
    { id: "first", totalBytes: 5 * MiB, usedBytes: 4 * MiB },
    { id: "second", totalBytes: 5 * MiB, usedBytes: 4 * MiB }
  ]);
  const exclusive = phase.opportunities.filter((item) => item.savingsAccounting === "exclusive-chunk");
  const attribution = phase.opportunities.filter((item) => item.savingsAccounting === "overlapping-attribution");
  const sources = attribution.filter((item) => item.kind === "large-low-use-source");
  const packages = attribution.filter((item) => item.kind === "large-low-use-package");

  assert.equal(exclusive.length, 2);
  assert.equal(sources.length, 2);
  assert.equal(packages.length, 1);
  assert.equal(exclusive.reduce((sum, item) => sum + item.potentialSavingsBytes, 0), 2 * MiB);
  assert.equal(packages[0].potentialSavingsBytes, 2 * MiB);
  assert.deepEqual(packages[0].chunkIds, ["first", "second"]);
  for (const item of attribution) {
    assert.equal(item.usedRatio, 0.8);
    assert.match(item.evidence.join("\n"), /overlaps.*chunk/);
  }
});

test("ranks exclusive chunk savings independently of source-map confidence", () => {
  const phase = analyzeChunks([
    { id: "unmapped", totalBytes: 120_000, usedBytes: 20_000, mapped: false },
    { id: "mapped", totalBytes: 110_000, usedBytes: 20_000 }
  ]);
  const chunks = phase.opportunities.filter((item) => item.kind === "large-low-use-chunk");

  assert.deepEqual(chunks.map((item) => item.id), ["chunk:unmapped", "chunk:mapped"]);
  assert.equal(chunks[0].confidence, "low");
  assert.equal(chunks[1].confidence, "high");
});

test("keeps the minimum absolute-byte threshold and excludes fully executed chunks", () => {
  const phase = analyzeChunks([
    { id: "tiny-unused-tail", totalBytes: MiB, usedBytes: MiB - 1024 },
    { id: "fully-used", totalBytes: MiB, usedBytes: MiB }
  ]);

  assert.deepEqual(phase.opportunities, []);
});

test("deferring a whole optional chunk can remove more than its unexecuted-byte score, including executed setup", () => {
  const core = { id: "core", totalBytes: 128 * 1024, usedBytes: 96 * 1024 };
  const optional = { id: "optional", totalBytes: 64 * 1024, usedBytes: 16 * 1024 };
  const before = analyzeChunks([core, optional]);
  const after = analyzeChunks([core]);
  const candidate = before.opportunities.find((item) => item.id === "chunk:optional");
  const totals = (phase) => ({
    total: phase.chunks.reduce((sum, chunk) => sum + chunk.totalBytes, 0),
    used: phase.chunks.reduce((sum, chunk) => sum + chunk.usedBytes, 0)
  });
  const baseline = totals(before);
  const rebuilt = totals(after);
  const totalReduction = baseline.total - rebuilt.total;
  const usedReduction = baseline.used - rebuilt.used;

  assert.equal(candidate.potentialSavingsBytes, candidate.unusedBytes);
  assert.equal(candidate.coverageFloorBytes, candidate.usedBytes);
  assert.equal(candidate.score, candidate.unusedBytes);
  assert.equal(totalReduction, optional.totalBytes);
  assert.ok(totalReduction > candidate.potentialSavingsBytes);
  assert.equal(usedReduction, candidate.coverageFloorBytes);
  assert.equal(after.chunks.find((chunk) => chunk.chunkId === "optional")?.totalBytes ?? 0, 0);
  assert.equal((baseline.used - usedReduction) / (baseline.total - totalReduction), rebuilt.used / rebuilt.total);
  assert.notEqual(baseline.used / rebuilt.total, rebuilt.used / rebuilt.total);
});
