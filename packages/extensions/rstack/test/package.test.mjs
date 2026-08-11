import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { access, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

test("publishes a self-contained Extension runtime and its command skill", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url)));
  assert.deepEqual(packageJson.divebell.extensions, ["./dist/extension.js"]);
  assert.equal(packageJson.dependencies, undefined);
  await access(new URL("../skills/observe-rstack-hmr/SKILL.md", import.meta.url));

  const distDirectory = new URL("../dist", import.meta.url);
  const javascript = (await readdir(distDirectory))
    .filter((name) => name.endsWith(".js"));
  assert.ok(javascript.length > 0);
  for (const name of javascript) {
    const source = await readFile(join(distDirectory.pathname, name), "utf8");
    assert.doesNotMatch(source, /from ["']@divebell\/cli["']/u);
  }
});

test("packed archive supports real package-name imports", () => {
  const temporary = mkdtempSync(join(tmpdir(), "divebell-rstack-package-"));
  const packDirectory = join(temporary, "pack");
  try {
    mkdirSync(packDirectory, { recursive: true });
    const packed = spawnSync("pnpm", [
      "pack",
      "--pack-destination",
      packDirectory
    ], {
      cwd: packageRoot,
      encoding: "utf8"
    });
    assert.equal(packed.status, 0, packed.stderr);
    const archive = join(packDirectory, "divebell-extension-rstack-0.0.17.tgz");
    const installed = spawnSync("npm", [
      "install",
      "--ignore-scripts",
      "--no-package-lock",
      archive
    ], {
      cwd: temporary,
      encoding: "utf8",
      env: {
        ...process.env,
        npm_config_cache: join(temporary, "npm-cache")
      }
    });
    assert.equal(installed.status, 0, installed.stderr);
    const imported = spawnSync(process.execPath, [
      "--input-type=module",
      "-e",
      `const extension = await import("@divebell/extension-rstack");
       const core = await import("@divebell/extension-rstack/core");
       const definition = await import("@divebell/extension-rstack/extension");
       if (extension.default?.name !== "rstack") process.exit(2);
       if (definition.default?.commands?.[0]?.name !== "rstack") process.exit(3);
       if (typeof core.runRstackCommand !== "function") process.exit(4);`
    ], {
      cwd: temporary,
      encoding: "utf8"
    });
    assert.equal(imported.status, 0, imported.stderr);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
