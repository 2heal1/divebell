#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testFile = resolve(packageRoot, "test/extensions.e2e.test.mjs");
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
