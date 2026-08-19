import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { DivebellBrowserApi } from "@divebell/cli";

import type { MemoryCheckPage, MemoryCheckScenario, RunMemoryCheckOptions, MemoryMetricPoint, MemoryCheckReport, RunMemoryCheckResult } from "./types.js";
export type { MemoryCheckPage, MemoryCheckScenarioContext, MemoryCheckScenario, RunMemoryCheckOptions, MemoryMetricPoint, MemoryCheckReport, RunMemoryCheckResult } from "./types.js";

export async function runMemoryCheck(
  options: RunMemoryCheckOptions
): Promise<RunMemoryCheckResult> {
  const artifactDirectory = resolve(options.artifactDirectory);
  const baselineSnapshotPath = resolve(artifactDirectory, "baseline.heapsnapshot");
  const finalSnapshotPath = resolve(artifactDirectory, "final.heapsnapshot");
  const allocationProfilePath = resolve(artifactDirectory, "allocation.heapprofile");
  const reportPath = resolve(artifactDirectory, "report.json");
  const scenario = await loadMemoryCheckScenario(options.scenarioPath);
  const page = createMemoryCheckPage(options.browser);
  const series: MemoryMetricPoint[] = [];
  let samplingStarted = false;

  await mkdir(artifactDirectory, { recursive: true });
  try {
    await scenario.setup?.({ page, iteration: 0, phase: "setup" });

    for (let index = 1; index <= options.warmup; index += 1) {
      await scenario.run({ page, iteration: index, phase: "warmup" });
    }

    const baseline = await readComparableMetrics(options.browser, 0);
    await options.browser.memory.snapshot({
      path: baselineSnapshotPath,
      timeout: 120_000
    });
    await options.browser.memory.sampling.start({ samplingInterval: 32_768 });
    samplingStarted = true;

    for (let index = 1; index <= options.iterations; index += 1) {
      await scenario.run({ page, iteration: index, phase: "measure" });
      series.push(await readComparableMetrics(options.browser, index));
    }

    const allocation = await options.browser.memory.sampling.stop({
      path: allocationProfilePath,
      top: 20
    });
    samplingStarted = false;
    const final = await readComparableMetrics(
      options.browser,
      options.iterations + 1
    );
    await options.browser.memory.snapshot({
      path: finalSnapshotPath,
      timeout: 120_000
    });

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
      await options.browser.memory.cancel();
    }
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

function createMemoryCheckPage(browser: DivebellBrowserApi): MemoryCheckPage {
  return {
    eval: async (script) => await browser.eval(script),
    waitEval: async (script, options = {}) => {
      const result = await browser.waitEval(script, options);
      if (!result.success) {
        throw new Error(`Page condition timed out: ${result.reason ?? "Condition did not become true."}`);
      }
    }
  };
}

async function readComparableMetrics(
  browser: DivebellBrowserApi,
  iteration: number
): Promise<MemoryMetricPoint> {
  const metrics = await browser.memory.metrics();
  return {
    iteration,
    jsHeapUsedSize: numberOrNull(metrics.jsHeapUsedSize),
    jsHeapTotalSize: numberOrNull(metrics.jsHeapTotalSize),
    documents: numberOrNull(metrics.documents),
    nodes: numberOrNull(metrics.nodes),
    jsEventListeners: numberOrNull(metrics.jsEventListeners)
  };
}

function createMemoryCheckReport(input: {
  url: string;
  warmup: number;
  iterations: number;
  baseline: MemoryMetricPoint;
  final: MemoryMetricPoint;
  series: MemoryMetricPoint[];
  allocation: { topFunctions?: unknown[] };
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
