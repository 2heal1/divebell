import { access, cp, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = resolve(packageRoot, "../../tests/e2e");
const destinationDirectory = resolve(packageRoot, "dist/e2e");

if (!await exists(sourceDirectory)) {
  if (await exists(resolve(destinationDirectory, "e2e.test.mjs"))) process.exit(0);
  throw new Error(`Could not find e2e source directory: ${sourceDirectory}`);
}

await rm(destinationDirectory, { recursive: true, force: true });
await cp(sourceDirectory, destinationDirectory, { recursive: true });

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}
