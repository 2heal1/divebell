import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const noBuild = args.has("--no-build");

if (!noBuild) {
  run("pnpm", ["--dir", "packages/cli", "run", "build"]);
}

const helpModuleUrl = pathToFileURL(join(repoRoot, "packages/cli/dist/help.js")).href;
const { createCliReferenceMarkdown, createCliSkillSectionMarkdown } = await import(helpModuleUrl);
const cliReferenceContent = createCliReferenceMarkdown();
const skillCliHeading = "## 常用 CLI";
const cliSkillSection = createCliSkillSectionMarkdown(undefined, { heading: skillCliHeading });

const cliReferencePath = join(repoRoot, "docs/cli-reference.md");
const skillCliReferencePath = join(repoRoot, "skills/openruntime/references/cli.md");
const skillPath = join(repoRoot, "skills/openruntime/SKILL.md");
const skillContent = await readExisting(skillPath);
const updatedSkillContent = replaceMarkdownSection(skillContent, skillCliHeading, cliSkillSection);

let hasMismatch = false;
if (checkOnly) {
  if (await readExisting(cliReferencePath) !== cliReferenceContent) {
    hasMismatch = true;
    console.error(`${relative(repoRoot, cliReferencePath)} is out of date. Run "pnpm run docs:cli".`);
  }
  if (await readExisting(skillCliReferencePath) !== cliReferenceContent) {
    hasMismatch = true;
    console.error(`${relative(repoRoot, skillCliReferencePath)} is out of date. Run "pnpm run docs:cli".`);
  }
  if (skillContent !== updatedSkillContent) {
    hasMismatch = true;
    console.error(`${relative(repoRoot, skillPath)} CLI command section is out of date. Run "pnpm run docs:cli".`);
  }
} else {
  await mkdir(dirname(cliReferencePath), { recursive: true });
  await writeFile(cliReferencePath, cliReferenceContent, "utf8");
  console.log(`updated ${relative(repoRoot, cliReferencePath)}`);
  await mkdir(dirname(skillCliReferencePath), { recursive: true });
  await writeFile(skillCliReferencePath, cliReferenceContent, "utf8");
  console.log(`updated ${relative(repoRoot, skillCliReferencePath)}`);
  await writeFile(skillPath, updatedSkillContent, "utf8");
  console.log(`updated ${relative(repoRoot, skillPath)} CLI command section`);
}

if (hasMismatch) {
  process.exitCode = 1;
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function readExisting(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function replaceMarkdownSection(markdown, heading, replacement) {
  const normalizedReplacement = replacement.endsWith("\n") ? replacement : `${replacement}\n`;
  const start = markdown.indexOf(`${heading}\n`);
  if (start === -1) {
    throw new Error(`Could not find "${heading}" section in skills/openruntime/SKILL.md.`);
  }

  const nextHeadingPattern = /^## /gm;
  nextHeadingPattern.lastIndex = start + heading.length + 1;
  const nextHeading = nextHeadingPattern.exec(markdown);
  const end = nextHeading === null ? markdown.length : nextHeading.index;
  const separator = end < markdown.length && !normalizedReplacement.endsWith("\n\n") ? "\n" : "";
  return `${markdown.slice(0, start)}${normalizedReplacement}${separator}${markdown.slice(end)}`;
}
