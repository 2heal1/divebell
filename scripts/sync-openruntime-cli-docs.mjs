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
const { createCliReferenceMarkdown } = await import(helpModuleUrl);
const cliReferenceContent = createCliReferenceMarkdown();

const cliReferencePath = join(repoRoot, "docs/cli-reference.md");

let hasMismatch = false;
if (checkOnly) {
  if (await readExisting(cliReferencePath) !== cliReferenceContent) {
    hasMismatch = true;
    console.error(`${relative(repoRoot, cliReferencePath)} is out of date. Run "pnpm run docs:cli".`);
  }
} else {
  await mkdir(dirname(cliReferencePath), { recursive: true });
  await writeFile(cliReferencePath, cliReferenceContent, "utf8");
  console.log(`updated ${relative(repoRoot, cliReferencePath)}`);
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
