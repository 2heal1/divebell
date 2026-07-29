import { execFile } from "node:child_process";
import { access, cp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = resolve(packageRoot, "../../tests/e2e");
const destinationDirectory = resolve(packageRoot, "dist/e2e");
const tsconfigPath = resolve(sourceDirectory, "tsconfig.json");
const execFileAsync = promisify(execFile);

if (!await exists(sourceDirectory)) {
  if (await exists(resolve(destinationDirectory, "e2e.test.js"))) process.exit(0);
  throw new Error(`Could not find e2e source directory: ${sourceDirectory}`);
}

await rm(destinationDirectory, { recursive: true, force: true });
const requireFromPackage = createRequire(import.meta.url);
const typescriptBin = requireFromPackage.resolve("typescript/bin/tsc");
await execFileAsync(process.execPath, [
  typescriptBin,
  "--build",
  tsconfigPath,
  "--pretty",
  "false"
], {
  cwd: packageRoot
});
await rm(resolve(destinationDirectory, "tsconfig.tsbuildinfo"), {
  force: true
});
await rm(resolve(packageRoot, "dist/tsconfig.tsbuildinfo"), {
  force: true
});
await cp(sourceDirectory, destinationDirectory, {
  recursive: true,
  filter: (source) => !source.endsWith(".ts") && source !== tsconfigPath
});

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}
