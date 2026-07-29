import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryDirectory = resolve(packageDirectory, "../../..");

test("packs the command skill with the recording extension", () => {
  const outputDirectory = mkdtempSync(join(tmpdir(), "divebell-imitate-package-"));
  try {
    execFileSync("pnpm", ["pack", "--pack-destination", outputDirectory], {
      cwd: packageDirectory,
      encoding: "utf8"
    });
    const archive = join(
      outputDirectory,
      readdirSync(outputDirectory).find((name) => name.endsWith(".tgz"))
    );
    const entries = execFileSync("tar", ["-tzf", archive], {
      encoding: "utf8"
    }).split(/\r?\n/u);

    for (const path of [
      "package/skills/record-divebell-workflow/SKILL.md",
      "package/skills/record-divebell-workflow/agents/openai.yaml",
      "package/skills/record-divebell-workflow/references/divebell-cli.md"
    ]) {
      assert.equal(entries.includes(path), true, path);
    }

    for (const path of [
      "SKILL.md",
      "agents/openai.yaml",
      "references/divebell-cli.md"
    ]) {
      assert.equal(
        readFileSync(join(packageDirectory, "skills/record-divebell-workflow", path), "utf8"),
        readFileSync(join(repositoryDirectory, "skills/record-divebell-workflow", path), "utf8"),
        `packaged skill copy is stale: ${path}`
      );
    }

    const extensionsDirectory = join(outputDirectory, "extensions");
    const cliPath = join(repositoryDirectory, "divebell");
    const env = {
      ...process.env,
      DIVEBELL_EXTENSIONS_DIR: extensionsDirectory
    };
    execFileSync(process.execPath, [
      cliPath,
      "extensions",
      "add",
      archive,
      "--extensions-dir",
      extensionsDirectory
    ], {
      cwd: repositoryDirectory,
      env,
      encoding: "utf8"
    });
    const installedSkillPath = execFileSync(process.execPath, [
      cliPath,
      "record",
      "--skill"
    ], {
      cwd: repositoryDirectory,
      env,
      encoding: "utf8"
    }).trim();
    assert.equal(existsSync(installedSkillPath), true);
    assert.equal(
      realpathSync(installedSkillPath).startsWith(realpathSync(extensionsDirectory)),
      true
    );
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
});
