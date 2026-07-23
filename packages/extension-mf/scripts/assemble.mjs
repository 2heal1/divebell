import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = resolve(packageRoot, "dist");

await mkdir(distDirectory, { recursive: true });
await Promise.all([
  copyFile(
    resolve(packageRoot, "assets/observability-chrome-devtool.iife.js"),
    resolve(distDirectory, "observability-chrome-devtool.iife.js")
  ),
  copyFile(
    resolve(packageRoot, "assets/install-observability.js"),
    resolve(distDirectory, "install-observability.js")
  ),
  copyFile(
    resolve(packageRoot, "assets/observability-build.json"),
    resolve(distDirectory, "observability-build.json")
  ),
  copyFile(
    resolve(packageRoot, "assets/install-runtime-debug.js"),
    resolve(distDirectory, "install-runtime-debug.js")
  ),
  copyFile(
    resolve(packageRoot, "assets/runtime-debug-build.json"),
    resolve(distDirectory, "runtime-debug-build.json")
  )
]);
