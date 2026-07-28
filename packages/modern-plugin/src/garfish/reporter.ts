import type {
  DivebellCore,
  RuntimeError
} from "@divebell/core";
import { resolveDivebell } from "../runtime/resolve-runtime.js";
import {
  modernGarfishStatuses,
  modernGarfishTargetIds,
  modernGarfishTargetTypes,
  type GarfishAppInfoLike,
  type GarfishAppInstanceLike,
  type GarfishExecOptionsLike,
  type GarfishProviderDestroyPayload,
  type GarfishProviderRenderPayload,
  type ModernGarfishStatus,
  type DivebellGarfishReporter,
  type DivebellGarfishReporterOptions,
  type DivebellGarfishUpdateDetails
} from "./types.js";

interface GarfishAppRuntimeData {
  name: string;
  status: ModernGarfishStatus;
  phase: string;
  updatedAt: number;
  lifecycle?: string;
  entry?: string;
  activeWhen?: string;
  basename?: string;
  domGetter?: string;
  cache?: boolean;
  scriptUrl?: string;
  execOptions?: {
    async?: boolean;
    defer?: boolean;
    noEntry?: boolean;
    isInline?: boolean;
    isModule?: boolean;
  };
  appInstance?: {
    appId?: string;
    mounted?: boolean;
    display?: boolean;
    active?: boolean;
  };
  provider?: {
    renderCalled?: boolean;
    renderCallCount?: number;
    destroyCalled?: boolean;
    destroyCallCount?: number;
  };
}

interface RootSnapshotData {
  apps: GarfishAppRuntimeData[];
  appCount: number;
  errorAppNames: string[];
  mountedAppNames: string[];
}

type GarfishAppRuntimeDataUpdate = Pick<GarfishAppRuntimeData, "status" | "phase" | "updatedAt"> & {
  lifecycle?: string;
  basename?: string;
  scriptUrl?: string;
  execOptions?: GarfishAppRuntimeData["execOptions"];
  appInstance?: GarfishAppRuntimeData["appInstance"];
};

export function createDivebellGarfishReporter(
  options: DivebellGarfishReporterOptions = {}
): DivebellGarfishReporter {
  return new DivebellGarfishReporterImpl(options);
}

class DivebellGarfishReporterImpl implements DivebellGarfishReporter {
  readonly #options: DivebellGarfishReporterOptions;
  readonly #source: string;
  readonly #apps = new Map<string, GarfishAppRuntimeData>();
  #runtime?: DivebellCore;

  constructor(options: DivebellGarfishReporterOptions) {
    this.#options = options;
    this.#source = options.source ?? "modern.js";
  }

  registerApp(appInfo: GarfishAppInfoLike): void {
    this.updateApp(appInfo, "registered", {
      lifecycle: "registerApp",
      phase: "register"
    });
  }

  updateApp(
    appInfo: GarfishAppInfoLike,
    status: ModernGarfishStatus,
    details: DivebellGarfishUpdateDetails = {}
  ): void {
    const name = getAppName(appInfo);
    if (name === undefined) {
      return;
    }

    const runtime = this.#getRuntime();
    const targetId = modernGarfishTargetIds.app(name);
    registerGarfishAppTarget(runtime, this.#source, name, targetId);

    const now = Date.now();
    const previous = this.#apps.get(name);
    const update: GarfishAppRuntimeDataUpdate = {
      status,
      phase: details.phase ?? status,
      updatedAt: now
    };
    if (details.lifecycle !== undefined) {
      update.lifecycle = details.lifecycle;
    }
    if (details.basename !== undefined) {
      update.basename = details.basename;
    }
    if (details.scriptUrl !== undefined) {
      update.scriptUrl = details.scriptUrl;
    }
    if (details.execOptions !== undefined) {
      update.execOptions = getExecOptionsData(details.execOptions);
    }
    if (details.appInstance !== undefined && details.appInstance !== null) {
      update.appInstance = getAppInstanceData(details.appInstance);
    }

    const next = mergeAppRuntimeData(previous, appInfo, update);
    this.#apps.set(name, next);

    runtime.updateSnapshot({
      id: targetId,
      status,
      source: this.#source,
      data: next,
      ...(details.error === undefined ? {} : { error: details.error })
    });
    this.#syncRoot(details.error);
  }

  markProviderRenderCalled(appInfo: GarfishAppInfoLike, payload?: unknown): void {
    const resolved = mergeAppInfo(appInfo, payload);
    const name = getAppName(resolved);
    if (name === undefined) {
      return;
    }

    const previous = this.#apps.get(name);
    this.#apps.set(name, {
      ...mergeAppRuntimeData(previous, resolved, {
        status: "rendering",
        phase: "provider.render",
        updatedAt: Date.now(),
        lifecycle: "customLoader.mount"
      }),
      provider: {
        ...previous?.provider,
        renderCalled: true,
        renderCallCount: (previous?.provider?.renderCallCount ?? 0) + 1
      }
    });
    this.updateApp(resolved, "rendering", {
      lifecycle: "customLoader.mount",
      phase: "provider.render"
    });
  }

  markProviderDestroyCalled(appInfo: GarfishAppInfoLike, payload?: unknown): void {
    const resolved = mergeAppInfo(appInfo, payload);
    const name = getAppName(resolved);
    if (name === undefined) {
      return;
    }

    const previous = this.#apps.get(name);
    this.#apps.set(name, {
      ...mergeAppRuntimeData(previous, resolved, {
        status: "unmounting",
        phase: "provider.destroy",
        updatedAt: Date.now(),
        lifecycle: "customLoader.unmount"
      }),
      provider: {
        ...previous?.provider,
        destroyCalled: true,
        destroyCallCount: (previous?.provider?.destroyCallCount ?? 0) + 1
      }
    });
    this.updateApp(resolved, "unmounting", {
      lifecycle: "customLoader.unmount",
      phase: "provider.destroy"
    });
  }

  #getRuntime(): DivebellCore {
    this.#runtime ??= resolveDivebell({
      ...this.#options,
      beforeConnect: (runtime) => registerGarfishRootTarget(runtime, this.#source)
    });
    registerGarfishRootTarget(this.#runtime, this.#source);
    this.#ensureRootSnapshot();
    return this.#runtime;
  }

  #ensureRootSnapshot(): void {
    const runtime = this.#runtime;
    if (runtime === undefined) {
      return;
    }

    if (runtime.getSnapshot({ id: modernGarfishTargetIds.root }).targets[modernGarfishTargetIds.root] !== undefined) {
      return;
    }

    runtime.updateSnapshot({
      id: modernGarfishTargetIds.root,
      status: "idle",
      source: this.#source,
      data: this.#getRootSnapshotData()
    });
  }

  #syncRoot(error?: RuntimeError): void {
    const runtime = this.#getRuntime();
    runtime.updateSnapshot({
      id: modernGarfishTargetIds.root,
      status: getRootStatus([...this.#apps.values()]),
      source: this.#source,
      data: this.#getRootSnapshotData(),
      ...(error === undefined ? {} : { error })
    });
  }

  #getRootSnapshotData(): RootSnapshotData {
    const apps = [...this.#apps.values()].sort((a, b) => a.name.localeCompare(b.name));
    return {
      apps,
      appCount: apps.length,
      errorAppNames: apps.filter((app) => app.status === "error").map((app) => app.name),
      mountedAppNames: apps.filter((app) => app.status === "mounted").map((app) => app.name)
    };
  }
}

export function toGarfishRuntimeError(error: unknown, code: string): RuntimeError {
  if (error instanceof Error) {
    const runtimeError: RuntimeError = {
      message: error.message,
      code
    };
    if (error.stack !== undefined) {
      runtimeError.stack = error.stack;
    }
    return runtimeError;
  }

  if (isRecord(error)) {
    const message = typeof error.message === "string" ? error.message : String(error);
    const runtimeError: RuntimeError = {
      message,
      code: typeof error.code === "string" ? error.code : code
    };
    if (typeof error.stack === "string") {
      runtimeError.stack = error.stack;
    }
    return runtimeError;
  }

  return {
    message: String(error),
    code
  };
}

function registerGarfishRootTarget(runtime: DivebellCore, source: string): void {
  runtime.registerTarget({
    id: modernGarfishTargetIds.root,
    type: modernGarfishTargetTypes.root,
    source,
    label: "Modern.js Garfish",
    description: "Aggregate Garfish sub-application runtime state.",
    statuses: [...modernGarfishStatuses]
  });
}

function registerGarfishAppTarget(
  runtime: DivebellCore,
  source: string,
  name: string,
  targetId: string
): void {
  runtime.registerTarget({
    id: targetId,
    type: modernGarfishTargetTypes.app,
    source,
    label: `Garfish app ${name}`,
    description: "Garfish sub-application runtime state.",
    statuses: [...modernGarfishStatuses],
    data: {
      name
    }
  });
}

function mergeAppRuntimeData(
  previous: GarfishAppRuntimeData | undefined,
  appInfo: GarfishAppInfoLike,
  next: GarfishAppRuntimeDataUpdate
): GarfishAppRuntimeData {
  const name = getAppName(appInfo) ?? previous?.name ?? "unknown";
  return {
    ...(previous ?? { name, status: "idle", phase: "init", updatedAt: next.updatedAt }),
    name,
    status: next.status,
    phase: next.phase,
    updatedAt: next.updatedAt,
    ...(next.lifecycle === undefined ? {} : { lifecycle: next.lifecycle }),
    ...getAppInfoData(appInfo),
    ...(next.basename === undefined ? {} : { basename: next.basename }),
    ...(next.scriptUrl === undefined ? {} : { scriptUrl: next.scriptUrl }),
    ...(next.execOptions === undefined ? {} : { execOptions: next.execOptions }),
    ...(next.appInstance === undefined ? {} : { appInstance: next.appInstance }),
    ...(previous?.provider === undefined ? {} : { provider: previous.provider })
  };
}

function getAppInfoData(appInfo: GarfishAppInfoLike): Partial<GarfishAppRuntimeData> {
  const data: Partial<GarfishAppRuntimeData> = {};
  const entry = toStringValue(appInfo.entry);
  const activeWhen = toActiveWhenValue(appInfo.activeWhen);
  const basename = toStringValue(appInfo.basename);
  const domGetter = toDomGetterValue(appInfo.domGetter);

  if (entry !== undefined) {
    data.entry = entry;
  }
  if (activeWhen !== undefined) {
    data.activeWhen = activeWhen;
  }
  if (basename !== undefined) {
    data.basename = basename;
  }
  if (domGetter !== undefined) {
    data.domGetter = domGetter;
  }
  if (typeof appInfo.cache === "boolean") {
    data.cache = appInfo.cache;
  }

  return data;
}

function getAppInstanceData(appInstance: GarfishAppInstanceLike): GarfishAppRuntimeData["appInstance"] {
  const data: NonNullable<GarfishAppRuntimeData["appInstance"]> = {};
  const appId = toStringValue(appInstance.appId);

  if (appId !== undefined) {
    data.appId = appId;
  }
  if (typeof appInstance.mounted === "boolean") {
    data.mounted = appInstance.mounted;
  }
  if (typeof appInstance.display === "boolean") {
    data.display = appInstance.display;
  }
  if (typeof appInstance.active === "boolean") {
    data.active = appInstance.active;
  }

  return data;
}

function getExecOptionsData(options: GarfishExecOptionsLike): GarfishAppRuntimeData["execOptions"] {
  return {
    ...(typeof options.async === "boolean" ? { async: options.async } : {}),
    ...(typeof options.defer === "boolean" ? { defer: options.defer } : {}),
    ...(typeof options.noEntry === "boolean" ? { noEntry: options.noEntry } : {}),
    ...(typeof options.isInline === "boolean" ? { isInline: options.isInline } : {}),
    ...(typeof options.isModule === "boolean" ? { isModule: options.isModule } : {})
  };
}

function getRootStatus(apps: GarfishAppRuntimeData[]): ModernGarfishStatus {
  if (apps.length === 0) return "idle";
  if (apps.some((app) => app.status === "error")) return "error";

  const priority: ModernGarfishStatus[] = [
    "rendering",
    "mounting",
    "evaluating",
    "loading",
    "unmounting",
    "mounted",
    "loaded",
    "evaluated",
    "registered",
    "unmounted"
  ];
  return priority.find((status) => apps.some((app) => app.status === status)) ?? "idle";
}

function getAppName(appInfo: GarfishAppInfoLike): string | undefined {
  if (typeof appInfo.name !== "string") {
    return undefined;
  }

  const name = appInfo.name.trim();
  return name === "" ? undefined : name;
}

function mergeAppInfo(appInfo: GarfishAppInfoLike, payload: unknown): GarfishAppInfoLike {
  if (!isRecord(payload)) {
    return appInfo;
  }

  return {
    ...appInfo,
    ...(typeof payload.appName === "string" && typeof appInfo.name !== "string"
      ? { name: payload.appName }
      : {}),
    ...(typeof payload.basename === "string" ? { basename: payload.basename } : {}),
    ...(isRecord(payload.props) ? { props: payload.props } : {})
  };
}

function toStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function toActiveWhenValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }
  if (typeof value === "function") {
    return "[function]";
  }
  return undefined;
}

function toDomGetterValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }
  if (typeof value === "function") {
    return "[function]";
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function resolveRenderPayloadAppInfo(
  appInfo: GarfishAppInfoLike,
  payload: GarfishProviderRenderPayload | GarfishProviderDestroyPayload
): GarfishAppInfoLike {
  return mergeAppInfo(appInfo, payload);
}
