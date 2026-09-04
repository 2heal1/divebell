import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryDirectory = resolve(packageDirectory, "../../..");

test("packs one code usage skill with analysis and optimization references", () => {
  const skill = readFileSync(
    join(packageDirectory, "skills/analyze-code-usage/SKILL.md"),
    "utf8"
  );
  assert.match(skill, /Choose one mode before acting/);
  assert.match(skill, /references\/analyze\.md/);
  assert.match(skill, /references\/optimize-first-screen\.md/);
  assert.match(skill, /does\s+not create a second Skill/);
  const skillMetadata = readFileSync(
    join(packageDirectory, "skills/analyze-code-usage/agents/openai.yaml"),
    "utf8"
  );
  assert.match(skillMetadata, /complete page-experience and code-usage report/);
  const analysisReference = readFileSync(
    join(packageDirectory, "skills/analyze-code-usage/references/analyze.md"),
    "utf8"
  );
  assert.match(analysisReference, /page-stable@2/);
  assert.match(analysisReference, /potentialSavingsBytes/);
  assert.match(analysisReference, /Coverage changes JavaScript-engine behavior/);
  assert.match(analysisReference, /BROWSER_CLI/);
  assert.match(analysisReference, /bytedbrowser/);
  assert.match(analysisReference, /AGENT_BROWSER_SOCKET_DIR/);
  assert.match(analysisReference, /DIVEBELL_SETUP_REMOTE_DEBUGGING_REQUIRED/);
  assert.match(analysisReference, /write-to-disk/);
  assert.match(analysisReference, /production hostname/);
  assert.match(analysisReference, /fresh browser page target/);
  assert.match(analysisReference, /tab new about:blank/);
  const optimizationReference = readFileSync(
    join(packageDirectory, "skills/analyze-code-usage/references/optimize-first-screen.md"),
    "utf8"
  );
  assert.match(optimizationReference, /70% aggregate execution ratio/);
  assert.match(optimizationReference, /code-usage-optimization-state\.json/);
  assert.match(optimizationReference, /ENVIRONMENT_VERIFIED/);
  assert.match(optimizationReference, /USAGE_BACKLOGGED/);
  assert.match(optimizationReference, /Use `PAUSED` for a timebox/);
  assert.match(optimizationReference, /Usage lane/);
  assert.match(optimizationReference, /Topology lane/);
  assert.match(optimizationReference, /`splitChunks`\s+only changes topology/);
  assert.match(optimizationReference, /original CDN hostname/);

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
      "package/skills/analyze-code-usage/agents/openai.yaml",
      "package/skills/analyze-code-usage/references/analyze.md",
      "package/skills/analyze-code-usage/references/optimize-first-screen.md"
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
