const PERFORMANCE_KEY = "__DIVEBELL_MF_MODULE_PERFORMANCE__";

import type { ModulePerformanceBrowserSnapshot } from "./types.js";

export function createModulePerformanceInitScript(): string {
  return `(${installModulePerformance.toString()})(${JSON.stringify({
    key: PERFORMANCE_KEY,
    maxResources: 1_000
  })});`;
}

export function createReadModulePerformanceScript(): string {
  return [
    "(() => {",
    `  const collector = globalThis[${JSON.stringify(PERFORMANCE_KEY)}];`,
    "  return collector && typeof collector.snapshot === 'function'",
    "    ? collector.snapshot()",
    "    : null;",
    "})()"
  ].join("\n");
}

export async function readModulePerformanceSnapshot(
  browser: { eval<T = unknown>(script: string): Promise<T> }
): Promise<ModulePerformanceBrowserSnapshot | null> {
  const value = await browser.eval<unknown>(createReadModulePerformanceScript());
  return isModulePerformanceBrowserSnapshot(value) ? value : null;
}

export function isModulePerformanceBrowserSnapshot(
  value: unknown
): value is ModulePerformanceBrowserSnapshot {
  if (!isRecord(value) || value.schemaVersion !== 1) return false;
  if (!finite(value.installedAt) || !isRecord(value.page)) return false;
  if (!finite(value.page.timeOrigin) || !optionalString(value.page.url, 4_096) ||
      value.page.url === undefined) {
    return false;
  }
  if (!optionalFinite(value.page.fp) || !optionalFinite(value.page.fcp) ||
      !optionalFinite(value.page.lcp)) return false;
  if (value.page.document !== undefined && !isDocumentTiming(
    value.page.document
  )) return false;
  if (!["provisional", "final", "not-observed"].includes(
    String(value.page.lcpStatus)
  )) return false;
  return Array.isArray(value.resources) && value.resources.length <= 1_000 &&
    value.resources.every(isResource) &&
    Array.isArray(value.exposes) && value.exposes.length <= 500 &&
    value.exposes.every(isExpose);
}

function isResource(value: unknown): boolean {
  return isRecord(value) && optionalString(value.url, 4_096) &&
    value.url !== undefined && optionalString(value.initiatorType, 80) &&
    value.initiatorType !== undefined && finite(value.start) &&
    finite(value.end) && finite(value.duration) &&
    (value.declarations === undefined || (
      Array.isArray(value.declarations) && value.declarations.length <= 3 &&
      value.declarations.every((item: unknown) =>
        ["script", "preload", "modulepreload"].includes(String(item))
      )
    )) &&
    optionalFinite(value.transferSize) && optionalFinite(value.encodedBodySize) &&
    optionalFinite(value.decodedBodySize) &&
    (value.cache === undefined ||
      ["cache-or-service-worker", "network", "unknown"]
        .includes(String(value.cache)));
}

function isDocumentTiming(value: unknown): boolean {
  return isRecord(value) && finite(value.start) && finite(value.end) &&
    finite(value.duration) && optionalFinite(value.responseStart);
}

function isExpose(value: unknown): boolean {
  return isRecord(value) && optionalString(value.key, 300) &&
    value.key !== undefined && optionalString(value.name, 240) &&
    optionalString(value.version, 120) && optionalString(value.publicPath, 4_096) &&
    optionalString(value.remoteEntry, 4_096) &&
    optionalString(value.expose, 240) && value.expose !== undefined &&
    isRecord(value.js) &&
    stringArray(value.js.sync) && stringArray(value.js.async);
}

function stringArray(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 200 &&
    value.every((item) => optionalString(item, 4_096) && item !== undefined);
}

function optionalString(value: unknown, maxLength: number): boolean {
  return value === undefined ||
    (typeof value === "string" && value.length <= maxLength);
}

function optionalFinite(value: unknown): boolean {
  return value === undefined || finite(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function installModulePerformance(options: {
  key: string;
  maxResources: number;
}): void {
  const root = globalThis as Record<string, any>;
  if (root[options.key]?.schemaVersion === 1 &&
      typeof root[options.key]?.snapshot === "function") return;

  const performance = root.performance;
  const timeOrigin = typeof performance?.timeOrigin === "number"
    ? performance.timeOrigin
    : Date.now();
  const finiteNumber = (value: any) =>
    typeof value === "number" && Number.isFinite(value);
  const safeText = (value: any, limit = 240) =>
    typeof value === "string" && value.length > 0
      ? value.slice(0, limit)
      : undefined;
  const safeUrl = (value: any) => {
    const text = safeText(value, 4_096);
    if (text === undefined) return undefined;
    try {
      const url = new URL(text, root.location?.href);
      url.username = "";
      url.password = "";
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch {
      return text.replace(/[?#].*$/, "");
    }
  };
  const safeAsset = (value: any) => {
    const text = safeText(value, 4_096);
    if (text === undefined) return undefined;
    if (/^(?:https?:)?\/\//i.test(text)) return safeUrl(text);
    return text.replace(/[?#].*$/, "");
  };
  const uniqueAssets = (value: any) => Array.isArray(value)
    ? Array.from(new Set(value.map((item) => safeAsset(item))
      .filter((item): item is string => item !== undefined))).slice(0, 200)
    : [];

  const readDocumentTiming = () => {
    let navigation: any;
    try {
      navigation = performance?.getEntriesByType?.("navigation")?.[0];
    } catch {
      return undefined;
    }
    if (navigation === undefined || !finiteNumber(navigation.responseEnd)) {
      return undefined;
    }
    const start = finiteNumber(navigation.fetchStart)
      ? navigation.fetchStart
      : finiteNumber(navigation.startTime)
        ? navigation.startTime
        : 0;
    const end = Math.max(start, navigation.responseEnd);
    return {
      start: Math.max(0, start),
      ...(finiteNumber(navigation.responseStart)
        ? { responseStart: Math.max(0, navigation.responseStart) }
        : {}),
      end,
      duration: Math.max(0, end - start)
    };
  };

  const readResourceDeclarations = () => {
    const declarations = new Map<string, Set<string>>();
    const add = (value: any, declaration: string) => {
      const url = safeUrl(value);
      if (url === undefined) return;
      const current = declarations.get(url) ?? new Set<string>();
      current.add(declaration);
      declarations.set(url, current);
    };
    try {
      for (const script of Array.from(root.document?.scripts ?? [])) {
        add((script as any)?.src, "script");
      }
      for (const link of Array.from(
        root.document?.querySelectorAll?.("link[rel][href]") ?? []
      )) {
        const element = link as any;
        const relations = String(element?.rel ?? "").toLowerCase()
          .split(/\s+/).filter(Boolean);
        if (relations.includes("modulepreload")) {
          add(element.href, "modulepreload");
        }
        if (relations.includes("preload") &&
            String(element?.as ?? "").toLowerCase() === "script") {
          add(element.href, "preload");
        }
      }
    } catch {
      // DOM declarations are optional evidence.
    }
    return declarations;
  };

  let fp: number | undefined;
  let fcp: number | undefined;
  let lcp: number | undefined;
  let lcpFinal = false;
  const observers: any[] = [];
  const observe = (type: string, callback: (entry: any) => void) => {
    const Observer = root.PerformanceObserver;
    if (typeof Observer !== "function") return;
    try {
      const observer = new Observer((list: any) => {
        for (const entry of list.getEntries()) callback(entry);
      });
      observer.observe({ type, buffered: true });
      observers.push(observer);
    } catch {
      // The browser does not implement this entry type.
    }
  };
  observe("paint", (entry) => {
    if (entry.name === "first-paint" && fp === undefined) fp = entry.startTime;
    if (entry.name === "first-contentful-paint" && fcp === undefined) {
      fcp = entry.startTime;
    }
  });
  observe("largest-contentful-paint", (entry) => {
    if (lcpFinal) return;
    lcp = entry.startTime;
  });
  try {
    performance?.setResourceTimingBufferSize?.(options.maxResources);
  } catch {
    // Reading remains useful with the browser's default resource buffer.
  }

  try {
    root.document?.addEventListener?.("visibilitychange", () => {
      if (root.document?.visibilityState !== "hidden") return;
      lcpFinal = lcp !== undefined;
      for (const observer of observers) {
        try {
          for (const entry of observer.takeRecords?.() ?? []) {
            if (entry.entryType === "largest-contentful-paint") {
              lcp = entry.startTime;
            }
          }
        } catch {
          // Ignore observer shutdown races.
        }
      }
    }, { capture: true });
  } catch {
    // Non-DOM runtime.
  }

  const readResources = () => {
    let entries: any[] = [];
    try {
      entries = performance?.getEntriesByType?.("resource") ?? [];
    } catch {
      return [];
    }
    const declarations = readResourceDeclarations();
    return entries.slice(-options.maxResources).flatMap((entry) => {
      const url = safeUrl(entry?.name);
      if (url === undefined || !finiteNumber(entry?.startTime) ||
          !finiteNumber(entry?.duration)) return [];
      const transferSize = finiteNumber(entry.transferSize)
        ? entry.transferSize
        : undefined;
      const encodedBodySize = finiteNumber(entry.encodedBodySize)
        ? entry.encodedBodySize
        : undefined;
      const decodedBodySize = finiteNumber(entry.decodedBodySize)
        ? entry.decodedBodySize
        : undefined;
      const hasBodySize = (encodedBodySize ?? 0) > 0 ||
        (decodedBodySize ?? 0) > 0;
      const cache = transferSize === 0 && hasBodySize
        ? "cache-or-service-worker"
        : transferSize !== undefined && transferSize > 0
          ? "network"
          : undefined;
      const declaredAs = url === undefined
        ? undefined
        : declarations.get(url);
      return [{
        url,
        initiatorType: safeText(entry.initiatorType, 80) ?? "unknown",
        ...(declaredAs === undefined || declaredAs.size === 0
          ? {}
          : { declarations: Array.from(declaredAs).sort() }),
        start: Math.max(0, entry.startTime),
        end: Math.max(0, entry.responseEnd ?? entry.startTime + entry.duration),
        duration: Math.max(0, entry.duration),
        ...(transferSize === undefined ||
          (transferSize === 0 && !hasBodySize)
          ? {}
          : { transferSize }),
        ...(encodedBodySize === undefined || encodedBodySize === 0
          ? {}
          : { encodedBodySize }),
        ...(decodedBodySize === undefined || decodedBodySize === 0
          ? {}
          : { decodedBodySize }),
        ...(cache === undefined ? {} : { cache })
      }];
    });
  };
  const readExposes = () => {
    const moduleInfo = root.__FEDERATION__?.moduleInfo;
    if (moduleInfo === null || typeof moduleInfo !== "object" ||
        Array.isArray(moduleInfo)) return [];
    const exposes: any[] = [];
    for (const [rawKey, value] of Object.entries(moduleInfo).slice(0, 200)) {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        continue;
      }
      const info = value as Record<string, any>;
      if (!Array.isArray(info.modules)) continue;
      const key = safeText(rawKey, 300);
      if (key === undefined) continue;
      const name = safeText(info.name, 240) ??
        safeText(rawKey.split(":")[0], 240);
      const version = safeText(info.version, 120) ??
        safeText(rawKey.includes(":") ? rawKey.split(":").slice(1).join(":") : undefined, 120);
      const publicPath = safeUrl(info.publicPath);
      const remoteEntry = safeAsset(info.remoteEntry);
      for (const module of info.modules.slice(0, 500)) {
        if (module === null || typeof module !== "object" ||
            Array.isArray(module)) continue;
        const expose = safeText(module.moduleName ?? module.modulePath, 240);
        if (expose === undefined) continue;
        const assets = module.assets;
        const js = assets && typeof assets === "object" && !Array.isArray(assets)
          ? assets.js
          : undefined;
        exposes.push({
          key,
          ...(name === undefined ? {} : { name }),
          ...(version === undefined ? {} : { version }),
          ...(publicPath === undefined ? {} : { publicPath }),
          ...(remoteEntry === undefined ? {} : { remoteEntry }),
          expose: expose.startsWith("./") ? expose : `./${expose.replace(/^\//, "")}`,
          js: {
            sync: uniqueAssets(js?.sync),
            async: uniqueAssets(js?.async)
          }
        });
      }
    }
    return exposes.slice(0, 500);
  };

  root[options.key] = {
    schemaVersion: 1,
    installedAt: Date.now(),
    snapshot() {
      const documentHidden = root.document?.visibilityState === "hidden";
      const documentTiming = readDocumentTiming();
      return {
        schemaVersion: 1,
        installedAt: this.installedAt,
        page: {
          timeOrigin,
          url: safeUrl(root.location?.href) ?? "",
          ...(documentTiming === undefined
            ? {}
            : { document: documentTiming }),
          ...(fp === undefined ? {} : { fp }),
          ...(fcp === undefined ? {} : { fcp }),
          ...(lcp === undefined ? {} : { lcp }),
          lcpStatus: lcp === undefined
            ? "not-observed"
            : lcpFinal || documentHidden
              ? "final"
              : "provisional"
        },
        resources: readResources(),
        exposes: readExposes()
      };
    }
  };
}
