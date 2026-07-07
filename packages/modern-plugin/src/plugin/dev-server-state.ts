import {
  createOpenRuntime,
  syncServerRuntimeBridge,
  type OpenRuntimeCore,
  type RuntimeError,
  type RuntimeStatus
} from "@openruntime/core";
import {
  modernTargetIds,
  registerDevServerTarget,
  updateTargetStatus
} from "../runtime/targets.js";
import type {
  ModernDevCompileDoneEvent,
  ModernDevServerFileChangedEvent,
  ModernDevServerStartedEvent,
  OpenRuntimeModernPluginOptions
} from "./types.js";

const defaultDevServerRuntimeId = "modern:dev-server";
const defaultDevServerUrl = "modern-dev-server://localhost";

interface DevServerRuntimeData {
  server: {
    started: boolean;
    port?: number;
  };
  compile: {
    done: boolean;
    count: number;
    success?: boolean;
    isFirstCompile?: boolean;
    name?: string;
    errorsCount?: number;
    warningsCount?: number;
    environments?: string[];
  };
  change?: {
    filename: string;
    eventType: string;
    isPrivate: boolean;
  };
}

interface DevCompileState {
  done: boolean;
  count: number;
  success?: boolean;
  isFirstCompile?: boolean;
  name?: string;
  errorsCount?: number;
  warningsCount?: number;
  environments?: string[];
  error?: RuntimeError;
}

interface StatsSummary {
  name?: string;
  errorsCount?: number;
  warningsCount?: number;
  hasErrors: boolean;
  error?: RuntimeError;
}

export class ModernDevServerRuntimeState {
  readonly source: string;
  readonly #options: OpenRuntimeModernPluginOptions;
  readonly #runtime: OpenRuntimeCore;
  readonly #runtimeId: string;
  #syncQueue: Promise<void> = Promise.resolve();
  #serverStarted = false;
  #port: number | undefined;
  #compile: DevCompileState = {
    done: false,
    count: 0
  };
  #change: DevServerRuntimeData["change"] | undefined;

  constructor(options: OpenRuntimeModernPluginOptions) {
    this.#options = options;
    this.source = options.source ?? "modern.js";
    this.#runtime = options.runtime ?? createOpenRuntime();
    this.#runtimeId = getDevServerOptions(options)?.runtimeId ?? defaultDevServerRuntimeId;
    registerDevServerTarget(this.#runtime, this.source);
  }

  markStarting(): void {
    this.#serverStarted = false;
    this.#port = undefined;
    this.#compile = {
      done: false,
      count: this.#compile.count
    };
    this.#publish("starting");
  }

  markCompilerCreated(params: { environments?: unknown } = {}): void {
    const environments = getEnvironmentNames(params.environments) ?? this.#compile.environments;
    this.#compile = {
      done: false,
      count: this.#compile.count,
      ...createOptionalArrayProperty("environments", environments)
    };
    this.#publish("compiling");
  }

  markServerStarted(event: ModernDevServerStartedEvent): void {
    this.#serverStarted = true;
    this.#port = event.port;

    if (this.#compile.done) {
      this.#publish(this.#compile.success === false ? "error" : "compiled", this.#compile.error);
      return;
    }

    this.#publish("running");
  }

  markFileChanged(event: ModernDevServerFileChangedEvent): void {
    this.#change = {
      filename: event.filename,
      eventType: event.eventType,
      isPrivate: event.isPrivate
    };
    const environments = this.#compile.environments;
    this.#compile = {
      done: false,
      count: this.#compile.count,
      ...createOptionalArrayProperty("environments", environments)
    };
    this.#publish("compiling");
  }

  markBeforeRestart(): void {
    this.#serverStarted = false;
    this.#compile = {
      done: false,
      count: this.#compile.count
    };
    this.#publish("starting");
  }

  markCompileDone(event: ModernDevCompileDoneEvent): void {
    const summary = summarizeStats(event.stats);
    this.#compile = {
      done: true,
      count: this.#compile.count + 1,
      success: !summary.hasErrors,
      ...(event.isFirstCompile === undefined ? {} : { isFirstCompile: event.isFirstCompile }),
      ...(summary.name === undefined ? {} : { name: summary.name }),
      ...(summary.errorsCount === undefined ? {} : { errorsCount: summary.errorsCount }),
      ...(summary.warningsCount === undefined ? {} : { warningsCount: summary.warningsCount }),
      ...createOptionalArrayProperty("environments", getEnvironmentNames(event.environments)),
      ...(summary.error === undefined ? {} : { error: summary.error })
    };
    this.#change = undefined;
    this.#publish(summary.hasErrors ? "error" : "compiled", summary.error);
  }

  #publish(status: RuntimeStatus, error?: RuntimeError): void {
    updateTargetStatus(this.#runtime, this.source, modernTargetIds.devServer, status, {
      data: this.#getData(),
      ...(error === undefined ? {} : { error })
    });
    this.#syncBridge();
  }

  #getData(): DevServerRuntimeData {
    return {
      server: {
        started: this.#serverStarted,
        ...(this.#port === undefined ? {} : { port: this.#port })
      },
      compile: {
        done: this.#compile.done,
        count: this.#compile.count,
        ...(this.#compile.success === undefined ? {} : { success: this.#compile.success }),
        ...(this.#compile.isFirstCompile === undefined ? {} : { isFirstCompile: this.#compile.isFirstCompile }),
        ...(this.#compile.name === undefined ? {} : { name: this.#compile.name }),
        ...(this.#compile.errorsCount === undefined ? {} : { errorsCount: this.#compile.errorsCount }),
        ...(this.#compile.warningsCount === undefined ? {} : { warningsCount: this.#compile.warningsCount }),
        ...createOptionalArrayProperty("environments", this.#compile.environments)
      },
      ...(this.#change === undefined ? {} : { change: this.#change })
    };
  }

  #syncBridge(): void {
    if (this.#options.bridge === undefined || this.#options.bridge === false) {
      return;
    }

    const bridge = this.#options.bridge;
    const devServerOptions = getDevServerOptions(this.#options);
    this.#syncQueue = this.#syncQueue.then(async () => {
      await syncServerRuntimeBridge(this.#runtime, {
        runtimeId: this.#runtimeId,
        url: devServerOptions?.url ?? this.#getRuntimeUrl(),
        source: this.source,
        ...(devServerOptions?.sessionId === undefined ? {} : { sessionId: devServerOptions.sessionId }),
        ...(bridge.port === undefined ? {} : { port: bridge.port })
      });
    }).catch(() => {
      // Dev server observability should not break Modern.js dev startup.
    });
  }

  #getRuntimeUrl(): string {
    if (this.#port === undefined) {
      return defaultDevServerUrl;
    }

    return `http://localhost:${this.#port}/`;
  }
}

function getDevServerOptions(
  options: OpenRuntimeModernPluginOptions
): Exclude<OpenRuntimeModernPluginOptions["devServer"], false | undefined> | undefined {
  return options.devServer === false ? undefined : options.devServer;
}

function summarizeStats(stats: unknown): StatsSummary {
  const json = getStatsJson(stats);
  const hasErrors = callBooleanMethod(stats, "hasErrors") ?? hasStatsJsonErrors(json);
  const errorsCount = getStatsCount(json, "errorsCount", "errors");
  const warningsCount = getStatsCount(json, "warningsCount", "warnings");
  const name = getStatsName(json);
  const error = hasErrors ? getFirstStatsError(json) ?? createCompileError(errorsCount) : undefined;

  return {
    hasErrors,
    ...(name === undefined ? {} : { name }),
    ...(errorsCount === undefined ? {} : { errorsCount }),
    ...(warningsCount === undefined ? {} : { warningsCount }),
    ...(error === undefined ? {} : { error })
  };
}

function getStatsJson(stats: unknown): unknown {
  if (!isRecord(stats) || typeof stats.toJson !== "function") {
    return stats;
  }

  try {
    return stats.toJson({
      all: false,
      children: true,
      errors: true,
      errorsCount: true,
      warnings: true,
      warningsCount: true
    });
  } catch {
    return undefined;
  }
}

function callBooleanMethod(value: unknown, method: string): boolean | undefined {
  if (!isRecord(value) || typeof value[method] !== "function") {
    return undefined;
  }

  try {
    return Boolean(value[method]());
  } catch {
    return undefined;
  }
}

function hasStatsJsonErrors(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const errorsCount = getNumber(value.errorsCount);
  if (errorsCount !== undefined && errorsCount > 0) {
    return true;
  }
  if (Array.isArray(value.errors) && value.errors.length > 0) {
    return true;
  }

  return Array.isArray(value.children) && value.children.some(hasStatsJsonErrors);
}

function getStatsCount(value: unknown, countKey: "errorsCount" | "warningsCount", arrayKey: "errors" | "warnings"): number | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const ownCount = getNumber(value[countKey]) ?? (Array.isArray(value[arrayKey]) ? value[arrayKey].length : undefined);
  if (ownCount !== undefined) {
    return ownCount;
  }

  const childrenCount = Array.isArray(value.children)
    ? value.children.reduce((total, child) => total + (getStatsCount(child, countKey, arrayKey) ?? 0), 0)
    : undefined;

  return childrenCount;
}

function getStatsName(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (typeof value.name === "string" && value.name.length > 0) {
    return value.name;
  }

  if (!Array.isArray(value.children)) {
    return undefined;
  }

  const names = value.children
    .map(getStatsName)
    .filter((name): name is string => name !== undefined);
  return names.length === 0 ? undefined : names.join(",");
}

function getFirstStatsError(value: unknown): RuntimeError | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (Array.isArray(value.errors)) {
    for (const error of value.errors) {
      const runtimeError = toRuntimeError(error);
      if (runtimeError !== undefined) {
        return runtimeError;
      }
    }
  }

  if (Array.isArray(value.children)) {
    for (const child of value.children) {
      const runtimeError = getFirstStatsError(child);
      if (runtimeError !== undefined) {
        return runtimeError;
      }
    }
  }

  return undefined;
}

function createCompileError(errorsCount: number | undefined): RuntimeError {
  return {
    message: errorsCount === undefined || errorsCount <= 1
      ? "Modern.js dev compile failed."
      : `Modern.js dev compile failed with ${errorsCount} errors.`,
    code: "modern_dev_compile_error"
  };
}

function toRuntimeError(error: unknown): RuntimeError | undefined {
  if (typeof error === "string" && error.length > 0) {
    return {
      message: error,
      code: "modern_dev_compile_error"
    };
  }
  if (!isRecord(error)) {
    return undefined;
  }

  const message = typeof error.message === "string" && error.message.length > 0
    ? error.message
    : typeof error.details === "string" && error.details.length > 0
      ? error.details
      : undefined;
  if (message === undefined) {
    return undefined;
  }

  return {
    message,
    code: "modern_dev_compile_error",
    ...(typeof error.stack === "string" ? { stack: error.stack } : {})
  };
}

function getEnvironmentNames(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const names = value.flatMap(getEnvironmentName);
    return names.length === 0 ? undefined : names;
  }
  if (isRecord(value)) {
    const names = Object.keys(value);
    return names.length === 0 ? undefined : names;
  }

  return undefined;
}

function getEnvironmentName(value: unknown): string[] {
  if (typeof value === "string" && value.length > 0) {
    return [value];
  }
  if (isRecord(value) && typeof value.name === "string" && value.name.length > 0) {
    return [value.name];
  }

  return [];
}

function createOptionalArrayProperty<Key extends string>(
  key: Key,
  value: string[] | undefined
): Record<Key, string[]> | Record<string, never> {
  return value === undefined ? {} : { [key]: value } as Record<Key, string[]>;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
