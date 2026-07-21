import { execFile } from "node:child_process";
import { access, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const demoDirectory = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(demoDirectory, "../..");
const cliPath = join(repositoryRoot, "packages/cli/dist/index.js");
const commandPackageDirectory = join(repositoryRoot, "packages/command-code-usage");
const distDirectory = join(demoDirectory, "dist");
const defaultAgentBrowser = "agent-browser";
const options = parseOptions(process.argv.slice(2));
const artifactDirectory = resolve(options.artifactDirectory ?? join(demoDirectory, ".code-usage-artifacts"));
const profileDirectory = join(tmpdir(), `orcov-${process.pid}`);
const socketDirectory = join(tmpdir(), `abc-${process.pid}`);
const extensionsDirectory = join(profileDirectory, "extensions");
const agentBrowser = process.env.OPENRUNTIME_AGENT_BROWSER_EXECUTABLE ?? defaultAgentBrowser;
const environment = {
  ...process.env,
  HOME: profileDirectory,
  AGENT_BROWSER_SOCKET_DIR: socketDirectory,
  OPENRUNTIME_AGENT_BROWSER_EXECUTABLE: agentBrowser,
  OPENRUNTIME_AGENT_BROWSER_SESSION: `orc${process.pid}`,
  OPENRUNTIME_BROWSER_PROFILE_DIR: profileDirectory,
  OPENRUNTIME_EXTENSIONS_DIR: extensionsDirectory
};

await access(cliPath);
if (agentBrowser.includes("/") || agentBrowser.includes("\\")) {
  await access(agentBrowser);
}
await mkdir(artifactDirectory, { recursive: true });
await mkdir(profileDirectory, { recursive: true });
await mkdir(socketDirectory, { recursive: true });

const firstScreenPath = join(artifactDirectory, "first-screen.coverage.json");
const ordersPath = join(artifactDirectory, "orders.coverage.json");
const reportPath = join(artifactDirectory, "report.json");
let coverageStarted = false;

try {
  await runCli(["extensions", "add", commandPackageDirectory, "--extensions-dir", extensionsDirectory]);
  await runCli(["open", "about:blank", "--no-bridge"]);
  await runCli(["coverage", "start"]);
  coverageStarted = true;
  await runCli(["goto", options.url]);
  await waitForPathname("/");
  await waitForRouteLink("/orders");
  await delay(500);
  await runCli(["coverage", "take", firstScreenPath, "--label", "first-screen"]);

  await clickRoute("/orders");
  await waitForPathname("/orders");
  await delay(500);
  await runCli(["coverage", "stop", ordersPath, "--label", "orders"]);
  coverageStarted = false;

  await runCli([
    "code-usage",
    "analyze",
    "--chunk-map",
    join(distDirectory, "openruntime-chunks.json"),
    "--coverage",
    firstScreenPath,
    "--coverage",
    ordersPath,
    "--output",
    reportPath
  ]);
  const report = await readJson(reportPath);
  process.stdout.write(`${JSON.stringify({
    url: options.url,
    buildId: report.buildId,
    phases: report.phases.map(summarizePhase)
  }, null, 2)}\n`);
  process.stdout.write(`\nCode usage report: ${reportPath}\n`);
} finally {
  if (coverageStarted) await runCli(["coverage", "cancel"], { allowFailure: true });
  await runCli(["close"], { allowFailure: true });
  await rm(profileDirectory, { recursive: true, force: true });
  await rm(socketDirectory, { recursive: true, force: true });
}

function summarizePhase(phase) {
  const initialChunkIds = new Set(phase.chunks.filter((chunk) => chunk.initial).map((chunk) => chunk.chunkId));
  const initialPackages = phase.packages.filter((item) =>
    item.chunkIds.some((chunkId) => initialChunkIds.has(chunkId)));
  return {
    label: phase.label,
    chunksObserved: phase.chunks.length,
    sourcesObserved: phase.sources.length,
    unmatchedScripts: phase.unmatchedScriptUrls.length,
    largestPackages: phase.packages.slice(0, 8).map(compactUsage),
    lowUseInitialPackages: initialPackages
      .filter((item) => item.totalBytes >= 1024 && (item.usedRatio ?? 1) < 0.1)
      .sort((left, right) => right.totalBytes - left.totalBytes)
      .slice(0, 8)
      .map(compactUsage)
  };
}

function compactUsage(item) {
  return {
    package: item.packageVersion === null
      ? item.packageName
      : `${item.packageName}@${item.packageVersion}`,
    kind: item.kind,
    totalBytes: item.totalBytes,
    usedBytes: item.usedBytes,
    usedPercent: item.usedRatio === null ? null : Number((item.usedRatio * 100).toFixed(1)),
    chunkIds: item.chunkIds
  };
}

async function clickRoute(pathname) {
  await waitForRouteLink(pathname);
  const selector = JSON.stringify(`a[href="${pathname}"]`);
  await runCli([
    "eval",
    `(() => { const link = document.querySelector(${selector}); if (!link) throw new Error("Missing route link: ${pathname}"); link.click(); return true; })()`
  ]);
}

async function waitForRouteLink(pathname) {
  const selector = JSON.stringify(`a[href="${pathname}"]`);
  await runCli(["wait-eval", `document.querySelector(${selector}) !== null`, "--timeout", "10000"]);
}

async function waitForPathname(pathname) {
  await runCli([
    "wait-eval",
    `window.location.pathname === ${JSON.stringify(pathname)}`,
    "--timeout",
    "10000"
  ]);
}

async function runCli(args, runOptions = {}) {
  try {
    const result = await execFileAsync(process.execPath, [cliPath, ...args], {
      cwd: repositoryRoot,
      env: environment,
      maxBuffer: 100 * 1024 * 1024
    });
    const output = result.stdout.trim();
    if (output.length === 0) return {};
    return output.startsWith("{") || output.startsWith("[")
      ? JSON.parse(output)
      : output;
  } catch (error) {
    if (runOptions.allowFailure === true) return {};
    const stderr = typeof error.stderr === "string" ? error.stderr.trim() : "";
    const stdout = typeof error.stdout === "string" ? error.stdout.trim() : "";
    throw new Error(stderr || stdout || error.message, { cause: error });
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function parseOptions(args) {
  const parsed = {
    url: "http://localhost:19081/",
    artifactDirectory: undefined
  };
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    const value = args[index + 1];
    if (name === "--url" && value !== undefined) parsed.url = value;
    if (name === "--artifact-dir" && value !== undefined) parsed.artifactDirectory = value;
    if (["--url", "--artifact-dir"].includes(name)) index += 1;
  }
  return parsed;
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
