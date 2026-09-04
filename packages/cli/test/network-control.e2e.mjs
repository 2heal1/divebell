import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliEntry = resolve(packageDirectory, "dist/bin.js");
const temporaryDirectory = await mkdtemp(join(tmpdir(), "divebell-network-control-e2e-"));
const socketDirectory = await mkdtemp("/tmp/divebell-network-control-sockets-");
const projectDirectory = join(temporaryDirectory, "project");
const profileDirectory = join(temporaryDirectory, "browser-profile");
const divebellHomeDirectory = join(temporaryDirectory, "divebell-home");
const rulesPath = join(temporaryDirectory, "request-rules.json");

const replacementPaths = [];
const replacement = createServer((request, response) => {
  replacementPaths.push(request.url);
  if (request.url?.startsWith("/assets/app.js")) {
    response.writeHead(200, { "content-type": "application/javascript", "access-control-allow-origin": "*" }).end("globalThis.__DIVEBELL_REWRITE__ = 'replacement';");
    return;
  }
  if (request.url?.startsWith("/fixture")) {
    response.writeHead(200, { "content-type": "application/json", "content-encoding": "identity" }).end('{"source":"fulfill"}');
    return;
  }
  response.writeHead(404).end();
});
let sourceOrigin = "";
const source = createServer((request, response) => {
  if (request.url?.startsWith("/assets/app.js")) {
    response.writeHead(200, { "content-type": "application/javascript" }).end("globalThis.__DIVEBELL_REWRITE__ = 'source';");
    return;
  }
  if (request.url?.startsWith("/api/catalog")) {
    response.writeHead(200, { "content-type": "application/json" }).end('{"source":"source"}');
    return;
  }
  response.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html>
    <title>Proxy and request rules</title>
    <script src="${sourceOrigin}/assets/app.js"></script>
    <script>fetch('${sourceOrigin}/api/catalog').then((response) => response.json()).then((value) => { globalThis.__DIVEBELL_FULFILL__ = value.source; });</script>`);
});

try {
  await Promise.all([
    mkdir(projectDirectory, { recursive: true }),
    mkdir(profileDirectory, { recursive: true }),
    mkdir(divebellHomeDirectory, { recursive: true })
  ]);
  await listen(replacement, "localhost");
  const replacementAddress = replacement.address();
  assert.notEqual(replacementAddress, null);
  assert.equal(typeof replacementAddress, "object");
  const replacementOrigin = `http://localhost:${replacementAddress.port}`;
  await listen(source);
  const sourceAddress = source.address();
  assert.notEqual(sourceAddress, null);
  assert.equal(typeof sourceAddress, "object");
  sourceOrigin = `http://127.0.0.1:${sourceAddress.port}`;
  await writeFile(rulesPath, `${JSON.stringify({
    schemaVersion: 1,
    rules: [
      {
        id: "rewrite-script",
        match: { urlPrefix: `${sourceOrigin}/assets/` },
        action: { type: "rewrite", targetPrefix: `${replacementOrigin}/assets/` }
      },
      {
        id: "fulfill-api",
        match: { url: `${sourceOrigin}/api/catalog` },
        action: { type: "fulfill", url: `${replacementOrigin}/fixture`, timeoutMs: 5000 }
      }
    ]
  }, null, 2)}\n`, "utf8");
  const env = {
    ...process.env,
    AGENT_BROWSER_SOCKET_DIR: socketDirectory,
    DIVEBELL_BROWSER_PROFILE_DIR: profileDirectory,
    DIVEBELL_HOME: divebellHomeDirectory,
    DIVEBELL_DISABLE_EXTENSIONS: "1"
  };
  const opened = await runCli([
    "open", `${sourceOrigin}/`, "--request-rules", rulesPath,
    "--no-default-profile", "--no-bridge", "--timeout", "10000"
  ], env);
  assert.equal(typeof opened.requestControl?.pid, "number");
  const [configName] = await readdir(join(divebellHomeDirectory, "network-controls"));
  const controlConfig = JSON.parse(await readFile(join(divebellHomeDirectory, "network-controls", configName), "utf8"));
  const controlStatus = await fetch(`${opened.requestControl.controlUrl}/status?token=${controlConfig.token}`).then(async (response) => await response.json());
  assert.ok(controlStatus.enabledTargets > 0, JSON.stringify(controlStatus));
  const afterRewriteStatus = await fetch(`${opened.requestControl.controlUrl}/status?token=${controlConfig.token}`).then(async (response) => await response.json());
  assert.ok(afterRewriteStatus.matchedRequests >= 2, JSON.stringify(afterRewriteStatus));
  assert.ok(replacementPaths.includes("/assets/app.js"), JSON.stringify({ afterRewriteStatus, replacementPaths }));
  await runCli(["wait-eval", "globalThis.__DIVEBELL_FULFILL__ === 'fulfill'", "--timeout", "5000"], env);
  await runCli(["stop"], env);
  process.stdout.write(`${JSON.stringify({ status: "ok", rewrite: true, fulfill: true }, null, 2)}\n`);
} finally {
  await runCli(["stop"], {
    ...process.env,
    AGENT_BROWSER_SOCKET_DIR: socketDirectory,
    DIVEBELL_BROWSER_PROFILE_DIR: profileDirectory,
    DIVEBELL_HOME: divebellHomeDirectory,
    DIVEBELL_DISABLE_EXTENSIONS: "1"
  }).catch(() => undefined);
  await Promise.all([close(source), close(replacement)]);
  await Promise.all([
    rm(temporaryDirectory, { recursive: true, force: true }),
    rm(socketDirectory, { recursive: true, force: true })
  ]);
}

async function listen(server, host = "127.0.0.1") {
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, host, resolvePromise);
  });
}

async function close(server) {
  await new Promise((resolvePromise) => server.close(() => resolvePromise()));
}

async function runCli(args, env) {
  const result = await execFileAsync(process.execPath, [cliEntry, ...args], {
    cwd: projectDirectory,
    env,
    maxBuffer: 10 * 1024 * 1024
  });
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.status, "ok", result.stderr);
  return parsed.data;
}
