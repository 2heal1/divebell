import type {
  DivebellBrowserApi,
  DivebellBrowserMemoryMetricsResult,
  ParsedCliArgs
} from "@divebell/cli";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type {
  CodeUsageExperienceCaptureOptions,
  CodeUsageExperienceCaptureResult,
  CodeUsageExperiencePhase,
  CodeUsageReadyResult,
  CodeUsageReadySpec
} from "./types.js";

const DEFAULT_READY_SPEC: CodeUsageReadySpec = {
  kind: "heuristic",
  algorithm: "page-stable",
  version: 2,
  quietWindowMs: 500,
  maxInflightRequests: 2,
  initialNetworkDrainTimeoutMs: 10_000,
  timeoutMs: 30_000
};

export function createPageExperienceInitScript(
  spec: CodeUsageReadySpec = DEFAULT_READY_SPEC,
  selectedBy: CodeUsageReadyResult["selectedBy"] = "tool-default"
): string {
  const config = JSON.stringify({ spec, selectedBy });
  return `(() => {
  const config = ${config};
  const samples = [];
  const observedResources = [];
  let memorySampleAttempts = 0;
  let memorySamplingReason = "not attempted";
  let ready = null;
  let resolveReady;
  const restoreNetworkHooks = [];
  const readyPromise = new Promise((resolve) => { resolveReady = resolve; });
  const specId = (() => {
    const spec = config.spec;
    if (spec.kind === "heuristic") {
      const network = spec.version >= 2
        ? ":max-inflight=" + spec.maxInflightRequests + ":initial-drain=" + spec.initialNetworkDrainTimeoutMs
        : "";
      return "page-stable@" + spec.version + ":quiet=" + spec.quietWindowMs + network + ":timeout=" + spec.timeoutMs;
    }
    if (spec.kind === "selector") return "selector:visible:" + spec.selector;
    return spec.kind + ":" + spec.name;
  })();
  const finishReady = (status, endTimeMs, reason) => {
    if (ready) return;
    ready = {
      spec: config.spec,
      specId,
      selectedBy: config.selectedBy,
      confidence: config.spec.kind === "heuristic" ? "inferred" : config.spec.kind === "selector" ? "medium" : "high",
      status,
      startTimeMs: config.spec.kind === "measure" ? Math.max(0, endTimeMs - (performance.getEntriesByName(config.spec.name, "measure").at(-1)?.duration || 0)) : 0,
      endTimeMs,
      durationMs: config.spec.kind === "measure" ? (performance.getEntriesByName(config.spec.name, "measure").at(-1)?.duration || endTimeMs) : endTimeMs,
      reason
    };
    for (const restore of restoreNetworkHooks.splice(0)) restore();
    resolveReady(ready);
  };
  const findExplicitReady = () => {
    const spec = config.spec;
    if (spec.kind === "mark") {
      const entry = performance.getEntriesByName(spec.name, "mark").at(-1);
      if (entry) finishReady("ready", entry.startTime, "performance mark observed");
      return;
    }
    if (spec.kind === "measure") {
      const entry = performance.getEntriesByName(spec.name, "measure").at(-1);
      if (entry) finishReady("ready", entry.startTime + entry.duration, "performance measure observed");
      return;
    }
    if (spec.kind === "selector") {
      const element = document.querySelector(spec.selector);
      if (!element) return;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0) {
        finishReady("ready", performance.now(), "visible selector observed");
      }
    }
  };
  const readMemory = () => {
    memorySampleAttempts += 1;
    const memory = performance.memory;
    if (!memory) {
      memorySamplingReason = "performance.memory unavailable";
      return;
    }
    if (!Number.isFinite(memory.usedJSHeapSize)) {
      memorySamplingReason = "usedJSHeapSize was not finite";
      return;
    }
    memorySamplingReason = "sampled";
    samples.push({
      timeMs: performance.now(),
      usedBytes: memory.usedJSHeapSize,
      totalBytes: Number.isFinite(memory.totalJSHeapSize) ? memory.totalJSHeapSize : null
    });
  };
  readMemory();
  const timer = setInterval(readMemory, 25);
  let observer;
  let resourceObserver;
  let mutationObserver;
  let stabilityTimer;
  let timeoutTimer;
  resourceObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType !== "resource") continue;
      observedResources.push(entry);
      if (observedResources.length > 1000) observedResources.shift();
    }
  });
  try { resourceObserver.observe({ type: "resource", buffered: true }); } catch {}
  if (config.spec.kind === "heuristic") {
    const maxInflightRequests = config.spec.version >= 2
      ? config.spec.maxInflightRequests
      : 0;
    const initialNetworkDrainTimeoutMs = config.spec.version >= 2
      ? config.spec.initialNetworkDrainTimeoutMs
      : config.spec.timeoutMs;
    let domContentLoadedTime = document.readyState === "loading" ? null : performance.now();
    let firstContentfulPaintTime = performance.getEntriesByName("first-contentful-paint").at(-1)?.startTime ?? null;
    let lastActivityTime = performance.now();
    let criticalRequestsInFlight = 0;
    let renderRequestsInFlight = 0;
    let networkDrainedAfterDomContentLoaded = false;
    let requestsStartedAfterDomContentLoaded = 0;
    const noteActivity = (time = performance.now()) => { lastActivityTime = Math.max(lastActivityTime, time); };
    const isRenderResourceUrl = (value) => typeof value === "string"
      && /\.(?:m?js|css|wasm)(?:[?#]|$)/i.test(value);
    const beginCriticalRequest = (renderBlocking = false) => {
      criticalRequestsInFlight += 1;
      if (domContentLoadedTime !== null) {
        requestsStartedAfterDomContentLoaded += 1;
        networkDrainedAfterDomContentLoaded = false;
      }
      if (renderBlocking) {
        renderRequestsInFlight += 1;
        noteActivity();
      }
      let completed = false;
      return () => {
        if (completed) return;
        completed = true;
        criticalRequestsInFlight = Math.max(0, criticalRequestsInFlight - 1);
        if (domContentLoadedTime !== null
          && requestsStartedAfterDomContentLoaded > 0
          && criticalRequestsInFlight === 0) {
          networkDrainedAfterDomContentLoaded = true;
          noteActivity();
        }
        if (renderBlocking) {
          renderRequestsInFlight = Math.max(0, renderRequestsInFlight - 1);
          noteActivity();
        }
      };
    };
    if (typeof globalThis.fetch === "function") {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = function(...args) {
        const input = args[0];
        const requestUrl = typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input?.url;
        const complete = beginCriticalRequest(isRenderResourceUrl(requestUrl));
        try {
          return Reflect.apply(originalFetch, this, args).then(
            (value) => { complete(); return value; },
            (error) => { complete(); throw error; }
          );
        } catch (error) {
          complete();
          throw error;
        }
      };
      restoreNetworkHooks.push(() => { globalThis.fetch = originalFetch; });
    }
    if (typeof globalThis.XMLHttpRequest === "function") {
      const requestUrls = new WeakMap();
      const originalOpen = globalThis.XMLHttpRequest.prototype.open;
      const originalSend = globalThis.XMLHttpRequest.prototype.send;
      globalThis.XMLHttpRequest.prototype.open = function(method, url, ...args) {
        requestUrls.set(this, String(url));
        return Reflect.apply(originalOpen, this, [method, url, ...args]);
      };
      globalThis.XMLHttpRequest.prototype.send = function(...args) {
        const complete = beginCriticalRequest(isRenderResourceUrl(requestUrls.get(this)));
        this.addEventListener("loadend", complete, { once: true });
        try {
          return Reflect.apply(originalSend, this, args);
        } catch (error) {
          complete();
          throw error;
        }
      };
      restoreNetworkHooks.push(() => {
        globalThis.XMLHttpRequest.prototype.open = originalOpen;
        globalThis.XMLHttpRequest.prototype.send = originalSend;
      });
    }
    const trackDynamicScript = (node) => {
      if (domContentLoadedTime === null || !(node instanceof HTMLScriptElement) || !node.src) return;
      const completedEntry = performance.getEntriesByName(node.src, "resource").at(-1);
      if (completedEntry?.responseEnd > 0) {
        noteActivity(completedEntry.responseEnd);
        return;
      }
      const complete = beginCriticalRequest(true);
      node.addEventListener("load", complete, { once: true });
      node.addEventListener("error", complete, { once: true });
    };
    if (domContentLoadedTime === null) {
      document.addEventListener("DOMContentLoaded", () => {
        domContentLoadedTime = performance.now();
        requestsStartedAfterDomContentLoaded = 0;
        networkDrainedAfterDomContentLoaded = criticalRequestsInFlight === 0;
        noteActivity();
      }, { once: true });
    }
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === "paint" && entry.name === "first-contentful-paint") {
          firstContentfulPaintTime = entry.startTime;
        }
        if (entry.entryType === "longtask") noteActivity(entry.startTime + entry.duration);
      }
    });
    for (const type of ["paint", "longtask"]) {
      try { observer.observe({ type, buffered: true }); } catch {}
    }
    const quietResourceObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.initiatorType === "script" || isRenderResourceUrl(entry.name)) {
          noteActivity(entry.responseEnd || entry.startTime + entry.duration);
        }
      }
    });
    try { quietResourceObserver.observe({ type: "resource", buffered: true }); } catch {}
    restoreNetworkHooks.push(() => quietResourceObserver.disconnect());
    mutationObserver = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes || []) {
          trackDynamicScript(node);
          if (node instanceof Element) node.querySelectorAll("script[src]").forEach(trackDynamicScript);
        }
      }
      if (records.some((record) => record.type !== "attributes" || ["hidden", "aria-busy"].includes(record.attributeName || ""))) {
        noteActivity();
      }
    });
    mutationObserver.observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden", "aria-busy"] });
    stabilityTimer = setInterval(() => {
      const now = performance.now();
      const paintSupported = Array.isArray(PerformanceObserver.supportedEntryTypes)
        && PerformanceObserver.supportedEntryTypes.includes("paint");
      const initialNetworkSettled = domContentLoadedTime !== null
        && (networkDrainedAfterDomContentLoaded
          || now - domContentLoadedTime >= initialNetworkDrainTimeoutMs);
      const prerequisitesReady = domContentLoadedTime !== null
        && document.documentElement !== null
        && document.body !== null
        && initialNetworkSettled
        && criticalRequestsInFlight <= maxInflightRequests
        && renderRequestsInFlight === 0
        && (!paintSupported || firstContentfulPaintTime !== null);
      if (prerequisitesReady && now - lastActivityTime >= config.spec.quietWindowMs) {
        finishReady("ready", now, paintSupported ? "FCP, DOMContentLoaded, root, initial network settled, render resources drained, network-idle-2, and render quiet window observed" : "DOMContentLoaded, root, initial network settled, render resources drained, network-idle-2, and render quiet window observed; paint timing unavailable");
      }
    }, 50);
    timeoutTimer = setTimeout(() => finishReady("timeout", performance.now(), "page-stable timeout"), config.spec.timeoutMs);
  } else {
    observer = new PerformanceObserver(findExplicitReady);
    try { observer.observe({ type: config.spec.kind === "selector" ? "resource" : config.spec.kind, buffered: true }); } catch {}
    mutationObserver = new MutationObserver(findExplicitReady);
    mutationObserver.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    const explicitPoll = setInterval(() => {
      findExplicitReady();
      if (ready) clearInterval(explicitPoll);
    }, 50);
    timeoutTimer = setTimeout(() => finishReady("timeout", performance.now(), "explicit ready target timeout"), 30_000);
    findExplicitReady();
  }
  let finished;
  globalThis.__DIVEBELL_PAGE_EXPERIENCE__ = {
    whenReady() { return readyPromise; },
    finish() {
      if (finished) return finished;
      if (!ready) return { pending: true, specId };
      clearInterval(timer);
      clearInterval(stabilityTimer);
      clearTimeout(timeoutTimer);
      observer?.disconnect();
      resourceObserver?.disconnect();
      mutationObserver?.disconnect();
      for (const restore of restoreNetworkHooks) restore();
      readMemory();
      const navigation = performance.getEntriesByType("navigation")[0];
      const readyStartTime = ready.startTimeMs || 0;
      const resourcesByKey = new Map();
      for (const entry of [...observedResources, ...performance.getEntriesByType("resource")]) {
        resourcesByKey.set(JSON.stringify([entry.name, entry.startTime, entry.responseEnd]), entry);
      }
      const resources = [...resourcesByKey.values()]
        .filter((entry) => entry.startTime <= ready.endTimeMs && entry.responseEnd >= readyStartTime)
        .slice(0, 500)
        .map((entry) => ({
          url: entry.name,
          initiatorType: entry.initiatorType || "other",
          startTimeMs: Math.max(0, entry.startTime - readyStartTime),
          responseEndMs: Math.max(0, entry.responseEnd - readyStartTime),
          durationMs: entry.duration,
          transferSize: entry.transferSize || 0,
          encodedBodySize: entry.encodedBodySize || 0,
          decodedBodySize: entry.decodedBodySize || 0
        }));
      const readySamples = samples
        .filter((sample) => sample.timeMs >= readyStartTime && sample.timeMs <= ready.endTimeMs)
        .map((sample) => ({ ...sample, timeMs: sample.timeMs - readyStartTime }));
      const atReady = readySamples.at(-1) || null;
      const peak = readySamples.reduce((result, sample) =>
        result === null || sample.usedBytes > result.usedBytes ? sample : result, null);
      const step = Math.max(1, Math.ceil(readySamples.length / 120));
      finished = {
        url: location.href,
        pathname: location.pathname,
        ready,
        readyDurationMs: ready.durationMs,
        navigation: navigation && readyStartTime === 0 ? {
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
        memorySampling: {
          api: "performance.memory",
          attempts: memorySampleAttempts,
          accepted: samples.length,
          firstTimeMs: samples[0]?.timeMs ?? null,
          lastTimeMs: samples.at(-1)?.timeMs ?? null,
          reason: memorySamplingReason
        },
        resourceSampling: {
          observed: observedResources.length,
          firstStartTimeMs: observedResources[0]?.startTime ?? null,
          lastResponseEndMs: observedResources.at(-1)?.responseEnd ?? null
        },
        memorySamples: readySamples.filter((_, index) => index % step === 0 || index === readySamples.length - 1),
        resources
      };
      return finished;
    }
  };
})();`;
}

export const PAGE_EXPERIENCE_INIT_SCRIPT = createPageExperienceInitScript();

export function openCodeUsageExperience(
  args?: ParsedCliArgs
): { scripts: string[] } | undefined {
  if (!isCodeUsageExperienceEnabled(args)) return undefined;
  const ready = readySpecFromOpenArgs(args);
  return { scripts: [createPageExperienceInitScript(ready.spec, ready.selectedBy)] };
}

export function readySpecFromOpenArgs(args?: ParsedCliArgs): {
  spec: CodeUsageReadySpec;
  selectedBy: CodeUsageReadyResult["selectedBy"];
} {
  const values = [
    ["code-usage-ready-mark", "mark"],
    ["code-usage-ready-measure", "measure"],
    ["code-usage-ready-selector", "selector"]
  ] as const;
  const selected = values.flatMap(([option, kind]) => {
    const value = args?.options.get(option)?.at(-1);
    return value === undefined ? [] : [{ option, kind, value }];
  });
  if (selected.length > 1) {
    throw new Error("Use only one of --code-usage-ready-mark, --code-usage-ready-measure, or --code-usage-ready-selector.");
  }
  const item = selected[0];
  if (item === undefined) return { spec: DEFAULT_READY_SPEC, selectedBy: "tool-default" };
  if (item.value.length === 0 || item.value === "true" || item.value === "false") {
    throw new Error(`--${item.option} requires a non-empty value.`);
  }
  if (item.kind === "selector") {
    return { spec: { kind: "selector", selector: item.value, condition: "visible" }, selectedBy: "user" };
  }
  return { spec: { kind: item.kind, name: item.value }, selectedBy: "user" };
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
  const coverage = await browser.coverage.status();
  if (coverage.active) {
    throw new Error(
      "Stop or cancel code coverage before measuring page loading and memory."
    );
  }

  const captured = await browser.eval<unknown>(
    `(async () => {
      const recorder = globalThis.__DIVEBELL_PAGE_EXPERIENCE__;
      if (!recorder || typeof recorder.finish !== "function") {
        throw new Error("Page experience recorder is missing");
      }
      if (typeof recorder.whenReady === "function") await recorder.whenReady();
      return recorder.finish();
    })()`
  );
  const readyMetrics = await readMemoryMetrics(browser);
  if (options.settleMs > 0) await delay(options.settleMs);
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
    return await browser.memory.metrics();
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
  const ready = normalizeReadyResult(value.ready);
  if (ready?.status === "timeout") {
    throw new Error(`Ready target ${JSON.stringify(ready.specId)} timed out: ${ready.reason}`);
  }
  if (value.pending === true) {
    throw new Error("Page experience recorder has not reached its ready target.");
  }
  const readyDurationMs = finiteNumber(value.readyDurationMs);
  const capturedAtReadyBytes = finiteNumber(memory.atReadyBytes);
  const capturedTotalAtReadyBytes = finiteNumber(memory.totalAtReadyBytes);
  const legacyFallback = ready === undefined;
  const atReadyBytes = capturedAtReadyBytes
    ?? (legacyFallback ? finiteNumber(readyMetrics?.jsHeapUsedSize) : null);
  const totalAtReadyBytes = capturedTotalAtReadyBytes
    ?? (legacyFallback ? finiteNumber(readyMetrics?.jsHeapTotalSize) : null);
  const peakBytes = finiteNumber(memory.peakBytes);
  return {
    schemaVersion: 2,
    label: options.label,
    url: stringValue(value.url),
    pathname: stringValue(value.pathname),
    readyTarget: options.readyTarget ?? ready?.specId ?? "page-stable@2",
    readyDurationMs,
    ...(ready === undefined ? {} : { ready }),
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
      atReadySource: capturedAtReadyBytes !== null
        ? "page-sample"
        : legacyFallback && atReadyBytes !== null
          ? "command-fallback"
          : "unavailable",
      peakBytes,
      peakTimeMs: finiteNumber(memory.peakTimeMs),
      stableBytes: finiteNumber(stableMetrics?.jsHeapUsedSize)
    },
    ...normalizeMemorySampling(value.memorySampling),
    ...normalizeResourceSampling(value.resourceSampling),
    memorySamples: normalizeMemorySamples(value.memorySamples),
    resources: normalizeResources(value.resources)
  };
}

function normalizeMemorySampling(
  value: unknown
): Pick<CodeUsageExperiencePhase, "memorySampling"> | Record<string, never> {
  if (!isRecord(value)) return {};
  const attempts = finiteNumber(value.attempts);
  const accepted = finiteNumber(value.accepted);
  if (attempts === null || accepted === null) return {};
  return {
    memorySampling: {
      api: "performance.memory",
      attempts,
      accepted,
      firstTimeMs: finiteNumber(value.firstTimeMs),
      lastTimeMs: finiteNumber(value.lastTimeMs),
      reason: stringValue(value.reason)
    }
  };
}

function normalizeResourceSampling(
  value: unknown
): Pick<CodeUsageExperiencePhase, "resourceSampling"> | Record<string, never> {
  if (!isRecord(value)) return {};
  const observed = finiteNumber(value.observed);
  if (observed === null) return {};
  return {
    resourceSampling: {
      observed,
      firstStartTimeMs: finiteNumber(value.firstStartTimeMs),
      lastResponseEndMs: finiteNumber(value.lastResponseEndMs)
    }
  };
}

function normalizeReadyResult(value: unknown): CodeUsageReadyResult | undefined {
  if (!isRecord(value) || !isRecord(value.spec)) return undefined;
  const status = value.status === "ready" || value.status === "timeout" ? value.status : null;
  const selectedBy = value.selectedBy === "user" || value.selectedBy === "tool-default" ? value.selectedBy : null;
  const confidence = value.confidence === "high" || value.confidence === "medium" || value.confidence === "inferred" ? value.confidence : null;
  const startTimeMs = finiteNumber(value.startTimeMs);
  const endTimeMs = finiteNumber(value.endTimeMs);
  const durationMs = finiteNumber(value.durationMs);
  if (status === null || selectedBy === null || confidence === null || startTimeMs === null || endTimeMs === null || durationMs === null) return undefined;
  return {
    spec: value.spec as unknown as CodeUsageReadySpec,
    specId: stringValue(value.specId),
    selectedBy,
    confidence,
    status,
    startTimeMs,
    endTimeMs,
    durationMs,
    reason: stringValue(value.reason)
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

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
