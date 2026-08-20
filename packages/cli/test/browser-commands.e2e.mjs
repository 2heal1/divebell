import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliEntry = resolve(packageDirectory, "dist/bin.js");
const temporaryDirectory = await mkdtemp(join(tmpdir(), "divebell-browser-commands-"));
const socketDirectory = await mkdtemp("/tmp/divebell-browser-sockets-");
const projectDirectory = join(temporaryDirectory, "project");
const profileDirectory = join(temporaryDirectory, "browser-profile");
const operationLogDirectory = join(temporaryDirectory, "operations");
const divebellHomeDirectory = join(temporaryDirectory, "divebell-home");
const firstUserInitScript = join(temporaryDirectory, "first-user-init.js");
const secondUserInitScript = join(temporaryDirectory, "second-user-init.js");
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
    mkdir(operationLogDirectory, { recursive: true }),
    mkdir(divebellHomeDirectory, { recursive: true }),
    writeFile(firstUserInitScript, "globalThis.__DIVEBELL_E2E_USER_INIT_ONE__ = true;\n"),
    writeFile(secondUserInitScript, "globalThis.__DIVEBELL_E2E_USER_INIT_TWO__ = true;\n")
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
    AGENT_BROWSER_SOCKET_DIR: socketDirectory,
    DIVEBELL_BROWSER_PROFILE_DIR: profileDirectory,
    DIVEBELL_HOME: divebellHomeDirectory,
    DIVEBELL_DISABLE_EXTENSIONS: "1",
    DIVEBELL_OPERATION_LOG_DIR: operationLogDirectory
  };

  const firstOpen = await runCli([
    "open",
    `${origin}/first`,
    "--timeout",
    "10000",
    "--no-default-profile",
    "--init-script",
    firstUserInitScript,
    "--init-script",
    secondUserInitScript
  ], env);
  assert.equal(await runCli([
    "eval",
    "Boolean(globalThis.__DIVEBELL_E2E_USER_INIT_ONE__ && globalThis.__DIVEBELL_E2E_USER_INIT_TWO__)"
  ], env), "true");
  await runCli(["check-element", "#agree"], env);
  assert.equal(await runCli(["is", "checked", "#agree"], env), "true");

  await runCli(["hover", "#hover"], env);
  await runCli(["wait", "--text", "Hovered"], env);
  assert.equal(await runCli(["get", "text", "#result"], env), "Hovered");

  const secondOpen = await runCli(["open", `${origin}/second`, "--timeout", "10000", "--no-default-profile"], env);
  assert.equal(secondOpen.bridgeUrl, firstOpen.bridgeUrl);
  assert.equal(secondOpen.injectedScriptPath, firstOpen.injectedScriptPath);
  await runCli(["wait", "--url", "**/second?*"], env);
  assert.equal(await runCli(["get", "text", "#page"], env), "Second");
  assert.equal(await runCli([
    "eval",
    "Boolean(globalThis.__DIVEBELL_E2E_USER_INIT_ONE__ && globalThis.__DIVEBELL_E2E_USER_INIT_TWO__)"
  ], env), "true");

  await runCli(["back"], env);
  await runCli(["wait", "--url", "**/first?*"], env);
  assert.equal(await runCli(["get", "title"], env), "First Page");
  await runCli(["reload"], env);
  await runCli(["wait", "--load", "domcontentloaded"], env);
  await runCli(["goto", `${origin}/second`], env);
  await runCli(["wait", "--url", "**/second?*"], env);

  process.stdout.write(`${JSON.stringify({
    status: "ok",
    commands: ["open", "check-element", "is", "hover", "wait", "get", "goto", "back", "reload"]
  }, null, 2)}\n`);
} finally {
  await runCli(["stop"], {
    ...process.env,
    AGENT_BROWSER_SOCKET_DIR: socketDirectory,
    DIVEBELL_BROWSER_PROFILE_DIR: profileDirectory,
    DIVEBELL_HOME: divebellHomeDirectory,
    DIVEBELL_DISABLE_EXTENSIONS: "1",
    DIVEBELL_OPERATION_LOG_DIR: operationLogDirectory
  }).catch(() => undefined);
  await new Promise((resolvePromise) => server.close(() => resolvePromise()));
  await Promise.all([
    rm(temporaryDirectory, { recursive: true, force: true }),
    rm(socketDirectory, { recursive: true, force: true })
  ]);
}

async function runCli(args, env) {
  const result = await execFileAsync(process.execPath, [cliEntry, ...args], {
    cwd: projectDirectory,
    env,
    maxBuffer: 10 * 1024 * 1024
  });
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.status, "ok");
  return parsed.data;
}
