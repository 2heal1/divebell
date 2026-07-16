import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  createWaitEvalScript,
  parseBrowserJsonOutput,
  type BrowserRunner
} from "./browser.js";

export interface MemoryCheckPage {
  eval(script: string): Promise<unknown>;
  waitEval(script: string, options?: { timeout?: number }): Promise<void>;
}

export interface MemoryCheckScenarioContext {
  page: MemoryCheckPage;
  iteration: number;
  phase: "setup" | "warmup" | "measure";
}

export interface MemoryCheckScenario {
  setup?(context: MemoryCheckScenarioContext): Promise<void> | void;
  run(context: MemoryCheckScenarioContext): Promise<void> | void;
}

export interface RunMemoryCheckOptions {
  url: string;
  scenarioPath: string;
  artifactDirectory: string;
  warmup: number;
  iterations: number;
  browserRunner: BrowserRunner;
  ui?: boolean;
}

export interface MemoryMetricPoint {
  iteration: number;
  jsHeapUsedSize: number | null;
  jsHeapTotalSize: number | null;
  documents: number | null;
  nodes: number | null;
  jsEventListeners: number | null;
}

export interface MemoryCheckReport {
  url: string;
  warmup: number;
  iterations: number;
  verdict: "no-clear-growth" | "suspicious-growth";
  reasons: string[];
  baseline: MemoryMetricPoint;
  final: MemoryMetricPoint;
  deltas: Record<string, number | null>;
  slopesPerIteration: Record<string, number | null>;
  topFunctions: unknown[];
  series: MemoryMetricPoint[];
}

export interface RunMemoryCheckResult {
  reportPath: string;
  baselineSnapshotPath: string;
  finalSnapshotPath: string;
  allocationProfilePath: string;
  report: MemoryCheckReport;
}

export async function runMemoryCheck(
  options: RunMemoryCheckOptions
): Promise<RunMemoryCheckResult> {
  const artifactDirectory = resolve(options.artifactDirectory);
  const baselineSnapshotPath = resolve(artifactDirectory, "baseline.heapsnapshot");
  const finalSnapshotPath = resolve(artifactDirectory, "final.heapsnapshot");
  const allocationProfilePath = resolve(artifactDirectory, "allocation.heapprofile");
  const reportPath = resolve(artifactDirectory, "report.json");
  const scenario = await loadMemoryCheckScenario(options.scenarioPath);
  const page = createMemoryCheckPage(options.browserRunner);
  const series: MemoryMetricPoint[] = [];
  let samplingStarted = false;

  await mkdir(artifactDirectory, { recursive: true });
  try {
    await runBrowserOrThrow(
      options.browserRunner,
      ["open", options.url],
      { ui: options.ui === true }
    );
    await scenario.setup?.({ page, iteration: 0, phase: "setup" });

    for (let index = 1; index <= options.warmup; index += 1) {
      await scenario.run({ page, iteration: index, phase: "warmup" });
    }

    const baseline = await readComparableMetrics(options.browserRunner, 0);
    await runJson(options.browserRunner, [
      "memory",
      "snapshot",
      baselineSnapshotPath,
      "--timeout",
      "120000"
    ]);
    await runJson(options.browserRunner, [
      "memory",
      "sampling",
      "start",
      "--sampling-interval",
      "32768"
    ]);
    samplingStarted = true;

    for (let index = 1; index <= options.iterations; index += 1) {
      await scenario.run({ page, iteration: index, phase: "measure" });
      series.push(await readComparableMetrics(options.browserRunner, index));
    }

    const allocation = await runJson(options.browserRunner, [
      "memory",
      "sampling",
      "stop",
      allocationProfilePath,
      "--top",
      "20"
    ]);
    samplingStarted = false;
    const final = await readComparableMetrics(
      options.browserRunner,
      options.iterations + 1
    );
    await runJson(options.browserRunner, [
      "memory",
      "snapshot",
      finalSnapshotPath,
      "--timeout",
      "120000"
    ]);

    const report = createMemoryCheckReport({
      url: options.url,
      warmup: options.warmup,
      iterations: options.iterations,
      baseline,
      final,
      series,
      allocation
    });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    return {
      reportPath,
      baselineSnapshotPath,
      finalSnapshotPath,
      allocationProfilePath,
      report
    };
  } finally {
    if (samplingStarted) {
      await options.browserRunner.run(["memory", "cancel", "--json"]);
    }
    await options.browserRunner.run(["close"]);
  }
}

async function loadMemoryCheckScenario(path: string): Promise<MemoryCheckScenario> {
  const absolutePath = resolve(path);
  const loaded: unknown = await import(pathToFileURL(absolutePath).href);
  const scenario = isRecord(loaded) && "default" in loaded
    ? loaded.default
    : loaded;
  if (!isRecord(scenario) || typeof scenario.run !== "function") {
    throw new Error(`Memory scenario ${absolutePath} must export default { run(context) {} }.`);
  }
  return scenario as unknown as MemoryCheckScenario;
}

function createMemoryCheckPage(browserRunner: BrowserRunner): MemoryCheckPage {
  return {
    eval: async (script) => await runJson(browserRunner, ["eval", script], false),
    waitEval: async (script, options = {}) => {
      const deadline = Date.now() + (options.timeout ?? 10_000);
      let lastError = "Condition did not become true.";
      while (Date.now() <= deadline) {
        const result = await browserRunner.run(["eval", createWaitEvalScript(script)]);
        if (result.exitCode === 0) {
          try {
            if (parseBrowserJsonOutput(result.stdout) === true) return;
          } catch (error) {
            lastError = errorMessage(error);
          }
        } else {
          lastError = result.stderr.trim() || result.stdout.trim() || lastError;
        }
        await delay(100);
      }
      throw new Error(`Page condition timed out: ${lastError}`);
    }
  };
}

async function readComparableMetrics(
  browserRunner: BrowserRunner,
  iteration: number
): Promise<MemoryMetricPoint> {
  await runJson(browserRunner, ["memory", "collect-garbage"]);
  const metrics = await runJson(browserRunner, ["memory", "metrics"]);
  return {
    iteration,
    jsHeapUsedSize: numberOrNull(metrics.jsHeapUsedSize),
    jsHeapTotalSize: numberOrNull(metrics.jsHeapTotalSize),
    documents: numberOrNull(metrics.documents),
    nodes: numberOrNull(metrics.nodes),
    jsEventListeners: numberOrNull(metrics.jsEventListeners)
  };
}

async function runJson(
  browserRunner: BrowserRunner,
  args: string[],
  appendJson = true
): Promise<Record<string, unknown>> {
  const browserArgs = appendJson ? [...args, "--json"] : args;
  const result = await browserRunner.run(browserArgs);
  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr.trim()
      || result.stdout.trim()
      || `Browser command ${args.join(" ")} failed.`
    );
  }
  if (result.stdout.trim().length === 0) return {};
  const value = parseBrowserJsonOutput(result.stdout);
  return isRecord(value) ? value : { value };
}

async function runBrowserOrThrow(
  browserRunner: BrowserRunner,
  args: string[],
  options: { ui?: boolean }
): Promise<void> {
  const result = await browserRunner.run(args, options);
  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr.trim()
      || result.stdout.trim()
      || `Browser command ${args.join(" ")} failed.`
    );
  }
}

function createMemoryCheckReport(input: {
  url: string;
  warmup: number;
  iterations: number;
  baseline: MemoryMetricPoint;
  final: MemoryMetricPoint;
  series: MemoryMetricPoint[];
  allocation: Record<string, unknown>;
}): MemoryCheckReport {
  const fields = ["jsHeapUsedSize", "documents", "nodes", "jsEventListeners"] as const;
  const deltas = Object.fromEntries(fields.map((field) => [
    field,
    delta(input.baseline[field], input.final[field])
  ]));
  const slopes = Object.fromEntries(fields.map((field) => [
    field,
    slope([input.baseline, ...input.series, input.final], field)
  ]));
  const reasons: string[] = [];
  if ((deltas.nodes ?? 0) > 20 && (slopes.nodes ?? 0) > 1) {
    reasons.push("DOM node count keeps growing after garbage collection.");
  }
  if (
    (deltas.jsEventListeners ?? 0) > 5
    && (slopes.jsEventListeners ?? 0) > 0.25
  ) {
    reasons.push("Event listener count keeps growing after garbage collection.");
  }
  if (
    (deltas.jsHeapUsedSize ?? 0) > 2 * 1024 * 1024
    && (slopes.jsHeapUsedSize ?? 0) > 64 * 1024
  ) {
    reasons.push("Used JavaScript heap keeps growing after garbage collection.");
  }
  return {
    url: input.url,
    warmup: input.warmup,
    iterations: input.iterations,
    verdict: reasons.length === 0 ? "no-clear-growth" : "suspicious-growth",
    reasons,
    baseline: input.baseline,
    final: input.final,
    deltas,
    slopesPerIteration: slopes,
    topFunctions: Array.isArray(input.allocation.topFunctions)
      ? input.allocation.topFunctions
      : [],
    series: input.series
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function delta(start: number | null, end: number | null): number | null {
  return start === null || end === null ? null : end - start;
}

function slope(
  points: MemoryMetricPoint[],
  field: keyof Omit<MemoryMetricPoint, "iteration">
): number | null {
  const values = points.map((point) => point[field]).filter((value): value is number =>
    value !== null);
  if (values.length < 2) return null;
  const xMean = (values.length - 1) / 2;
  const yMean = values.reduce((sum, value) => sum + value, 0) / values.length;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === undefined) continue;
    numerator += (index - xMean) * (value - yMean);
    denominator += (index - xMean) ** 2;
  }
  return denominator === 0 ? 0 : numerator / denominator;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
