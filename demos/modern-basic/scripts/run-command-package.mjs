import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const demoDirectory = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(demoDirectory, "../..");
const cliPath = resolve(repositoryRoot, "packages/cli/dist/index.js");
const [packageInput, ...commandArgs] = process.argv.slice(2);

if (packageInput === undefined || commandArgs.length === 0) {
  throw new Error("Usage: run-command-package.mjs <package-directory> <command...>");
}

const packageDirectory = resolve(demoDirectory, packageInput);
const extensionsDirectory = await mkdtemp(join(tmpdir(), "openruntime-demo-extensions-"));
const environment = {
  ...process.env,
  OPENRUNTIME_EXTENSIONS_DIR: extensionsDirectory,
  npm_config_cache: join(extensionsDirectory, ".npm-cache")
};

try {
  runCli(["extensions", "add", packageDirectory, "--extensions-dir", extensionsDirectory], environment, "pipe");
  const result = runCli(commandArgs, environment, "inherit");
  process.exitCode = result.status ?? 1;
} finally {
  await rm(extensionsDirectory, { recursive: true, force: true });
}

function runCli(args, env, stdio) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: demoDirectory,
    env,
    stdio,
    encoding: stdio === "pipe" ? "utf8" : undefined
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0 && stdio === "pipe") {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `OpenRuntime exited with ${result.status}.`);
  }
  return result;
}
