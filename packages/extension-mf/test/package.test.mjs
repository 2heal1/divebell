import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  createOpenRuntimeCli,
  createOpenRuntimeCliWithExternalExtensions,
  validateExtension
} from "@openruntime/cli";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("extension manifest is valid and implementation stays lazy", async () => {
  const extension = (await import(pathToFileURL(resolve(packageRoot, "dist/extension.js")).href)).default;
  const validated = validateExtension(extension);
  assert.equal(validated.name, "mf");
  assert.deepEqual(validated.commands.map((command) => command.name), ["mf"]);
  assert.equal(typeof validated.hooks.open, "function");
  const entrySource = readFileSync(resolve(packageRoot, "dist/extension.js"), "utf8");
  assert.match(entrySource, /import\("\.\/index\.js"\)/);
  assert.match(entrySource, /import\("\.\/open\.js"\)/);
  assert.doesNotMatch(entrySource, /getRuntimeState|readFile/);
});

test("packed npm archive is self-contained and has no runtime dependencies", () => {
  const outputDirectory = mkdtempSync(join(tmpdir(), "openruntime-extension-mf-pack-"));
  try {
    const packed = spawnSync("pnpm", ["pack", "--pack-destination", outputDirectory], {
      cwd: packageRoot,
      encoding: "utf8"
    });
    assert.equal(packed.status, 0, packed.stderr);
    const archive = join(outputDirectory, "openruntime-extension-mf-0.1.2.tgz");
    const listed = spawnSync("tar", ["-tf", archive], { encoding: "utf8" });
    assert.equal(listed.status, 0, listed.stderr);
    assert.match(listed.stdout, /package\/dist\/extension\.js/);
    assert.match(listed.stdout, /package\/dist\/observability-chrome-devtool\.iife\.js/);
    assert.match(listed.stdout, /package\/dist\/install-observability\.js/);
    assert.match(listed.stdout, /package\/README\.md/);
    const packageJson = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
    assert.equal(packageJson.dependencies, undefined);
    assert.equal(packageJson.openruntime.extensions[0], "./dist/extension.js");
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test("packed archive installs and loads through the external extension mechanism", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "openruntime-extension-mf-install-"));
  const packDirectory = join(tempDirectory, "pack");
  const extensionsDirectory = join(tempDirectory, "extensions");
  try {
    mkdirSync(packDirectory, { recursive: true });
    const packed = spawnSync("pnpm", ["pack", "--pack-destination", packDirectory], {
      cwd: packageRoot,
      encoding: "utf8"
    });
    assert.equal(packed.status, 0, packed.stderr);
    const archive = join(packDirectory, "openruntime-extension-mf-0.1.2.tgz");
    let stdout = "";
    let stderr = "";
    const cli = createOpenRuntimeCli();
    const exitCode = await cli.run([
      "extensions",
      "add",
      "@openruntime/extension-mf"
    ], {
      stdout: { write(chunk) { stdout += chunk; } },
      stderr: { write(chunk) { stderr += chunk; } },
      extensionsDirectory,
      extensionPackageDownloader: {
        download: async () => archive
      }
    });
    assert.equal(exitCode, 0, stderr);
    assert.equal(JSON.parse(stdout).package.name, "@openruntime/extension-mf");

    const loaded = await createOpenRuntimeCliWithExternalExtensions({}, {
      ...process.env,
      OPENRUNTIME_EXTENSIONS_DIR: extensionsDirectory,
      OPENRUNTIME_DISABLE_EXTENSIONS: "0"
    });
    assert.deepEqual(loaded.cli.extensions.map((extension) => extension.name), ["mf"]);
    assert.deepEqual(loaded.cli.extensions[0].commands.map((command) => command.name), ["mf"]);
    assert.equal(typeof loaded.cli.extensions[0].hooks.open, "function");
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});
