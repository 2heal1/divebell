const PERFORMANCE_KEY = "__DIVEBELL_MF_MODULE_PERFORMANCE__";
const PERFORMANCE_PLUGIN_NAME = "divebell-module-performance";

import type { ModulePerformanceBrowserSnapshot } from "./types.js";

export function createModulePerformanceInitScript(): string {
  return `(${installModulePerformance.toString()})(${JSON.stringify({
    key: PERFORMANCE_KEY,
    maxInteractions: 50,
    maxLoads: 500,
    maxRenders: 300,
    maxResources: 1_000,
    pluginName: PERFORMANCE_PLUGIN_NAME
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
  if (!["provisional", "final", "not-observed"].includes(
    String(value.page.lcpStatus)
  )) return false;
  return Array.isArray(value.page.interactions) &&
    value.page.interactions.length <= 50 &&
    value.page.interactions.every((item) =>
      isRecord(item) && optionalString(item.type, 40) &&
      item.type !== undefined && finite(item.time)
    ) &&
    Array.isArray(value.resources) && value.resources.length <= 1_000 &&
    value.resources.every(isResource) &&
    Array.isArray(value.exposes) && value.exposes.length <= 500 &&
    value.exposes.every(isExpose) &&
    Array.isArray(value.loads) && value.loads.length <= 500 &&
    value.loads.every(isLoad) &&
    Array.isArray(value.renders) && value.renders.length <= 300 &&
    value.renders.every(isRender);
}

function isLoad(value: unknown): boolean {
  return isRecord(value) && optionalString(value.id, 200) && value.id !== undefined &&
    optionalString(value.requestId, 300) && value.requestId !== undefined &&
    optionalString(value.instanceName, 240) && value.instanceName !== undefined &&
    optionalString(value.remote, 240) && value.remote !== undefined &&
    optionalString(value.alias, 240) && optionalString(value.expose, 240) &&
    value.expose !== undefined && isInterval(value.get) &&
    (value.factory === undefined || isInterval(value.factory)) &&
    ["success", "error", "pending"].includes(String(value.outcome));
}

function isInterval(value: unknown): boolean {
  return isRecord(value) && finite(value.start) && optionalFinite(value.end) &&
    optionalFinite(value.duration);
}

function isResource(value: unknown): boolean {
  return isRecord(value) && optionalString(value.url, 4_096) &&
    value.url !== undefined && optionalString(value.initiatorType, 80) &&
    value.initiatorType !== undefined && finite(value.start) &&
    finite(value.end) && finite(value.duration) &&
    optionalFinite(value.transferSize) && optionalFinite(value.encodedBodySize) &&
    optionalFinite(value.decodedBodySize) &&
    (value.cache === undefined ||
      ["cache-or-service-worker", "network", "unknown"]
        .includes(String(value.cache)));
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

function isRender(value: unknown): boolean {
  return isRecord(value) && optionalString(value.id, 200) && value.id !== undefined &&
    optionalString(value.instanceName, 240) && value.instanceName !== undefined &&
    optionalString(value.instanceVersion, 120) &&
    optionalString(value.moduleName, 240) && optionalString(value.remote, 240) &&
    optionalString(value.expose, 240) && optionalString(value.firstContentElement, 200) &&
    (value.containsLcpElement === undefined ||
      typeof value.containsLcpElement === "boolean") && finite(value.start) &&
    optionalFinite(value.end) && optionalFinite(value.duration) &&
    optionalFinite(value.firstContent) &&
    optionalFinite(value.firstContentDuration) &&
    ["react", "vue", "unknown"].includes(String(value.framework)) &&
    ["waiting-for-content", "content-observed", "render-returned", "destroyed"]
      .includes(String(value.status));
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
  maxInteractions: number;
  maxLoads: number;
  maxRenders: number;
  maxResources: number;
  pluginName: string;
}): void {
  const root = globalThis as Record<string, any>;
  if (root[options.key]?.schemaVersion === 1 &&
      typeof root[options.key]?.snapshot === "function") return;

  const performance = root.performance;
  const timeOrigin = typeof performance?.timeOrigin === "number"
    ? performance.timeOrigin
    : Date.now();
  const now = () => typeof performance?.now === "function"
    ? performance.now()
    : Math.max(0, Date.now() - timeOrigin);
  const epoch = (time: number) => timeOrigin + time;
  const relative = (time: number) => Math.max(0, time - timeOrigin);
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

  let fp: number | undefined;
  let fcp: number | undefined;
  let lcp: number | undefined;
  let lcpElement: any;
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
    lcpElement = entry.element;
  });
  try {
    performance?.setResourceTimingBufferSize?.(options.maxResources);
  } catch {
    // Reading remains useful with the browser's default resource buffer.
  }

  const interactions: Array<{ type: string; time: number }> = [];
  const recordInteraction = (event: any) => {
    interactions.push({
      type: safeText(event?.type, 40) ?? "input",
      time: now()
    });
    if (interactions.length > options.maxInteractions) {
      interactions.splice(0, interactions.length - options.maxInteractions);
    }
  };
  for (const type of ["pointerdown", "keydown", "touchstart", "mousedown"]) {
    try {
      root.addEventListener?.(type, recordInteraction, {
        capture: true,
        passive: true
      });
    } catch {
      // Non-DOM runtime.
    }
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
              lcpElement = entry.element;
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

  const loads: any[] = [];
  const renders: any[] = [];
  const byContext = new WeakMap<object, any>();
  const byRoot = new WeakMap<object, any>();
  let loadSequence = 0;
  let sequence = 0;
  const isElement = (value: any) =>
    value !== null && typeof value === "object" && value.nodeType === 1;
  const visible = (element: any) => {
    try {
      const style = root.getComputedStyle?.(element);
      if (style?.display === "none" || style?.visibility === "hidden" ||
          style?.opacity === "0") return false;
      const rect = element.getBoundingClientRect?.();
      return rect === undefined || rect.width > 0 || rect.height > 0;
    } catch {
      return true;
    }
  };
  const hasBackgroundImage = (element: any) => {
    try {
      const image = root.getComputedStyle?.(element)?.backgroundImage;
      return typeof image === "string" && image !== "none" && image.length > 0;
    } catch {
      return false;
    }
  };
  const findContent = (value: any): any => {
    const element = isElement(value) ? value : value?.parentElement;
    if (!isElement(element)) return undefined;
    const tag = String(element.tagName ?? "").toLowerCase();
    if (["script", "style", "link", "meta", "title", "noscript"]
      .includes(tag) || !visible(element)) return undefined;
    if (["img", "picture", "svg", "canvas", "video", "object"].includes(tag) ||
        hasBackgroundImage(element) ||
        String(element.textContent ?? "").trim().length > 0) return element;
    for (const child of Array.from(element.children ?? [])) {
      const match = findContent(child);
      if (match) return match;
    }
    return undefined;
  };
  const describeElement = (element: any) => {
    const tag = String(element?.tagName ?? "element").toLowerCase();
    const id = typeof element?.id === "string" && element.id.length > 0
      ? `#${element.id.slice(0, 80)}`
      : "";
    const classes = typeof element?.className === "string"
      ? element.className.trim().split(/\s+/).filter(Boolean).slice(0, 2)
        .map((item: string) => `.${item.slice(0, 60)}`).join("")
      : "";
    return `${tag}${id}${classes}`.slice(0, 200);
  };
  const finishContent = (record: any, element: any) => {
    if (record.firstContent !== undefined) return;
    const finished = now();
    record.firstContent = epoch(finished);
    record.firstContentDuration = Math.max(0, finished - record.startedMonotonic);
    record.firstContentElement = describeElement(element);
    record.status = "content-observed";
    record.observer?.disconnect?.();
  };
  const startContentObserver = (record: any, target: any) => {
    const Observer = root.MutationObserver;
    if (typeof Observer !== "function") return;
    try {
      const observer = new Observer((mutations: any[]) => {
        for (const mutation of mutations) {
          for (const node of Array.from(mutation.addedNodes ?? [])) {
            const content = findContent(node);
            if (content) {
              finishContent(record, content);
              return;
            }
          }
          const content = findContent(mutation.target);
          if (content) {
            finishContent(record, content);
            return;
          }
        }
      });
      observer.observe(target, {
        childList: true,
        subtree: true,
        characterData: true
      });
      record.observer = observer;
    } catch {
      // The target stopped being observable.
    }
  };
  const appendRender = (record: any) => {
    renders.push(record);
    if (renders.length <= options.maxRenders) return;
    const removed = renders.splice(0, renders.length - options.maxRenders);
    for (const item of removed) item.observer?.disconnect?.();
  };
  const appendLoad = (record: any) => {
    loads.push(record);
    if (loads.length > options.maxLoads) {
      loads.splice(0, loads.length - options.maxLoads);
    }
  };
  const loadKey = (args: any) =>
    `${String(args?.id ?? "unknown")}\u0000${String(args?.expose ?? "unknown")}`;
  const pendingLoad = (instance: any, args: any) => {
    const key = loadKey(args);
    return [...loads].reverse().find((record) =>
      record.instanceRef === instance && record.key === key &&
      record.outcome === "pending"
    );
  };
  const createHooks = (instance: any) => ({
    beforeGetExpose(args: any) {
      const remote = safeText(args?.moduleInfo?.name, 240);
      const expose = safeText(args?.expose, 240);
      const requestId = safeText(args?.id, 300);
      if (remote === undefined || expose === undefined || requestId === undefined) {
        return;
      }
      const started = now();
      loadSequence += 1;
      appendLoad({
        id: `module-load-${loadSequence}`,
        key: loadKey(args),
        instanceRef: instance,
        requestId,
        instanceName: String(instance?.options?.name ?? instance?.name ?? "unknown")
          .slice(0, 240),
        remote,
        ...(safeText(args?.moduleInfo?.alias, 240) === undefined
          ? {}
          : { alias: safeText(args.moduleInfo.alias, 240) }),
        expose: expose.startsWith("./")
          ? expose
          : `./${expose.replace(/^\//, "")}`,
        get: { start: epoch(started) },
        outcome: "pending"
      });
    },
    afterGetExpose(args: any) {
      const record = pendingLoad(instance, args);
      if (!record || record.get.end !== undefined) return;
      const finished = now();
      record.get.end = epoch(finished);
      record.get.duration = Math.max(0, finished - relative(record.get.start));
      if (args?.error !== undefined) record.outcome = "error";
    },
    beforeExecuteFactory(args: any) {
      const record = pendingLoad(instance, args);
      if (!record) return;
      record.factory = { start: epoch(now()) };
    },
    afterExecuteFactory(args: any) {
      const record = pendingLoad(instance, args);
      if (!record) return;
      const finished = now();
      if (record.factory !== undefined) {
        record.factory.end = epoch(finished);
        record.factory.duration = Math.max(
          0,
          finished - relative(record.factory.start)
        );
      }
      record.outcome = args?.error === undefined ? "success" : "error";
    },
    beforeBridgeRender(args: any, context: any) {
      const target = args?.dom;
      if (context?.side !== "producer" || context?.operation !== "render" ||
          !isElement(target)) return args;
      const startedMonotonic = now();
      sequence += 1;
      const record = {
        id: `module-render-${sequence}`,
        instanceName: String(instance?.options?.name ?? instance?.name ?? "unknown")
          .slice(0, 240),
        ...(safeText(instance?.options?.version, 120) === undefined
          ? {}
          : { instanceVersion: safeText(instance.options.version, 120) }),
        ...(safeText(args?.moduleName ?? context?.moduleName, 240) === undefined
          ? {}
          : { moduleName: safeText(args?.moduleName ?? context?.moduleName, 240) }),
        ...(safeText(context?.remote ?? args?.remote, 240) === undefined
          ? {}
          : { remote: safeText(context?.remote ?? args?.remote, 240) }),
        ...(safeText(context?.expose ?? args?.expose, 240) === undefined
          ? {}
          : { expose: safeText(context?.expose ?? args?.expose, 240) }),
        framework: context?.framework === "react" || context?.framework === "vue"
          ? context.framework
          : "unknown",
        start: epoch(startedMonotonic),
        startedMonotonic,
        contextRef: context && typeof context === "object" ? context : undefined,
        targetRef: target,
        status: "waiting-for-content"
      };
      appendRender(record);
      if (record.contextRef) byContext.set(record.contextRef, record);
      byRoot.set(target, record);
      startContentObserver(record, target);
      return args;
    },
    afterBridgeRender(args: any, result: any) {
      const context = result?.context;
      const target = args?.dom;
      const record = context && typeof context === "object"
        ? byContext.get(context)
        : isElement(target)
          ? byRoot.get(target)
          : undefined;
      if (!record) return args;
      const finished = now();
      record.end = epoch(finished);
      record.duration = Math.max(0, finished - record.startedMonotonic);
      if (record.firstContent === undefined) record.status = "render-returned";
      return args;
    },
    beforeBridgeDestroy(args: any) {
      const target = args?.dom;
      const record = isElement(target) ? byRoot.get(target) : undefined;
      if (record && record.firstContent === undefined) {
        record.status = "destroyed";
        record.observer?.disconnect?.();
      }
      return args;
    }
  });

  const federation = root.__FEDERATION__ ?? root.__VMOK__ ?? {};
  if (root.__FEDERATION__ === undefined) root.__FEDERATION__ = federation;
  if (root.__VMOK__ === undefined) root.__VMOK__ = federation;
  federation.__GLOBAL_PLUGIN__ ??= [];
  if (Array.isArray(federation.__GLOBAL_PLUGIN__) &&
      !federation.__GLOBAL_PLUGIN__.some((plugin: any) =>
        plugin?.name === options.pluginName
      )) {
    federation.__GLOBAL_PLUGIN__.push({
      name: options.pluginName,
      apply: createHooks
    });
  }

  const readResources = () => {
    let entries: any[] = [];
    try {
      entries = performance?.getEntriesByType?.("resource") ?? [];
    } catch {
      return [];
    }
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
      return [{
        url,
        initiatorType: safeText(entry.initiatorType, 80) ?? "unknown",
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
      return {
        schemaVersion: 1,
        installedAt: this.installedAt,
        page: {
          timeOrigin,
          url: safeUrl(root.location?.href) ?? "",
          ...(fp === undefined ? {} : { fp }),
          ...(fcp === undefined ? {} : { fcp }),
          ...(lcp === undefined ? {} : { lcp }),
          lcpStatus: lcp === undefined
            ? "not-observed"
            : lcpFinal || documentHidden
              ? "final"
              : "provisional",
          interactions: interactions.map((item) => ({ ...item }))
        },
        resources: readResources(),
        exposes: readExposes(),
        loads: loads.map((record) => ({
          id: record.id,
          requestId: record.requestId,
          instanceName: record.instanceName,
          remote: record.remote,
          ...(record.alias === undefined ? {} : { alias: record.alias }),
          expose: record.expose,
          get: {
            start: relative(record.get.start),
            ...(record.get.end === undefined
              ? {}
              : { end: relative(record.get.end) }),
            ...(record.get.duration === undefined
              ? {}
              : { duration: record.get.duration })
          },
          ...(record.factory === undefined
            ? {}
            : {
                factory: {
                  start: relative(record.factory.start),
                  ...(record.factory.end === undefined
                    ? {}
                    : { end: relative(record.factory.end) }),
                  ...(record.factory.duration === undefined
                    ? {}
                    : { duration: record.factory.duration })
                }
              }),
          outcome: record.outcome
        })),
        renders: renders.map((record) => ({
          id: record.id,
          instanceName: record.instanceName,
          ...(record.instanceVersion === undefined
            ? {}
            : { instanceVersion: record.instanceVersion }),
          ...(record.moduleName === undefined ? {} : { moduleName: record.moduleName }),
          ...(record.remote === undefined ? {} : { remote: record.remote }),
          ...(record.expose === undefined ? {} : { expose: record.expose }),
          framework: record.framework,
          start: relative(record.start),
          ...(record.end === undefined ? {} : { end: relative(record.end) }),
          ...(record.duration === undefined ? {} : { duration: record.duration }),
          ...(record.firstContent === undefined
            ? {}
            : { firstContent: relative(record.firstContent) }),
          ...(record.firstContentDuration === undefined
            ? {}
            : { firstContentDuration: record.firstContentDuration }),
          ...(record.firstContentElement === undefined
            ? {}
            : { firstContentElement: record.firstContentElement }),
          ...(lcpElement === undefined || !isElement(record.targetRef)
            ? {}
            : {
                containsLcpElement: record.targetRef === lcpElement ||
                  record.targetRef.contains?.(lcpElement) === true
              }),
          status: record.status
        }))
      };
    }
  };
}
