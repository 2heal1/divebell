import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliEntry = resolve(packageDirectory, "dist/bin.js");
const temporaryDirectory = await mkdtemp(join(tmpdir(), "divebell-browser-commands-"));
const projectDirectory = join(temporaryDirectory, "project");
const profileDirectory = join(temporaryDirectory, "browser-profile");
const operationLogDirectory = join(temporaryDirectory, "operations");
const server = createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  if (request.url?.startsWith("/second")) {
    response.end(`<!doctype html>
      <html><head><title>Second Page</title></head>
      <body><main id="page">Second</main></body></html>`);
    return;
  }
  response.end(`<!doctype html>
    <html>
      <head><title>First Page</title></head>
      <body>
        <label><input id="agree" type="checkbox"> Agree</label>
        <button id="hover" onmouseenter="document.querySelector('#result').textContent='Hovered'">Hover me</button>
        <output id="result">Waiting</output>
      </body>
    </html>`);
});

try {
  await Promise.all([
    mkdir(projectDirectory, { recursive: true }),
    mkdir(profileDirectory, { recursive: true }),
    mkdir(operationLogDirectory, { recursive: true })
  ]);
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const env = {
    ...process.env,
    DIVEBELL_BROWSER_PROFILE_DIR: profileDirectory,
    DIVEBELL_DISABLE_EXTENSIONS: "1",
    DIVEBELL_OPERATION_LOG_DIR: operationLogDirectory
  };

  await runCli(["open", `${origin}/first`, "--no-bridge"], env);
  await runCli(["check-element", "#agree"], env);
  assert.equal((await runCli(["is", "checked", "#agree"], env)).trim(), "true");

  await runCli(["hover", "#hover"], env);
  await runCli(["wait", "--text", "Hovered"], env);
  assert.equal((await runCli(["get", "text", "#result"], env)).trim(), "Hovered");

  await runCli(["goto", `${origin}/second`], env);
  await runCli(["wait", "--url", "**/second?*"], env);
  assert.equal((await runCli(["get", "text", "#page"], env)).trim(), "Second");

  await runCli(["back"], env);
  await runCli(["wait", "--url", "**/first?*"], env);
  assert.equal((await runCli(["get", "title"], env)).trim(), "First Page");
  await runCli(["reload"], env);
  await runCli(["wait", "--load", "domcontentloaded"], env);

  process.stdout.write(`${JSON.stringify({
    status: "ok",
    commands: ["check-element", "is", "hover", "wait", "get", "goto", "back", "reload"]
  }, null, 2)}\n`);
} finally {
  await runCli(["stop"], {
    ...process.env,
    DIVEBELL_BROWSER_PROFILE_DIR: profileDirectory,
    DIVEBELL_DISABLE_EXTENSIONS: "1",
    DIVEBELL_OPERATION_LOG_DIR: operationLogDirectory
  }).catch(() => undefined);
  await new Promise((resolvePromise) => server.close(() => resolvePromise()));
  await rm(temporaryDirectory, { recursive: true, force: true });
}

async function runCli(args, env) {
  const result = await execFileAsync(process.execPath, [cliEntry, ...args], {
    cwd: projectDirectory,
    env,
    maxBuffer: 10 * 1024 * 1024
  });
  return result.stdout;
}
