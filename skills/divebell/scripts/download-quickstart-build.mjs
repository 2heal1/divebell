#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const baseUrl = ensureTrailingSlash(
  option("--base") ?? "https://2heal1.github.io/divebell/quickstart/"
);
const outputDirectory = resolve(
  option("--output") ?? "/tmp/divebell-quickstart-build"
);
const chunkMapUrl = new URL("divebell-chunks.json", baseUrl);
const chunkMapSource = await readText(chunkMapUrl);
const chunkMap = JSON.parse(chunkMapSource);

if (!Array.isArray(chunkMap?.chunks)) {
  throw new Error(`Invalid Quick Start Chunk Map at ${chunkMapUrl.href}.`);
}

const files = new Set(["divebell-chunks.json"]);
for (const asset of chunkMap.chunks.flatMap((chunk) => chunk.assets ?? [])) {
  if (typeof asset.file !== "string" || !asset.file.endsWith(".js")) continue;
  files.add(safeRelativePath(asset.file));
  if (typeof asset.sourceMap === "string") {
    files.add(safeRelativePath(asset.sourceMap));
  }
}

await Promise.all([...files].map(async (file) => {
  const destination = join(outputDirectory, file);
  const source = file === "divebell-chunks.json"
    ? chunkMapSource
    : await readText(new URL(file, baseUrl));
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, source, "utf8");
}));

process.stdout.write(`${JSON.stringify({
  status: "ok",
  baseUrl,
  outputDirectory,
  chunkMap: join(outputDirectory, "divebell-chunks.json"),
  fileCount: files.size
}, null, 2)}\n`);

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function ensureTrailingSlash(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Quick Start build URL must use HTTP or HTTPS.");
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  url.search = "";
  url.hash = "";
  return url.href;
}

function safeRelativePath(value) {
  const normalized = value.replaceAll("\\", "/");
  if (
    normalized.startsWith("/")
    || normalized.split("/").includes("..")
    || normalized.includes("://")
  ) {
    throw new Error(`Unsafe Quick Start build path: ${value}`);
  }
  return normalized;
}

async function readText(url) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) {
    throw new Error(`Cannot download ${url.href}: HTTP ${response.status}.`);
  }
  return await response.text();
}
