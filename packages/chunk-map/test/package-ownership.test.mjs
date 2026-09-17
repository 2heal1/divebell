import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDivebellCodeUsage, createDivebellChunkMap } from "../dist/index.js";

function buildMap(specs) {
  return createDivebellChunkMap({
    hash: "package-owner-test", publicPath: "/",
    assets: specs.flatMap(({ id, total = 100_000 }) => [
      { name: `${id}.js`, size: total }, { name: `${id}.js.map`, size: 100 }
    ]),
    chunks: specs.map(({ id, source, total = 100_000, metadata }) => ({
      id, files: [`${id}.js`], initial: true,
      modules: [{ id, identifier: source, resource: source, size: total, descriptionFileData: metadata }]
    }))
  }, { context: "/repo" });
}

function analyze(specs, chunkMap = buildMap(specs), keepModules = false) {
  return analyzeDivebellCodeUsage({
    chunkMap: {
      ...chunkMap,
      chunks: chunkMap.chunks.map((chunk) => ({ ...chunk, modules: keepModules ? chunk.modules : [] }))
    },
    checkpoints: [{ schemaVersion: 1, scripts: specs.map(({ id, total = 100_000, used = 10_000 }) => ({
      scriptId: id, url: `https://app.test/${id}.js`, runtimeSource: "x".repeat(total),
      functions: [{ functionName: "", ranges: [
        { startOffset: 0, endOffset: total, count: 1 }, { startOffset: used, endOffset: total, count: 0 }
      ] }]
    })) }],
    assets: specs.map(({ id, source, total = 100_000 }) => ({
      file: `${id}.js`, code: "x".repeat(total), sourceMapPath: `/archive/dist/${id}.js.map`,
      sourceMap: { version: 3, sources: [source], mappings: "AAAA" }
    }))
  }).phases[0];
}

const cases = [
  ["plain version", "/repo/node_modules/.pnpm/lodash@4.17.21/node_modules/lodash/index.js", "lodash", "4.17.21"],
  ["unscoped peer", "/repo/node_modules/.pnpm/vue-draggable-next@2.3.0_vue@3.5.12/node_modules/vue-draggable-next/index.js", "vue-draggable-next", "2.3.0"],
  ["scoped package and peers", "/repo/node_modules/.pnpm/@scope+widget@1.2.3-beta.4_vue@3.5.12_@other+peer@7.8.9/node_modules/@scope/widget/index.js", "@scope/widget", "1.2.3-beta.4"],
  ["hashed peer suffix", "/repo/node_modules/.pnpm/@scope+widget@1.2.3_peerhash/node_modules/@scope/widget/index.js", "@scope/widget", "1.2.3"],
  ["parenthesized peer suffix", "/repo/node_modules/.pnpm/widget@1.2.3(react@18.3.1)/node_modules/widget/index.js", "widget", "1.2.3"],
  ["prerelease and build metadata", "/repo/node_modules/.pnpm/widget@1.2.3-rc.2+build.4_react@18.3.1/node_modules/widget/index.js", "widget", "1.2.3-rc.2+build.4"],
  ["Windows separators", "C:\\repo\\node_modules\\.pnpm\\@scope+widget@1.2.3_vue@3.5.12\\node_modules\\@scope\\widget\\index.js", "@scope/widget", "1.2.3"],
  ["innermost virtual store", "/repo/node_modules/.pnpm/outer@9.0.0/node_modules/outer/node_modules/.pnpm/widget@1.2.3_peer@4.5.6/node_modules/widget/index.js", "widget", "1.2.3"],
  ["peer is not store package", "/repo/node_modules/.pnpm/outer@9.0.0_widget@1.2.3/node_modules/widget/index.js", "widget", null],
  ["same-name nested package lacks own version evidence", "/repo/node_modules/.pnpm/widget@1.2.3/node_modules/widget/node_modules/widget/index.js", "widget", null],
  ["non-pnpm path", "/repo/node_modules/widget/index.js", "widget", null],
  ["missing own version", "/repo/node_modules/.pnpm/widget@_peer@4.5.6/node_modules/widget/index.js", "widget", null]
];

for (const [name, source, packageName, packageVersion] of cases) {
  test(`build and source-map fallback agree on ${name}`, () => {
    const specs = [{ id: "test", source }];
    const map = buildMap(specs);
    const phase = analyze(specs, map);
    for (const owner of [map.chunks[0].modules[0].owner, phase.sources[0].owner]) {
      assert.equal(owner.packageName, packageName);
      assert.equal(owner.packageVersion, packageVersion);
    }
  });
}

test("two real dependency versions sharing one peer stay distinct without changing byte accounting", () => {
  const specs = [
    { id: "7242", source: "/archive/node_modules/.pnpm/vue-draggable-next@2.3.0_vue@3.5.12/node_modules/vue-draggable-next/index.js", total: 41035, used: 3311 },
    { id: "1859", source: "/archive/node_modules/.pnpm/vue-draggable-next@2.2.1_vue@3.5.12/node_modules/vue-draggable-next/index.js", total: 40954, used: 3478 }
  ];
  const phase = analyze(specs);
  assert.deepEqual(phase.packages.map((item) => [item.packageVersion, item.totalBytes, item.usedBytes]), [
    ["2.3.0", 41035, 3311], ["2.2.1", 40954, 3478]
  ]);
  assert.equal(phase.packages.reduce((sum, item) => sum + item.totalBytes, 0), 81989);
  assert.equal(phase.packages.reduce((sum, item) => sum + item.usedBytes, 0), 6789);
  assert.deepEqual(phase.opportunities.filter((item) => item.savingsAccounting === "exclusive-chunk")
    .map((item) => [item.subject, item.totalBytes, item.usedBytes, item.potentialSavingsBytes]), [
    ["Chunk 7242", 41035, 3311, 37724], ["Chunk 1859", 40954, 3478, 37476]
  ]);
});

test("different archive roots do not let the first module owner capture another pnpm version", () => {
  const paths = ["2.2.1", "2.3.0"].map((version) =>
    `/repo/node_modules/.pnpm/vue-draggable-next@${version}_vue@3.5.12/node_modules/vue-draggable-next/index.js`);
  const first = buildMap([{ id: "bundle", source: paths[0] }]);
  const second = buildMap([{ id: "second", source: paths[1] }]);
  first.chunks[0].modules.push(second.chunks[0].modules[0]);
  const phase = analyze([{ id: "bundle", source: paths[1].replace("/repo/", "/archive/") }], first, true);
  assert.equal(phase.sources[0].owner.packageVersion, "2.3.0");
});

test("explicit package metadata still takes precedence over inferred store versions", () => {
  const source = "/repo/node_modules/.pnpm/widget@1.2.3_peer@9.0.0/node_modules/widget/index.js";
  const specs = [{ id: "test", source, metadata: { name: "widget", version: "1.2.4" } }];
  const map = buildMap(specs);
  assert.equal(map.chunks[0].modules[0].owner.packageVersion, "1.2.4");
  assert.equal(analyze(specs, map, true).sources[0].owner.packageVersion, "1.2.4");
});
