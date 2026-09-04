import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliEntry = resolve(packageDirectory, "dist/bin.js");

const scenarios = [
  ["multi-daemon", "multi-daemon isolation", testIsolatedNetworkDaemons],
  ["pac", "PAC URL", testPacUrl],
  ["fixed-proxy", "fixed HTTP proxy", testFixedHttpProxy],
  ["https", "HTTPS rewrite and HTTPS-to-HTTP fulfill", testHttpsRewriteAndHttpFulfill]
];
const selectedScenario = process.argv[2];
const selected = selectedScenario === undefined
  ? scenarios
  : scenarios.filter(([id]) => id === selectedScenario);
if (selected.length === 0) {
  throw new Error(`Unknown advanced network-control E2E scenario: ${selectedScenario}`);
}
for (const [, name, run] of selected) await runE2e(name, run);

process.stdout.write(`${JSON.stringify({
  status: "ok",
  multiDaemon: selected.some(([id]) => id === "multi-daemon"),
  pacUrl: selected.some(([id]) => id === "pac"),
  fixedProxy: selected.some(([id]) => id === "fixed-proxy"),
  httpsRewrite: selected.some(([id]) => id === "https"),
  httpsToHttpFulfill: selected.some(([id]) => id === "https")
}, null, 2)}\n`);

async function runE2e(name, run) {
  await run();
  process.stdout.write(`✓ ${name}\n`);
}

async function testIsolatedNetworkDaemons() {
  const directory = await mkdtemp(join(tmpdir(), "divebell-network-daemons-e2e-"));
  const reports = [];
  const source = createServer((request, response) => {
    if (request.url?.startsWith("/report")) {
      reports.push(new URL(request.url, "http://source.test").searchParams.get("marker"));
      response.writeHead(204, { "access-control-allow-origin": "*" }).end();
      return;
    }
    if (request.url?.startsWith("/assets/app.js")) {
      response.writeHead(200, { "content-type": "application/javascript" }).end("globalThis.__DAEMON_RESOURCE__ = 'source';");
      return;
    }
    const assetQuery = new URL(request.url ?? "/", "http://source.test").searchParams.get("run") ?? "initial";
    response.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><script src="/assets/app.js?run=${encodeURIComponent(assetQuery)}"></script>`);
  });
  const replacementBRequests = [];
  let sourceOrigin = "";
  const replacementB = markerServer("B", replacementBRequests, () => sourceOrigin);
  const replacementCRequests = [];
  const replacementC = markerServer("C", replacementCRequests, () => sourceOrigin);
  const projects = [join(directory, "project-a"), join(directory, "project-b")];
  const rulesPaths = [join(directory, "rules-a.json"), join(directory, "rules-b.json")];
  const sharedHome = join(directory, "divebell-home");
  const socketDirectory = await mkdtemp("/tmp/divebell-daemon-sockets-");
  const profiles = [join(directory, "profile-a"), join(directory, "profile-b")];
  let envA;
  let envB;

  try {
    await Promise.all([
      mkdir(projects[0], { recursive: true }),
      mkdir(projects[1], { recursive: true }),
      mkdir(sharedHome, { recursive: true }),
      mkdir(profiles[0], { recursive: true }),
      mkdir(profiles[1], { recursive: true })
    ]);
    await Promise.all([listen(source), listen(replacementB, "localhost"), listen(replacementC, "localhost")]);
    sourceOrigin = originOf(source, "127.0.0.1");
    const replacementBOrigin = originOf(replacementB, "localhost");
    const replacementCOrigin = originOf(replacementC, "localhost");
    await Promise.all([
      writeRules(rulesPaths[0], sourceOrigin, replacementBOrigin),
      writeRules(rulesPaths[1], sourceOrigin, replacementCOrigin)
    ]);

    // A shared home intentionally exercises UUID-based control-process files;
    // separate cwd values isolate Divebell's cwd-keyed latest-page records.
    envA = createE2eEnv({
      DIVEBELL_HOME: sharedHome,
      AGENT_BROWSER_SOCKET_DIR: socketDirectory,
      AGENT_BROWSER_NAMESPACE: "network-e2e-a",
      DIVEBELL_BROWSER_PROFILE_DIR: profiles[0],
      DIVEBELL_DISABLE_EXTENSIONS: "1"
    });
    envB = createE2eEnv({
      DIVEBELL_HOME: sharedHome,
      AGENT_BROWSER_SOCKET_DIR: socketDirectory,
      AGENT_BROWSER_NAMESPACE: "network-e2e-b",
      DIVEBELL_BROWSER_PROFILE_DIR: profiles[1],
      DIVEBELL_DISABLE_EXTENSIONS: "1"
    });
    const [openedA, openedB] = await Promise.all([
      runCli(projects[0], envA, [
        "open", `${sourceOrigin}/?run=initial`, "--request-rules", rulesPaths[0], "--namespace", "network-e2e-a",
        "--no-default-profile", "--no-bridge", "--timeout", "10000"
      ]),
      runCli(projects[1], envB, [
        "open", `${sourceOrigin}/?run=initial`, "--request-rules", rulesPaths[1], "--namespace", "network-e2e-b",
        "--no-default-profile", "--no-bridge", "--timeout", "10000"
      ])
    ]);
    assert.notEqual(openedA.requestControl?.pid, openedB.requestControl?.pid);
    assert.notEqual(openedA.requestControl?.controlUrl, openedB.requestControl?.controlUrl);
    await Promise.all([
      waitFor(projects[0], envA, "globalThis.__DAEMON_RESOURCE__ === 'B'"),
      waitFor(projects[1], envB, "globalThis.__DAEMON_RESOURCE__ === 'C'")
    ]);
    await waitForMarkers(reports, ["B", "C"]);
    assert.equal(replacementBRequests.filter((path) => path === "/assets/app.js?run=initial").length, 1, JSON.stringify(replacementBRequests));
    assert.equal(replacementCRequests.filter((path) => path === "/assets/app.js?run=initial").length, 1, JSON.stringify(replacementCRequests));
    assert.equal(reports.filter((marker) => marker === "B").length, 1, JSON.stringify(reports));
    assert.equal(reports.filter((marker) => marker === "C").length, 1, JSON.stringify(reports));

    await runCli(projects[0], envA, ["stop"]);
    await runCli(projects[1], envB, ["goto", `${sourceOrigin}/?run=after-stop`, "--timeout", "10000"]);
    await waitForMarkerCount(reports, "C", 2);
    assert.equal(reports.filter((marker) => marker === "B").length, 1, JSON.stringify(reports));
    assert.ok(replacementCRequests.some((path) => path === "/assets/app.js?run=after-stop"), JSON.stringify(replacementCRequests));
  } finally {
    await Promise.allSettled([
      envA === undefined ? Promise.resolve() : runCli(projects[0], envA, ["stop"]),
      envB === undefined ? Promise.resolve() : runCli(projects[1], envB, ["stop"])
    ]);
    await Promise.all([close(source), close(replacementB), close(replacementC)]);
    await Promise.all([
      rm(directory, { recursive: true, force: true }),
      rm(socketDirectory, { recursive: true, force: true })
    ]);
  }
}

async function testPacUrl() {
  const directory = await mkdtemp(join(tmpdir(), "divebell-pac-proxy-e2e-"));
  const project = join(directory, "project");
  const proxyRequests = [];
  const pacRequests = [];
  const sourceRequests = [];
  const proxy = createServer((request, response) => {
    proxyRequests.push(request.url ?? "");
    response.writeHead(200, { "access-control-allow-origin": "*", "content-type": "text/plain" }).end("through-pac-proxy");
  });
  const pac = createServer((request, response) => {
    pacRequests.push(request.url ?? "");
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "application/x-ns-proxy-autoconfig; charset=utf-8"
    }).end(`function FindProxyForURL(url, host) {
      return host === 'proxy.test' ? 'PROXY 127.0.0.1:${addressPort(proxy)}' : 'DIRECT';
    }`);
  });
  const socketDirectory = await mkdtemp("/tmp/divebell-pac-sockets-");
  let sourceOrigin = "";
  const source = createServer((request, response) => {
    sourceRequests.push(request.url ?? "");
    if (request.url?.startsWith("/direct")) {
      response.writeHead(200, { "content-type": "text/plain" }).end("direct");
      return;
    }
    response.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><script>
      Promise.all([
        fetch('http://proxy.test:${addressPort(source)}/via-proxy').then((response) => response.text()),
        fetch('${sourceOrigin}/direct').then((response) => response.text())
      ]).then(([proxy, direct]) => { globalThis.__PAC_RESULT__ = proxy + ':' + direct; });
    </script>`);
  });
  let env;
  try {
    await Promise.all([mkdir(project, { recursive: true }), listen(proxy), listen(pac), listen(source, "localhost")]);
    sourceOrigin = originOf(source, "localhost");
    env = createE2eEnv({
      DIVEBELL_HOME: join(directory, "divebell-home"),
      AGENT_BROWSER_SOCKET_DIR: socketDirectory,
      DIVEBELL_BROWSER_PROFILE_DIR: join(directory, "profile"),
      DIVEBELL_DISABLE_EXTENSIONS: "1"
    });
    const pacUrl = `${originOf(pac, "127.0.0.1")}/config?token=e2e`;
    await runCli(project, env, [
      "open", `${sourceOrigin}/`, "--proxy-pac-url", pacUrl,
      "--no-default-profile", "--no-bridge", "--timeout", "10000"
    ]);
    await waitFor(project, env, "globalThis.__PAC_RESULT__ === 'through-pac-proxy:direct'");
    assert.ok(pacRequests.includes("/config?token=e2e"), JSON.stringify(pacRequests));
    assert.ok(proxyRequests.includes(`http://proxy.test:${addressPort(source)}/via-proxy`), JSON.stringify(proxyRequests));
    assert.ok(sourceRequests.includes("/direct"), JSON.stringify(sourceRequests));
    assert.equal(sourceRequests.includes("/via-proxy"), false, JSON.stringify(sourceRequests));
  } finally {
    await Promise.allSettled([env === undefined ? Promise.resolve() : runCli(project, env, ["stop"])]);
    await Promise.all([close(source), close(proxy), close(pac)]);
    await Promise.all([
      rm(directory, { recursive: true, force: true }),
      rm(socketDirectory, { recursive: true, force: true })
    ]);
  }
}

async function testFixedHttpProxy() {
  const directory = await mkdtemp(join(tmpdir(), "divebell-fixed-proxy-e2e-"));
  const project = join(directory, "project");
  const requests = [];
  const proxy = createServer((request, response) => {
    requests.push(request.url ?? "");
    response.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><script>globalThis.__FIXED_PROXY__ = 'used';</script>");
  });
  const socketDirectory = await mkdtemp("/tmp/divebell-fixed-proxy-sockets-");
  let env;
  try {
    await Promise.all([mkdir(project, { recursive: true }), listen(proxy)]);
    env = createE2eEnv({
      DIVEBELL_HOME: join(directory, "divebell-home"),
      AGENT_BROWSER_SOCKET_DIR: socketDirectory,
      DIVEBELL_BROWSER_PROFILE_DIR: join(directory, "profile"),
      DIVEBELL_DISABLE_EXTENSIONS: "1"
    });
    const target = "http://fixed-proxy.test:17777/fixed";
    await runCli(project, env, [
      "open", target, "--proxy", `http://127.0.0.1:${addressPort(proxy)}`,
      "--no-default-profile", "--no-bridge", "--timeout", "10000"
    ]);
    await waitFor(project, env, "globalThis.__FIXED_PROXY__ === 'used'");
    assert.ok(requests.some((url) => url.startsWith(`${target}?divebellSessionId=`)), JSON.stringify(requests));
  } finally {
    await Promise.allSettled([env === undefined ? Promise.resolve() : runCli(project, env, ["stop"])]);
    await close(proxy);
    await Promise.all([
      rm(directory, { recursive: true, force: true }),
      rm(socketDirectory, { recursive: true, force: true })
    ]);
  }
}

async function testHttpsRewriteAndHttpFulfill() {
  const directory = await mkdtemp(join(tmpdir(), "divebell-https-network-e2e-"));
  let credentials;
  try {
    credentials = await createTemporaryHttpsCredentials(directory);
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  const project = join(directory, "project");
  const rulesPath = join(directory, "request-rules.json");
  const socketDirectory = await mkdtemp("/tmp/divebell-https-sockets-");
  const rewrittenRequests = [];
  const fulfillRequests = [];
  const pageReports = [];
  const replacementHttps = createHttpsServer(credentials, (request, response) => {
    rewrittenRequests.push(request.url ?? "");
    response.writeHead(200, { "content-type": "application/javascript" }).end("globalThis.__HTTPS_REWRITE__ = 'replacement-https';");
  });
  const fulfillHttp = createServer((request, response) => {
    fulfillRequests.push(request.url ?? "");
    response.writeHead(200, { "content-type": "application/json" }).end('{"source":"http-fulfill"}');
  });
  let sourceOrigin = "";
  const sourceHttps = createHttpsServer(credentials, (request, response) => {
    if (request.url?.startsWith("/report")) {
      pageReports.push(new URL(request.url, "https://source.test").searchParams.get("result"));
      response.writeHead(204, { "access-control-allow-origin": "*" }).end();
      return;
    }
    if (request.url?.startsWith("/assets/app.js")) {
      response.writeHead(200, { "content-type": "application/javascript" }).end("globalThis.__HTTPS_REWRITE__ = 'source-https';");
      return;
    }
    if (request.url?.startsWith("/api/catalog")) {
      response.writeHead(200, { "content-type": "application/json" }).end('{"source":"source-https"}');
      return;
    }
    response.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html>
      <script src="${sourceOrigin}/assets/app.js"></script>
      <script>fetch('${sourceOrigin}/api/catalog').then((response) => response.json()).then((value) => {
        globalThis.__HTTPS_FULFILL__ = value.source;
        return fetch('${sourceOrigin}/report?result=' + encodeURIComponent(globalThis.__HTTPS_REWRITE__ + ':' + value.source));
      });</script>`);
  });
  let env;
  try {
    await Promise.all([
      mkdir(project, { recursive: true }),
      listen(sourceHttps, "localhost"),
      listen(replacementHttps, "localhost"),
      listen(fulfillHttp, "localhost")
    ]);
    sourceOrigin = `https://localhost:${addressPort(sourceHttps)}`;
    const replacementOrigin = `https://localhost:${addressPort(replacementHttps)}`;
    const fulfillOrigin = `http://localhost:${addressPort(fulfillHttp)}`;
    await writeFile(rulesPath, `${JSON.stringify({
      schemaVersion: 1,
      rules: [
        {
          id: "https-rewrite",
          match: { urlPrefix: `${sourceOrigin}/assets/` },
          action: { type: "rewrite", targetPrefix: `${replacementOrigin}/assets/` }
        },
        {
          id: "https-to-http-fulfill",
          match: { url: `${sourceOrigin}/api/catalog` },
          action: { type: "fulfill", url: `${fulfillOrigin}/fixture`, timeoutMs: 5000 }
        }
      ]
    }, null, 2)}\n`);
    env = createE2eEnv({
      DIVEBELL_HOME: join(directory, "divebell-home"),
      AGENT_BROWSER_SOCKET_DIR: socketDirectory,
      DIVEBELL_BROWSER_PROFILE_DIR: join(directory, "profile"),
      DIVEBELL_DISABLE_EXTENSIONS: "1"
    });
    await runCli(project, env, [
      "open", `${sourceOrigin}/`, "--request-rules", rulesPath, "--ignore-https-errors",
      "--no-default-profile", "--no-bridge", "--timeout", "10000"
    ]);
    await waitUntil(() => pageReports.includes("replacement-https:http-fulfill"), () => JSON.stringify(pageReports));
    assert.ok(rewrittenRequests.includes("/assets/app.js"), JSON.stringify(rewrittenRequests));
    assert.ok(fulfillRequests.includes("/fixture"), JSON.stringify(fulfillRequests));
  } finally {
    await Promise.allSettled([env === undefined ? Promise.resolve() : runCli(project, env, ["stop"])]);
    await Promise.all([close(sourceHttps), close(replacementHttps), close(fulfillHttp)]);
    await Promise.all([
      rm(directory, { recursive: true, force: true }),
      rm(socketDirectory, { recursive: true, force: true })
    ]);
  }
}

async function createTemporaryHttpsCredentials(directory) {
  const keyPath = join(directory, "localhost-key.pem");
  const certPath = join(directory, "localhost-cert.pem");
  const configPath = join(directory, "openssl.cnf");
  await writeFile(configPath, `[req]
distinguished_name = subject
x509_extensions = extensions
prompt = no

[subject]
CN = localhost

[extensions]
subjectAltName = @alt_names
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
DNS.1 = localhost
IP.1 = 127.0.0.1
`);
  try {
    await execFileAsync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-sha256", "-nodes",
      "-keyout", keyPath, "-out", certPath, "-days", "1", "-config", configPath
    ]);
  } catch (error) {
    throw new Error("HTTPS network-control E2E requires openssl to generate a temporary localhost certificate.", { cause: error });
  }
  const [key, cert] = await Promise.all([readFile(keyPath), readFile(certPath)]);
  return { key, cert };
}

function markerServer(marker, requests, reportOrigin) {
  return createServer((request, response) => {
    requests.push(request.url ?? "");
    response.writeHead(200, { "content-type": "application/javascript" }).end(
      `globalThis.__DAEMON_RESOURCE__ = ${JSON.stringify(marker)}; fetch(${JSON.stringify(`${reportOrigin()}/report?marker=${marker}`)}).catch(() => undefined);`
    );
  });
}

async function writeRules(path, sourceOrigin, replacementOrigin) {
  await writeFile(path, `${JSON.stringify({
    schemaVersion: 1,
    rules: [{
      id: "assets",
      match: { urlPrefix: `${sourceOrigin}/assets/` },
      action: { type: "rewrite", targetPrefix: `${replacementOrigin}/assets/` }
    }]
  }, null, 2)}\n`);
}

function createE2eEnv(overrides) {
  const env = { ...process.env };
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy"]) delete env[key];
  return { ...env, ...overrides };
}

async function runCli(cwd, env, args) {
  const result = await execFileAsync(process.execPath, [cliEntry, ...args], {
    cwd,
    env,
    maxBuffer: 10 * 1024 * 1024
  });
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.status, "ok", result.stderr);
  return parsed.data;
}

async function waitFor(cwd, env, expression) {
  await runCli(cwd, env, ["wait-eval", expression, "--timeout", "10000"]);
}

async function waitForMarkers(reports, expected) {
  await waitUntil(() => expected.every((marker) => reports.includes(marker)), () => JSON.stringify({ reports, expected }));
}

async function waitForMarkerCount(reports, marker, count) {
  await waitUntil(() => reports.filter((value) => value === marker).length >= count, () => JSON.stringify({ reports, marker, count }));
}

async function waitUntil(predicate, describe) {
  const deadline = Date.now() + 10_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for browser result: ${describe()}`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
}

async function listen(server, host = "127.0.0.1") {
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, host, resolvePromise);
  });
}

async function close(server) {
  if (!server.listening) return;
  await new Promise((resolvePromise) => server.close(() => resolvePromise()));
}

function addressPort(server) {
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  return address.port;
}

function originOf(server, host) {
  return `http://${host}:${addressPort(server)}`;
}
