import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

for (const directory of ["ascii-repo", "repo with spaces", "中文仓库"]) {
  test(`clean removes build output in ${directory}`, (t) => {
    const temporary = mkdtempSync(join(tmpdir(), "divebell-clean-"));
    t.after(() => rmSync(temporary, { recursive: true, force: true }));
    const root = join(temporary, directory);
    mkdirSync(join(root, "scripts"), { recursive: true });
    copyFileSync(new URL("./clean.mjs", import.meta.url), join(root, "scripts/clean.mjs"));

    // Exercise both a top-level package and a nested extension, leaving the
    // other packages absent to check clean also works before the first build.
    const packages = ["core", "extensions/memory"];
    for (const name of packages) {
      const path = join(root, "packages", name);
      mkdirSync(join(path, "dist/nested"), { recursive: true });
      writeFileSync(join(path, "dist/nested/output.js"), "build output");
      writeFileSync(join(path, "source.ts"), "source must survive");
    }
    // Run from outside the fixture: clean must resolve its own repository.
    for (let run = 0; run < 2; run += 1) {
      const result = spawnSync(process.execPath, [join(root, "scripts/clean.mjs")], {
        cwd: temporary,
        encoding: "utf8"
      });
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      for (const name of packages) {
        const path = join(root, "packages", name);
        assert.equal(existsSync(join(path, "dist")), false, `${name}/dist must be removed`);
        assert.equal(readFileSync(join(path, "source.ts"), "utf8"), "source must survive");
      }
    }
  });
}
