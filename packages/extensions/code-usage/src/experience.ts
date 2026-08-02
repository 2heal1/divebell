import type {
  DivebellBrowserApi,
  DivebellBrowserMemoryMetricsResult,
  DivebellBrowserCoverageStatusResult,
  ParsedCliArgs
} from "@divebell/cli";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type {
  CodeUsageExperienceCaptureOptions,
  CodeUsageExperienceCaptureResult,
  CodeUsageExperiencePhase
} from "./types.js";

export const PAGE_EXPERIENCE_INIT_SCRIPT = `(() => {
  const samples = [];
  const readMemory = () => {
    const memory = performance.memory;
    if (!memory || !Number.isFinite(memory.usedJSHeapSize)) return;
    samples.push({
      timeMs: performance.now(),
      usedBytes: memory.usedJSHeapSize,
      totalBytes: Number.isFinite(memory.totalJSHeapSize) ? memory.totalJSHeapSize : null
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
        url: location.href,
        pathname: location.pathname,
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

export function openCodeUsageExperience(
  args?: ParsedCliArgs
): { scripts: string[] } | undefined {
  if (!isCodeUsageExperienceEnabled(args)) return undefined;
  return { scripts: [PAGE_EXPERIENCE_INIT_SCRIPT] };
}

export function isCodeUsageExperienceEnabled(args?: ParsedCliArgs): boolean {
  const value = args?.options.get("code-usage-experience")?.at(-1);
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error(
    `Invalid --code-usage-experience value ${JSON.stringify(value)}. Use the flag without a value or omit it.`
  );
}

export async function captureCodeUsageExperience(
  browser: DivebellBrowserApi,
  options: CodeUsageExperienceCaptureOptions
): Promise<CodeUsageExperienceCaptureResult> {
  const coverage = await browser.coverage.status<DivebellBrowserCoverageStatusResult>();
  if (coverage.active) {
    throw new Error(
      "Stop or cancel code coverage before measuring page loading and memory."
    );
  }

  const captured = await browser.eval<unknown>(
    `(() => {
      const recorder = globalThis.__DIVEBELL_PAGE_EXPERIENCE__;
      if (!recorder || typeof recorder.finish !== "function") {
        throw new Error("Page experience recorder is missing");
      }
      return recorder.finish();
    })()`
  );
  const readyMetrics = await readMemoryMetrics(browser);
  if (options.settleMs > 0) {
    await browser.run("wait", { args: [String(options.settleMs)] });
  }
  const stableMetrics = options.settleMs > 0
    ? await readMemoryMetrics(browser)
    : readyMetrics;
  const phase = normalizeExperiencePhase(
    captured,
    options,
    readyMetrics,
    stableMetrics
  );
  const outputPath = resolve(options.outputPath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(phase, null, 2)}\n`, "utf8");
  return { outputPath, phase };
}

async function readMemoryMetrics(
  browser: DivebellBrowserApi
): Promise<DivebellBrowserMemoryMetricsResult | null> {
  try {
    return await browser.memory.metrics<DivebellBrowserMemoryMetricsResult>();
  } catch {
    return null;
  }
}

function normalizeExperiencePhase(
  captured: unknown,
  options: CodeUsageExperienceCaptureOptions,
  readyMetrics: DivebellBrowserMemoryMetricsResult | null,
  stableMetrics: DivebellBrowserMemoryMetricsResult | null
): CodeUsageExperiencePhase {
  const value = isRecord(captured) ? captured : {};
  const navigation = isRecord(value.navigation) ? value.navigation : {};
  const memory = isRecord(value.memory) ? value.memory : {};
  const readyDurationMs = finiteNumber(value.readyDurationMs);
  const atReadyBytes = finiteNumber(memory.atReadyBytes)
    ?? finiteNumber(readyMetrics?.jsHeapUsedSize);
  const totalAtReadyBytes = finiteNumber(memory.totalAtReadyBytes)
    ?? finiteNumber(readyMetrics?.jsHeapTotalSize);
  const peakBytes = finiteNumber(memory.peakBytes);
  return {
    schemaVersion: 1,
    label: options.label,
    url: stringValue(value.url),
    pathname: stringValue(value.pathname),
    readyTarget: options.readyTarget,
    readyDurationMs,
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
      atReadyBytes,
      totalAtReadyBytes,
      peakBytes,
      peakTimeMs: finiteNumber(memory.peakTimeMs),
      stableBytes: finiteNumber(stableMetrics?.jsHeapUsedSize)
    },
    memorySamples: normalizeMemorySamples(value.memorySamples),
    resources: normalizeResources(value.resources)
  };
}

function normalizeMemorySamples(
  value: unknown
): CodeUsageExperiencePhase["memorySamples"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const timeMs = finiteNumber(item.timeMs);
    const usedBytes = finiteNumber(item.usedBytes);
    if (timeMs === null || usedBytes === null) return [];
    return [{
      timeMs,
      usedBytes,
      totalBytes: finiteNumber(item.totalBytes)
    }];
  });
}

function normalizeResources(
  value: unknown
): CodeUsageExperiencePhase["resources"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.url !== "string") return [];
    return [{
      url: item.url,
      initiatorType: stringValue(item.initiatorType) || "other",
      startTimeMs: finiteNumber(item.startTimeMs) ?? 0,
      responseEndMs: finiteNumber(item.responseEndMs) ?? 0,
      durationMs: finiteNumber(item.durationMs) ?? 0,
      transferSize: finiteNumber(item.transferSize) ?? 0,
      encodedBodySize: finiteNumber(item.encodedBodySize) ?? 0,
      decodedBodySize: finiteNumber(item.decodedBodySize) ?? 0
    }];
  });
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
