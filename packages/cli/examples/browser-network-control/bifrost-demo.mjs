import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cliEntry = join(packageDirectory, "dist", "bin.js");
const scenario = process.argv[2];
let activeCleanup = async () => undefined;
let handlingSignal = false;

for (const [signal, exitCode] of [["SIGINT", 130], ["SIGTERM", 143]]) {
  process.once(signal, () => {
    if (handlingSignal) return;
    handlingSignal = true;
    process.stderr.write(`\nReceived ${signal}; cleaning up Divebell daemons and Bifrost ports...\n`);
    void activeCleanup().finally(() => process.exit(exitCode));
  });
}

try {
  await assertBifrostRunning();
  if (scenario === "multi-daemon") await runMultiDaemonDemo();
  else if (scenario === "pac") await runPacDemo();
  else throw new Error("Choose one scenario: multi-daemon or pac.");
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
}

async function runMultiDaemonDemo() {
  const directory = await mkdtemp(join(tmpdir(), "divebell-bifrost-daemons-demo-"));
  const socketDirectory = await mkdtemp("/tmp/divebell-bifrost-daemon-sockets-");
  const projects = [join(directory, "daemon-a"), join(directory, "daemon-b")];
  const profiles = [join(directory, "profile-a"), join(directory, "profile-b")];
  const sharedHome = join(directory, "divebell-home");
  const ports = [];
  const environments = [];
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await Promise.allSettled(environments.map(({ cwd, env }) => runDivebell(cwd, env, ["stop"])));
    await Promise.allSettled(ports.map((port) => destroyBifrostPort(port)));
    await Promise.allSettled([
      rm(directory, { recursive: true, force: true }),
      rm(socketDirectory, { recursive: true, force: true })
    ]);
  };
  activeCleanup = cleanup;

  try {
    await Promise.all([
      mkdir(projects[0], { recursive: true }),
      mkdir(projects[1], { recursive: true }),
      mkdir(profiles[0], { recursive: true }),
      mkdir(profiles[1], { recursive: true }),
      mkdir(sharedHome, { recursive: true })
    ]);
    ports.push(
      await bindBifrostPort("divebell-demo-a", "divebell-demo.test status://200 resBody://(from-bifrost-a)"),
      await bindBifrostPort("divebell-demo-b", "divebell-demo.test status://200 resBody://(from-bifrost-b)")
    );
    environments.push(
      {
        cwd: projects[0],
        env: createDivebellEnv({
          DIVEBELL_HOME: sharedHome,
          AGENT_BROWSER_SOCKET_DIR: socketDirectory,
          AGENT_BROWSER_NAMESPACE: "bifrost-demo-a",
          DIVEBELL_BROWSER_PROFILE_DIR: profiles[0],
          DIVEBELL_DISABLE_EXTENSIONS: "1"
        })
      },
      {
        cwd: projects[1],
        env: createDivebellEnv({
          DIVEBELL_HOME: sharedHome,
          AGENT_BROWSER_SOCKET_DIR: socketDirectory,
          AGENT_BROWSER_NAMESPACE: "bifrost-demo-b",
          DIVEBELL_BROWSER_PROFILE_DIR: profiles[1],
          DIVEBELL_DISABLE_EXTENSIONS: "1"
        })
      }
    );

    const target = "http://divebell-demo.test/";
    await Promise.all([
      runDivebell(projects[0], environments[0].env, openArgs(target, "bifrost-demo-a", ["--proxy", `http://127.0.0.1:${ports[0]}`])),
      runDivebell(projects[1], environments[1].env, openArgs(target, "bifrost-demo-b", ["--proxy", `http://127.0.0.1:${ports[1]}`]))
    ]);
    await Promise.all([
      runDivebell(projects[0], environments[0].env, ["wait-eval", "document.body.innerText.trim() === 'from-bifrost-a'", "--timeout", "10000"]),
      runDivebell(projects[1], environments[1].env, ["wait-eval", "document.body.innerText.trim() === 'from-bifrost-b'", "--timeout", "10000"])
    ]);
    const [cdpUrlA, cdpUrlB] = await Promise.all([
      runDivebell(projects[0], environments[0].env, ["get", "cdp-url"]),
      runDivebell(projects[1], environments[1].env, ["get", "cdp-url"])
    ]);
    assert.equal(typeof cdpUrlA, "string");
    assert.equal(typeof cdpUrlB, "string");
    assert.notEqual(cdpUrlA, cdpUrlB);

    process.stdout.write(`${JSON.stringify({
      status: "ok",
      scenario: "multi-daemon",
      sourceUrl: target,
      daemonA: { proxyPort: ports[0], body: "from-bifrost-a", cdpUrl: cdpUrlA },
      daemonB: { proxyPort: ports[1], body: "from-bifrost-b", cdpUrl: cdpUrlB }
    }, null, 2)}\n`);
    await pauseForInspection();
  } finally {
    await cleanup();
    activeCleanup = async () => undefined;
  }
}

async function runPacDemo() {
  const directory = await mkdtemp(join(tmpdir(), "divebell-bifrost-pac-demo-"));
  const socketDirectory = await mkdtemp("/tmp/divebell-bifrost-pac-sockets-");
  const project = join(directory, "project");
  const profile = join(directory, "profile");
  const ports = [];
  const source = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html>
      <title>Divebell + Bifrost PAC demo</title>
      <pre id="result">loading</pre>
      <script>
        Promise.all([
          fetch('http://pac-a.divebell.test/').then((response) => response.text()),
          fetch('http://pac-b.divebell.test/').then((response) => response.text())
        ]).then((values) => {
          globalThis.__BIFROST_PAC_RESULT__ = values.join(':');
          document.querySelector('#result').textContent = globalThis.__BIFROST_PAC_RESULT__;
        });
      </script>`);
  });
  let env;
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await Promise.allSettled([
      env === undefined ? Promise.resolve() : runDivebell(project, env, ["stop"]),
      closeServer(source),
      ...ports.map((port) => destroyBifrostPort(port))
    ]);
    await Promise.allSettled([
      rm(directory, { recursive: true, force: true }),
      rm(socketDirectory, { recursive: true, force: true })
    ]);
  };
  activeCleanup = cleanup;

  try {
    await Promise.all([mkdir(project, { recursive: true }), mkdir(profile, { recursive: true }), listen(source)]);
    ports.push(
      await bindBifrostPort("divebell-pac-a", "pac-a.divebell.test status://200 resBody://(from-pac-a) resCors://*"),
      await bindBifrostPort("divebell-pac-b", "pac-b.divebell.test status://200 resBody://(from-pac-b) resCors://*")
    );
    const extensionPath = join(directory, "bifrost-demo-provider.mjs");
    await writeFile(extensionPath, `export default {
  schemaVersion: 1,
  name: "bifrost-demo-provider",
  browserProxyProvider: {
    resolve: async () => ({
      schemaVersion: 1,
      endpoints: [
        { id: "bifrost-a", url: "http://127.0.0.1:${ports[0]}" },
        { id: "bifrost-b", url: "http://127.0.0.1:${ports[1]}" }
      ],
      rules: [
        { endpoint: "bifrost-a", match: { hosts: ["pac-a.divebell.test"] } },
        { endpoint: "bifrost-b", match: { hosts: ["pac-b.divebell.test"] } }
      ],
      fallback: "DIRECT"
    })
  }
};\n`);
    env = createDivebellEnv({
      DIVEBELL_HOME: join(directory, "divebell-home"),
      AGENT_BROWSER_SOCKET_DIR: socketDirectory,
      AGENT_BROWSER_NAMESPACE: "bifrost-pac-demo",
      DIVEBELL_BROWSER_PROFILE_DIR: profile,
      DIVEBELL_EXTENSIONS_DIR: extensionPath,
      DIVEBELL_DISABLE_EXTENSIONS: "0"
    });
    const sourceUrl = `http://127.0.0.1:${serverPort(source)}/`;
    await runDivebell(project, env, openArgs(sourceUrl, "bifrost-pac-demo", ["--proxy-provider", "bifrost-demo-provider"]));
    await runDivebell(project, env, [
      "wait-eval", "globalThis.__BIFROST_PAC_RESULT__ === 'from-pac-a:from-pac-b'", "--timeout", "10000"
    ]);

    process.stdout.write(`${JSON.stringify({
      status: "ok",
      scenario: "pac",
      sourceUrl,
      fallback: "DIRECT",
      routes: [
        { host: "pac-a.divebell.test", proxyPort: ports[0], body: "from-pac-a" },
        { host: "pac-b.divebell.test", proxyPort: ports[1], body: "from-pac-b" }
      ],
      pageResult: "from-pac-a:from-pac-b"
    }, null, 2)}\n`);
    await pauseForInspection();
  } finally {
    await cleanup();
    activeCleanup = async () => undefined;
  }
}

async function assertBifrostRunning() {
  const { stdout } = await execFileAsync("bifrost", ["status", "--format", "json"]);
  const status = JSON.parse(stdout);
  if (status.running !== true) {
    throw new Error("Bifrost is not running. Start it without system proxy: bifrost start -p 9900 --daemon --no-system-proxy --no-intercept");
  }
  process.stdout.write(`Using Bifrost ${status.version} at ${status.listener.host}:${status.listener.port}; system proxy remains unchanged.\n`);
}

async function bindBifrostPort(name, ruleText) {
  const { stdout } = await execFileAsync("bifrost", [
    "port", "bind", "--port", "0", "--host", "127.0.0.1", "--name", name, "--rule-text", ruleText
  ]);
  const match = /Temporary port:\s+[^:]+:(\d+)/u.exec(stdout);
  if (match === null) throw new Error(`Could not read the temporary port from Bifrost output:\n${stdout}`);
  const port = Number.parseInt(match[1], 10);
  process.stdout.write(`Bound Bifrost ${name} on 127.0.0.1:${port}.\n`);
  return port;
}

async function destroyBifrostPort(port) {
  try {
    await execFileAsync("bifrost", ["port", "destroy", String(port)]);
  } catch (error) {
    process.stderr.write(`Could not destroy Bifrost port ${port}: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

function createDivebellEnv(overrides) {
  const env = { ...process.env };
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy"]) delete env[key];
  return { ...env, ...overrides };
}

function openArgs(url, namespace, extra) {
  return [
    "open", url, ...extra, "--namespace", namespace, "--no-default-profile", "--no-bridge", "--timeout", "10000",
    ...(process.env.DIVEBELL_DEMO_UI === "1" ? ["--ui"] : [])
  ];
}

async function runDivebell(cwd, env, args) {
  const result = await execFileAsync(process.execPath, [cliEntry, ...args], {
    cwd,
    env,
    maxBuffer: 10 * 1024 * 1024
  });
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.status, "ok", result.stderr);
  return parsed.data;
}

async function pauseForInspection() {
  const raw = process.env.DIVEBELL_DEMO_PAUSE_MS;
  if (raw === undefined) return;
  const milliseconds = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0 || milliseconds > 600_000) {
    throw new Error("DIVEBELL_DEMO_PAUSE_MS must be an integer from 0 to 600000.");
  }
  if (milliseconds === 0) return;
  process.stdout.write(`Keeping the demo alive for ${milliseconds}ms for inspection...\n`);
  await new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function listen(server) {
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
}

async function closeServer(server) {
  if (!server.listening) return;
  await new Promise((resolvePromise) => server.close(() => resolvePromise()));
}

function serverPort(server) {
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  return address.port;
}
