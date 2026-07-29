import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../../..");
const distDirectory = resolve(packageRoot, "dist");
const vendorDirectory = resolve(distDirectory, "vendor/chunk-map");

await mkdir(vendorDirectory, { recursive: true });
await cp(resolve(repositoryRoot, "packages/chunk-map/dist"), vendorDirectory, {
  recursive: true,
  filter: (source) => !source.endsWith("tsconfig.tsbuildinfo") && !source.endsWith(".d.ts") && !source.endsWith(".d.ts.map")
});

for (const entry of await readdir(distDirectory, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
  const path = resolve(distDirectory, entry.name);
  const source = await readFile(path, "utf8");
  await writeFile(path, source.replaceAll('from "@divebell/chunk-map"', 'from "./vendor/chunk-map/index.js"'), "utf8");
}
