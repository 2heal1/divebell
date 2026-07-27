#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const userArgs = process.argv.slice(2);

for (const candidate of candidates()) {
  if (await canRun(candidate)) run(candidate, userArgs);
}

for (const launcher of [
  {
    command: "pnpm",
    args: ["--package=@openruntime/cli@0.1.7", "dlx", "openruntime"]
  },
  {
    command: "corepack",
    args: ["pnpm", "--package=@openruntime/cli@0.1.7", "dlx", "openruntime"]
  }
]) {
  if (commandExists(launcher.command)) {
    run(
      { command: launcher.command, prefix: launcher.args },
      userArgs,
      {
        ...process.env,
        PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"
      }
    );
  }
}

process.stderr.write([
  "OpenRuntime CLI was not found.",
  "Install pnpm or set OPENRUNTIME_CLI to an existing OpenRuntime command, then retry."
].join("\n") + "\n");
process.exit(127);

function candidates() {
  const values = [];
  const explicit = process.env.OPENRUNTIME_CLI;
  if (explicit !== undefined && explicit.length > 0 && !isSelfReference(explicit)) {
    values.push(invocation(explicit));
  }

  let current = resolve(process.cwd());
  const binName = process.platform === "win32" ? "openruntime.cmd" : "openruntime";
  while (true) {
    values.push(invocation(join(current, "node_modules", ".bin", binName)));
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  values.push(invocation("openruntime"), invocation("opr"));
  return values;
}

function invocation(command) {
  return command.endsWith(".js") || command.endsWith(".mjs")
    ? { command: process.execPath, prefix: [command] }
    : { command, prefix: [] };
}

function isSelfReference(command) {
  if (
    !command.includes("/")
    && !command.includes("\\")
    && !command.endsWith(".js")
    && !command.endsWith(".mjs")
  ) {
    return false;
  }
  try {
    return resolve(command) === scriptPath;
  } catch {
    return false;
  }
}

async function canRun(candidate) {
  if (candidate.prefix.length > 0) {
    try {
      await access(candidate.prefix[0], constants.R_OK);
    } catch {
      return false;
    }
  }
  const result = spawnSync(candidate.command, [...candidate.prefix, "--help"], {
    stdio: "ignore",
    timeout: 5_000
  });
  return result.status === 0;
}

function commandExists(command) {
  const result = spawnSync(command, ["--version"], {
    stdio: "ignore",
    timeout: 5_000
  });
  return result.status === 0;
}

function run(candidate, args, environment = process.env) {
  const result = spawnSync(candidate.command, [...candidate.prefix, ...args], {
    env: environment,
    stdio: "inherit",
    timeout: 180_000
  });
  if (result.error !== undefined) {
    process.stderr.write(`${result.error.message}\n`);
    process.exit(result.error.code === "ETIMEDOUT" ? 124 : 127);
  }
  process.exit(result.status ?? 1);
}
