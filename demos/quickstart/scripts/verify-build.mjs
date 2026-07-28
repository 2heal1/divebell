import { access, readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const demoDirectory = resolve(import.meta.dirname, "..");
const distDirectory = join(demoDirectory, "dist");
const chunkMapPath = join(distDirectory, "divebell-chunks.json");
const expectedBase = process.env.DIVEBELL_PAGES_BASE;

const [html, chunkMapSource] = await Promise.all([
  readFile(join(distDirectory, "index.html"), "utf8"),
  readFile(chunkMapPath, "utf8")
]);
const chunkMap = JSON.parse(chunkMapSource);
const javascriptAssets = chunkMap.chunks
  .flatMap((chunk) => chunk.assets)
  .filter((asset) => asset.file.endsWith(".js"));

if (javascriptAssets.length < 2) {
  throw new Error("Quick Start must contain an entry chunk and an on-demand insights chunk.");
}
if (!javascriptAssets.some((asset) => asset.file.includes("async"))) {
  throw new Error("Quick Start did not emit an async insights chunk.");
}
for (const asset of javascriptAssets) {
  if (asset.sourceMap === null) {
    throw new Error(`JavaScript asset ${asset.file} is missing a source map.`);
  }
  const [code, map] = await Promise.all([
    stat(join(distDirectory, asset.file)),
    stat(join(distDirectory, asset.sourceMap))
  ]);
  if (code.size === 0 || map.size === 0) {
    throw new Error(`JavaScript asset ${asset.file} or its source map is empty.`);
  }
}
if (expectedBase !== undefined && !html.includes(expectedBase)) {
  throw new Error(`Built HTML does not use the expected Pages base ${expectedBase}.`);
}

await Promise.all([
  access(join(distDirectory, "data", "orders.json")),
  access(join(distDirectory, "data", "inventory.json")),
  access(join(distDirectory, "og.png"))
]);

const missingFile = (await readdir(join(distDirectory, "data")))
  .some((file) => file.includes("inventory-missing"));
if (missingFile) {
  throw new Error("The controlled failure endpoint must stay missing so the browser records a real 404.");
}

process.stdout.write(`${JSON.stringify({
  status: "ok",
  buildId: chunkMap.buildId,
  javascriptAssets: javascriptAssets.length,
  sourceMaps: javascriptAssets.filter((asset) => asset.sourceMap !== null).length,
  pagesBase: expectedBase ?? "/"
}, null, 2)}\n`);
