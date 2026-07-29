#!/usr/bin/env node
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import process from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let testFile;
try {
  testFile = await resolveTestFile();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const child = spawn(process.execPath, [
  "--test",
  "--test-concurrency=1",
  testFile,
  ...process.argv.slice(2)
], {
  stdio: "inherit",
  env: process.env
});

child.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.once("close", (exitCode, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = exitCode ?? 1;
});

async function resolveTestFile() {
  const candidates = [
    resolve(packageRoot, "../../tests/e2e/e2e.test.mjs"),
    resolve(packageRoot, "dist/e2e/e2e.test.mjs")
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  throw new Error(`Could not find Divebell e2e tests under ${candidates.join(" or ")}.`);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}
