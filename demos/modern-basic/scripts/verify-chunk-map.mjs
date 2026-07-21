import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  analyzeOpenRuntimeCodeUsage,
  matchOpenRuntimeChunk
} from "@openruntime/modern-plugin/chunk-map";

const demoDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(demoDirectory, "../..");
const distDirectory = join(demoDirectory, "dist");
const mapPath = join(distDirectory, "openruntime-chunks.json");
const chunkMap = JSON.parse(await readFile(mapPath, "utf8"));
const openRuntimeVersion = JSON.parse(
  await readFile(join(repositoryRoot, "packages/core/package.json"), "utf8")
).version;
const javascriptFiles = await findJavaScriptFiles(join(distDirectory, "static", "js"));
const matches = [];
const coverageAssets = [];
const fullyExecutedScripts = [];

const staleBuild = matchOpenRuntimeChunk(
  chunkMap,
  "/static/js/unknown.js",
  { expectedBuildId: `${chunkMap.buildId}-stale` }
);
if (staleBuild.status !== "build-mismatch") {
  throw new Error("Chunk Map did not reject a stale build id.");
}

for (const absolutePath of javascriptFiles) {
  const file = relative(distDirectory, absolutePath).replaceAll("\\", "/");
  const result = matchOpenRuntimeChunk(
    chunkMap,
    `https://cdn.example.test/release/${chunkMap.buildId}/${file}?verify=1`,
    { expectedBuildId: chunkMap.buildId }
  );
  if (result.status !== "matched") {
    throw new Error(`Chunk Map did not uniquely match ${file}: ${result.status}`);
  }
  const fileStat = await stat(absolutePath);
  if (result.asset.size !== fileStat.size) {
    throw new Error(`Chunk Map size mismatch for ${file}`);
  }
  if (result.asset.sourceMap === null) {
    throw new Error(`Chunk Map has no source map for ${file}`);
  }
  const sourceMapPath = join(distDirectory, result.asset.sourceMap);
  await stat(sourceMapPath);
  const code = await readFile(absolutePath, "utf8");
  coverageAssets.push({
    file,
    code,
    sourceMapPath,
    sourceMap: JSON.parse(await readFile(sourceMapPath, "utf8"))
  });
  fullyExecutedScripts.push({
    scriptId: String(fullyExecutedScripts.length + 1),
    url: `https://cdn.example.test/${file}`,
    functions: [{
      functionName: "",
      ranges: [{ startOffset: 0, endOffset: code.length, count: 1 }]
    }]
  });
  if (result.chunk.modules.length === 0) {
    throw new Error(`Chunk Map has no source modules for ${file}`);
  }
  matches.push({
    file,
    chunkId: result.chunk.id,
    initial: result.chunk.initial,
    groups: result.chunk.groups,
    moduleCount: result.chunk.modules.length
  });
}

const orders = matches.find((match) => match.groups.includes("orders/page"));
if (orders === undefined || orders.initial) {
  throw new Error("Orders route was not identified as an asynchronous chunk.");
}
const ordersChunk = chunkMap.chunks.find((chunk) => chunk.id === orders.chunkId);
if (!ordersChunk?.modules.some((module) =>
  module.sourcePath?.endsWith("/src/routes/orders/page.tsx"))) {
  throw new Error("Orders chunk was not mapped to its original route module.");
}
if (ordersChunk.splitRule?.kind !== "dynamic-import") {
  throw new Error("Orders chunk was not mapped to its dynamic import rule.");
}
for (const [chunkName, ruleName] of [["lib-react", "react"], ["lib-router", "router"]]) {
  const chunk = chunkMap.chunks.find((item) => item.names.includes(chunkName));
  if (chunk?.splitRule?.configPath !== `optimization.splitChunks.cacheGroups.${ruleName}`) {
    throw new Error(`${chunkName} was not mapped to cache group ${ruleName}.`);
  }
}

assertPackage("application", "@openruntime/demo-modern-basic", "0.0.0");
assertPackage("workspace", "@openruntime/core", openRuntimeVersion);
assertPackage("workspace", "@modern-js/runtime");
assertPackage("third-party", "react");
assertPackage("third-party", "react-dom");
assertPackage("third-party", "react-router");
assertPackage("third-party", "@babel/runtime");

const allModules = chunkMap.chunks.flatMap((chunk) => chunk.modules);
const thirdPartyWithoutIdentity = allModules.filter((module) =>
  module.owner.kind === "third-party"
  && (module.owner.packageName === null || module.owner.packageVersion === null));
if (thirdPartyWithoutIdentity.length > 0) {
  throw new Error("Some third-party modules are missing package name or version.");
}
const generatedEntry = allModules.find((module) =>
  module.sourcePath?.includes("/node_modules/.modern-js/"));
if (generatedEntry?.owner.kind !== "application") {
  throw new Error("Modern.js generated application modules were misclassified.");
}

const usage = analyzeOpenRuntimeCodeUsage({
  chunkMap,
  checkpoints: [{
    schemaVersion: 1,
    label: "all-generated-code",
    scripts: fullyExecutedScripts
  }],
  assets: coverageAssets
});
const usagePackages = usage.phases[0]?.packages ?? [];
const usageReactChunk = usage.phases[0]?.chunks.find((chunk) => chunk.names?.includes("lib-react"));
if (usageReactChunk?.splitRule?.configPath !== "optimization.splitChunks.cacheGroups.react") {
  throw new Error("Code usage report did not preserve the React split rule mapping.");
}
for (const packageName of ["@openruntime/demo-modern-basic", "react", "react-dom"]) {
  const packageUsage = usagePackages.find((item) => item.packageName === packageName);
  if (packageUsage === undefined || packageUsage.usedBytes <= 0) {
    throw new Error(`Source map coverage did not resolve ${packageName}.`);
  }
}

process.stdout.write(`${JSON.stringify({
  buildId: chunkMap.buildId,
  javascriptFiles: matches.length,
  initialChunks: matches.filter((match) => match.initial).length,
  asyncChunks: matches.filter((match) => !match.initial).length,
  packages: Object.fromEntries(
    ["application", "workspace", "third-party"].map((kind) => [
      kind,
      chunkMap.packages.filter((item) => item.kind === kind).length
    ])
  ),
  coveragePackages: usagePackages.length,
  orders
}, null, 2)}\n`);

function assertPackage(kind, packageName, packageVersion) {
  const match = chunkMap.packages.find((item) =>
    item.kind === kind
    && item.packageName === packageName
    && (packageVersion === undefined || item.packageVersion === packageVersion));
  if (match === undefined) {
    const version = packageVersion === undefined ? "" : `@${packageVersion}`;
    throw new Error(`Missing ${kind} package ${packageName}${version}.`);
  }
}

async function findJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findJavaScriptFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(path);
    }
  }
  return files.sort();
}
