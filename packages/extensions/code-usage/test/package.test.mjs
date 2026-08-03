import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryDirectory = resolve(packageDirectory, "../../..");

test("packs and exposes the code usage analysis skill", () => {
  const skill = readFileSync(
    join(packageDirectory, "skills/analyze-code-usage/SKILL.md"),
    "utf8"
  );
  assert.match(skill, /A standard code-usage report includes page-ready time/);
  assert.match(skill, /Skip this step only when the user explicitly requests a\s+code-only report/);
  assert.match(skill, /reopen the page with `--code-usage-experience` for each additional\s+phase/);
  const skillMetadata = readFileSync(
    join(packageDirectory, "skills/analyze-code-usage/agents/openai.yaml"),
    "utf8"
  );
  assert.match(skillMetadata, /complete page-experience and code-usage report/);

  const outputDirectory = mkdtempSync(join(tmpdir(), "divebell-code-usage-package-"));
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
      "package/skills/analyze-code-usage/SKILL.md",
      "package/skills/analyze-code-usage/agents/openai.yaml"
    ]) {
      assert.equal(entries.includes(path), true, path);
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
      "code-usage",
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
