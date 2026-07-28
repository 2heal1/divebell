import { execFile } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const demoDirectory = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(demoDirectory, "../..");
const cliPath = join(repositoryRoot, "packages/cli/dist/index.js");
const codeUsageExtensionDirectory = join(repositoryRoot, "packages/extension-code-usage");
const memoryExtensionDirectory = join(repositoryRoot, "packages/extension-memory");
const modernPluginDirectory = join(repositoryRoot, "packages/modern-plugin");
const cliDirectory = join(repositoryRoot, "packages/cli");
const distDirectory = join(demoDirectory, "dist");
const chunkMapPath = join(distDirectory, "divebell-chunks.json");
const defaultReadyTarget = "modern:route";
const options = parseOptions(process.argv.slice(2));
const artifactDirectory = resolve(options.artifactDirectory ?? join(demoDirectory, ".page-experience-artifacts"));
const workingDirectory = join(tmpdir(), `divebell-page-experience-${process.pid}`);
const extensionsDirectory = join(workingDirectory, "extensions");
const experienceInitScriptPath = join(workingDirectory, "page-experience-init.js");
const progress = createProgress(12);
const baseEnvironment = {
  ...process.env,
  HOME: workingDirectory,
  DIVEBELL_EXTENSIONS_DIR: extensionsDirectory,
  npm_config_cache: join(workingDirectory, ".npm-cache")
};
delete baseEnvironment.DIVEBELL_AGENT_BROWSER_EXECUTABLE;
delete baseEnvironment.AGENT_BROWSER_INIT_SCRIPTS;
if (options.agentBrowser !== undefined) {
  baseEnvironment.DIVEBELL_AGENT_BROWSER_EXECUTABLE = options.agentBrowser;
}

const PAGE_EXPERIENCE_INIT_SCRIPT = `(() => {
  const samples = [];
  const readMemory = () => {
    const memory = performance.memory;
    if (!memory || !Number.isFinite(memory.usedJSHeapSize)) return;
    samples.push({
      timeMs: performance.now(),
      usedBytes: memory.usedJSHeapSize,
      totalBytes: memory.totalJSHeapSize
    });
  };
  readMemory();
  const timer = setInterval(readMemory, 25);
  let finished;
  globalThis.__DIVEBELL_PAGE_EXPERIENCE__ = {
    finish() {
      if (finished) return finished;
      clearInterval(timer);
      readMemory();
      const navigation = performance.getEntriesByType("navigation")[0];
      const resources = performance.getEntriesByType("resource")
        .slice(0, 500)
        .map((entry) => ({
          url: entry.name,
          initiatorType: entry.initiatorType || "other",
          startTimeMs: entry.startTime,
          responseEndMs: entry.responseEnd,
          durationMs: entry.duration,
          transferSize: entry.transferSize || 0,
          encodedBodySize: entry.encodedBodySize || 0,
          decodedBodySize: entry.decodedBodySize || 0
        }));
      const atReady = samples.at(-1) || null;
      const peak = samples.reduce((result, sample) =>
        result === null || sample.usedBytes > result.usedBytes ? sample : result, null);
      const step = Math.max(1, Math.ceil(samples.length / 120));
      finished = {
        readyDurationMs: performance.now(),
        navigation: navigation ? {
          responseStartMs: navigation.responseStart,
          domContentLoadedMs: navigation.domContentLoadedEventEnd,
          loadEventMs: navigation.loadEventEnd,
          durationMs: navigation.duration,
          transferSize: navigation.transferSize || 0,
          encodedBodySize: navigation.encodedBodySize || 0,
          decodedBodySize: navigation.decodedBodySize || 0
        } : {},
        memory: {
          atReadyBytes: atReady?.usedBytes ?? null,
          totalAtReadyBytes: atReady?.totalBytes ?? null,
          peakBytes: peak?.usedBytes ?? null,
          peakTimeMs: peak?.timeMs ?? null
        },
        memorySamples: samples.filter((_, index) => index % step === 0 || index === samples.length - 1),
        resources
      };
      return finished;
    }
  };
})();`;

await main().catch((error) => {
  process.stderr.write(`检查失败：${getErrorMessage(error)}\n`);
  process.exitCode = 1;
});

async function main() {
  await progress.run("构建页面分析能力", () => buildPackage(modernPluginDirectory));
  await progress.run("构建检查命令", () => buildPackage(cliDirectory));
  await progress.run("构建报告页面", () => buildPackage(codeUsageExtensionDirectory));
  await progress.run("构建内存采集能力", () => buildPackage(memoryExtensionDirectory));
  await progress.run("确认生产页面与构建一致", () => assertServerMatchesBuild(options.url));

  await access(cliPath);
  if (options.agentBrowser !== undefined &&
      (options.agentBrowser.includes("/") || options.agentBrowser.includes("\\"))) {
    await access(options.agentBrowser);
  }
  await mkdir(artifactDirectory, { recursive: true });
  await mkdir(extensionsDirectory, { recursive: true });
  await writeFile(experienceInitScriptPath, PAGE_EXPERIENCE_INIT_SCRIPT, "utf8");

  const firstScreenPath = join(artifactDirectory, "first-screen.coverage.json");
  const ordersPath = join(artifactDirectory, "orders.coverage.json");
  const reportPath = join(artifactDirectory, "report.json");
  let reportSummary;

  try {
    await progress.run("加载报告与内存命令", async () => {
      await runCli(["extensions", "add", codeUsageExtensionDirectory, "--extensions-dir", extensionsDirectory]);
      await runCli(["extensions", "add", memoryExtensionDirectory, "--extensions-dir", extensionsDirectory]);
    });

    const firstScreen = {
      label: "first-screen",
      url: options.url,
      pathname: "/",
      readyTarget: options.readyTarget,
      coveragePath: firstScreenPath
    };
    const orders = {
      label: "orders",
      url: new URL("/orders", options.url).href,
      pathname: "/orders",
      readyTarget: defaultReadyTarget,
      coveragePath: ordersPath
    };
    const firstScreenExperience = await progress.run(
      `测量首页并等待 ${options.readyTarget}=ready`,
      () => measureRouteExperienceRepeated(firstScreen)
    );
    await progress.run("记录首页代码执行", () => recordRouteCoverage(firstScreen));
    const ordersExperience = await progress.run("测量 /orders", () => measureRouteExperienceRepeated(orders));
    await progress.run("记录 /orders 代码执行", () => recordRouteCoverage(orders));

    await progress.run("生成分析结果", () => runCli([
      "code-usage",
      "analyze",
      "--chunk-map",
      chunkMapPath,
      "--coverage",
      firstScreenPath,
      "--coverage",
      ordersPath,
      "--output",
      reportPath
    ]));
    await progress.run("合并加载与内存数据", async () => {
      const usage = await readJson(reportPath);
      assertCodeUsagePresent(usage);
      await writeFile(reportPath, `${JSON.stringify({
        schemaVersion: 1,
        url: options.url,
        readyTarget: options.readyTarget,
        capturedAt: new Date().toISOString(),
        experience: {
          mode: options.runs > 1 ? "cold-median" : "cold",
          runCount: options.runs,
          phases: [firstScreenExperience, ordersExperience]
        },
        usage
      }, null, 2)}\n`, "utf8");
    });
    const report = await readJson(reportPath);
    reportSummary = {
      url: options.url,
      readyTarget: options.readyTarget,
      buildId: report.usage.buildId,
      experience: report.experience.phases.map((phase) => ({
        label: phase.label,
        readyDurationMs: phase.readyDurationMs,
        loadEventMs: phase.navigation.loadEventMs,
        memoryAtReady: phase.memory.atReadyBytes,
        peakMemory: phase.memory.peakBytes,
        stableMemory: phase.memory.stableBytes
      })),
      phases: report.usage.phases.map(summarizePhase)
    };
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }

  process.stdout.write(`${JSON.stringify(reportSummary, null, 2)}\n`);
  process.stdout.write(`\n页面体验数据: ${reportPath}\n`);
  process.stdout.write("启动流式报告: pnpm --filter @divebell/demo-modern-basic report:serve\n");
  process.stdout.write("打开地址: http://127.0.0.1:4173/\n");
  process.stdout.write(`检查完成，总耗时 ${formatDuration(progress.elapsed())}。\n`);
}

async function measureRouteExperience(route) {
  return withIsolatedBrowser(route.label, "measure", true, async (environment) => {
    await navigateAndWait(route, environment);
    const captured = await runCli([
      "eval",
      `(() => { const recorder = globalThis.__DIVEBELL_PAGE_EXPERIENCE__; if (!recorder) throw new Error("Page experience recorder is missing"); return recorder.finish(); })()`
    ], { environment });
    const stableMemory = await runCli(["memory", "metrics"], { environment });
    return normalizeExperiencePhase({
      ...route,
      captured,
      stableMemory
    });
  });
}

async function measureRouteExperienceRepeated(route) {
  const measurements = [];
  for (let index = 1; index <= options.runs; index += 1) {
    process.stdout.write(`        第 ${index}/${options.runs} 次冷启动...\n`);
    measurements.push(await measureRouteExperience(route, index));
  }
  const sorted = measurements.slice().sort((left, right) =>
    (left.readyDurationMs ?? Number.POSITIVE_INFINITY) - (right.readyDurationMs ?? Number.POSITIVE_INFINITY));
  const representative = sorted[Math.floor(sorted.length / 2)] ?? measurements[0];
  return {
    ...representative,
    runCount: measurements.length,
    measurements: measurements.map((measurement) => ({
      readyDurationMs: measurement.readyDurationMs,
      loadEventMs: measurement.navigation.loadEventMs,
      memoryAtReadyBytes: measurement.memory.atReadyBytes,
      peakMemoryBytes: measurement.memory.peakBytes,
      stableMemoryBytes: measurement.memory.stableBytes
    }))
  };
}

async function recordRouteCoverage(route) {
  return withIsolatedBrowser(route.label, "coverage", false, async (environment) => {
    let coverageStarted = false;
    try {
      await runCli(["coverage", "start"], { environment });
      coverageStarted = true;
      await navigateAndWait(route, environment);
      await runCli(["coverage", "stop", route.coveragePath, "--label", route.label], { environment });
      coverageStarted = false;
    } finally {
      if (coverageStarted) {
        await runCli(["coverage", "cancel"], { allowFailure: true, environment });
      }
    }
  });
}

async function navigateAndWait({ url, pathname, readyTarget }, environment) {
  await runCli(["goto", url], { environment });
  await waitForPathname(pathname, environment);
  await waitForReadyTarget(readyTarget, {
    ...(readyTarget === defaultReadyTarget ? { pathname } : {})
  }, environment);
}

async function withIsolatedBrowser(label, purpose, includeExperienceRecorder, action) {
  const routeDirectory = join(workingDirectory, `${label}-${purpose}`);
  const profileDirectory = join(routeDirectory, "profile");
  const routeKey = `${label === "first-screen" ? "f" : "o"}${purpose === "measure" ? "m" : "c"}`;
  const socketDirectory = join(tmpdir(), `abc-${process.pid}-${routeKey}`);
  const environment = {
    ...baseEnvironment,
    HOME: profileDirectory,
    AGENT_BROWSER_SOCKET_DIR: socketDirectory,
    ...(includeExperienceRecorder ? { AGENT_BROWSER_INIT_SCRIPTS: experienceInitScriptPath } : {}),
    DIVEBELL_AGENT_BROWSER_SESSION: `oc${process.pid}${routeKey}`,
    DIVEBELL_BROWSER_PROFILE_DIR: profileDirectory
  };
  let browserOpened = false;
  await mkdir(profileDirectory, { recursive: true });
  await mkdir(socketDirectory, { recursive: true });

  try {
    await runCli(["open", "about:blank", "--no-bridge"], { environment });
    browserOpened = true;
    return await action(environment);
  } finally {
    if (browserOpened) {
      await runCli(["stop"], { allowFailure: true, environment });
    }
    await rm(routeDirectory, { recursive: true, force: true });
    await rm(socketDirectory, { recursive: true, force: true });
  }
}

function normalizeExperiencePhase({ label, url, pathname, readyTarget, captured, stableMemory }) {
  const value = isRecord(captured) ? captured : {};
  const navigation = isRecord(value.navigation) ? value.navigation : {};
  const memory = isRecord(value.memory) ? value.memory : {};
  return {
    label,
    url,
    pathname,
    readyTarget,
    readyDurationMs: finiteNumber(value.readyDurationMs),
    navigation: {
      responseStartMs: finiteNumber(navigation.responseStartMs),
      domContentLoadedMs: finiteNumber(navigation.domContentLoadedMs),
      loadEventMs: finiteNumber(navigation.loadEventMs),
      durationMs: finiteNumber(navigation.durationMs),
      transferSize: finiteNumber(navigation.transferSize),
      encodedBodySize: finiteNumber(navigation.encodedBodySize),
      decodedBodySize: finiteNumber(navigation.decodedBodySize)
    },
    memory: {
      atReadyBytes: finiteNumber(memory.atReadyBytes),
      totalAtReadyBytes: finiteNumber(memory.totalAtReadyBytes),
      peakBytes: finiteNumber(memory.peakBytes),
      peakTimeMs: finiteNumber(memory.peakTimeMs),
      stableBytes: isRecord(stableMemory) ? finiteNumber(stableMemory.jsHeapUsedSize) : null
    },
    memorySamples: Array.isArray(value.memorySamples) ? value.memorySamples : [],
    resources: Array.isArray(value.resources) ? value.resources : []
  };
}

async function assertServerMatchesBuild(url) {
  try {
    const [response, chunkMap] = await Promise.all([
      fetch(url, {
        signal: AbortSignal.timeout(5000)
      }),
      readJson(chunkMapPath)
    ]);
    if (!response.ok) throw new Error(`服务返回 ${response.status}`);
    const html = await response.text();
    const buildAssets = (chunkMap.chunks ?? [])
      .flatMap((chunk) => chunk.assets ?? [])
      .map((asset) => asset.file)
      .filter((file) => typeof file === "string");
    if (buildAssets.some((file) => file.includes(".hot-update."))) {
      throw new Error("当前分块数据来自开发页面");
    }
    const expectedScripts = new Set(buildAssets
      .filter((file) => file.endsWith(".js"))
      .map(normalizeAssetPath));
    const pageScripts = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)]
      .map((match) => normalizeAssetPath(new URL(match[1], url).pathname))
      .filter((path) => path.endsWith(".js"));
    if (pageScripts.length === 0 || !pageScripts.some((path) => expectedScripts.has(path))) {
      throw new Error("当前地址不是本次构建的生产页面");
    }
  } catch (error) {
    throw new Error(
      `无法使用 ${url} 生成代码分析。请停止当前开发服务，先运行 pnpm --filter @divebell/demo-modern-basic verify:chunk-map，再运行 pnpm --filter @divebell/demo-modern-basic serve。`,
      { cause: error }
    );
  }
}

function normalizeAssetPath(path) {
  return String(path).replace(/^\/+/, "").split(/[?#]/, 1)[0];
}

function assertCodeUsagePresent(usage) {
  const phases = Array.isArray(usage.phases) ? usage.phases : [];
  const observedScripts = phases.reduce((sum, phase) => sum + (phase.scriptsObserved ?? 0), 0);
  const matchedChunks = phases.reduce((sum, phase) => sum + (phase.chunks?.length ?? 0), 0);
  if (observedScripts > 0 && matchedChunks === 0) {
    const unmatchedScripts = phases.reduce((sum, phase) => sum + (phase.unmatchedScriptUrls?.length ?? 0), 0);
    throw new Error(
      `代码分析没有匹配到页面文件（${unmatchedScripts} 个文件无法对应）。请确认页面服务与 dist/divebell-chunks.json 来自同一次生产构建。`
    );
  }
}

function getErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  try {
    const parsed = JSON.parse(message);
    return typeof parsed.message === "string" ? parsed.message : message;
  } catch {
    return message;
  }
}

async function buildPackage(packageDirectory) {
  const pnpmScript = process.env.npm_execpath;
  const executable = pnpmScript === undefined ? "pnpm" : process.execPath;
  const args = pnpmScript === undefined
    ? ["--dir", packageDirectory, "build"]
    : [pnpmScript, "--dir", packageDirectory, "build"];
  try {
    await execFileAsync(executable, args, {
      cwd: repositoryRoot,
      env: process.env,
      maxBuffer: 100 * 1024 * 1024
    });
  } catch (error) {
    const stderr = typeof error.stderr === "string" ? error.stderr.trim() : "";
    const stdout = typeof error.stdout === "string" ? error.stdout.trim() : "";
    throw new Error(stderr || stdout || error.message, { cause: error });
  }
}

function createProgress(totalSteps) {
  const startedAt = Date.now();
  let currentStep = 0;
  return {
    elapsed: () => Date.now() - startedAt,
    async run(label, action) {
      currentStep += 1;
      const stepStartedAt = Date.now();
      process.stdout.write(`[${currentStep}/${totalSteps}] ${label}...\n`);
      try {
        const result = await action();
        process.stdout.write(`      完成（${formatDuration(Date.now() - stepStartedAt)}）\n`);
        return result;
      } catch (error) {
        process.stderr.write(`      失败（${formatDuration(Date.now() - stepStartedAt)}）\n`);
        throw error;
      }
    }
  };
}

function formatDuration(milliseconds) {
  if (milliseconds < 1000) return `${milliseconds} 毫秒`;
  return `${(milliseconds / 1000).toFixed(1)} 秒`;
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

async function waitForPathname(pathname, environment) {
  await runCli([
    "wait-eval",
    `window.location.pathname === ${JSON.stringify(pathname)}`,
    "--timeout",
    "10000"
  ], { environment });
}

async function waitForReadyTarget(targetId, options = {}, environment) {
  const targetExpression = `window.__DIVEBELL__?.getSnapshot()?.targets?.[${JSON.stringify(targetId)}]`;
  const pathnameCheck = options.pathname === undefined
    ? "true"
    : `target.data?.pathname === ${JSON.stringify(options.pathname)}`;
  try {
    await runCli([
      "wait-eval",
      `(() => { const target = ${targetExpression}; return target?.status === "ready" && ${pathnameCheck}; })()`,
      "--timeout",
      "10000"
    ], { environment });
  } catch (error) {
    throw new Error(`等待结束标识 ${targetId}=ready 超时。请确认页面已注册并更新这个目标。`, {
      cause: error
    });
  }
}

async function runCli(args, runOptions = {}) {
  try {
    const result = await execFileAsync(process.execPath, [cliPath, ...args], {
      cwd: repositoryRoot,
      env: runOptions.environment ?? baseEnvironment,
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

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseOptions(args) {
  const parsed = {
    url: "http://127.0.0.1:19081/",
    artifactDirectory: undefined,
    agentBrowser: undefined,
    readyTarget: defaultReadyTarget,
    runs: 3
  };
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    const value = args[index + 1];
    if (name === "--url" && value !== undefined) parsed.url = value;
    if (name === "--artifact-dir" && value !== undefined) parsed.artifactDirectory = value;
    if (name === "--agent-browser" && value !== undefined) parsed.agentBrowser = value;
    if (name === "--ready-target" && value !== undefined) parsed.readyTarget = value;
    if (name === "--runs" && value !== undefined) {
      const runs = Number(value);
      if (!Number.isInteger(runs) || runs <= 0) throw new Error("--runs 必须是正整数。");
      parsed.runs = runs;
    }
    if (["--url", "--artifact-dir", "--agent-browser", "--ready-target", "--runs"].includes(name)) index += 1;
  }
  return parsed;
}
