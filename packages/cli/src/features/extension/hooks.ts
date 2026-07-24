import type {
  OpenRuntimeExtensionDefinition,
  OpenRuntimeOpenHookOptions,
  OpenRuntimePageHookOptions,
  OpenRuntimeStackDetection
} from "../../types/commands.js";
import {
  createExtensionHookPlan,
  getDetectStackHook,
  getOpenHook,
  type ExtensionHookPlan
} from "./plan.js";

export interface ExtensionHookFailure {
  extension: string;
  hook: "open" | "detectStack" | "close";
  message: string;
}

export interface ExtensionOpenHookScript {
  extension: string;
  script: string;
}

const EXTENSION_HOOK_TIMEOUT_MS = 5_000;

export async function runOpenHooks(
  extensions: readonly OpenRuntimeExtensionDefinition[],
  options: OpenRuntimeOpenHookOptions,
  plan: ExtensionHookPlan = createExtensionHookPlan(extensions, "open")
): Promise<{
  activeExtensions: string[];
  scripts: ExtensionOpenHookScript[];
  failures: ExtensionHookFailure[];
}> {
  const registry = new Map(extensions.map((extension) => [extension.name, extension]));
  const activeExtensions: string[] = [];
  const scripts: ExtensionOpenHookScript[] = [];
  const failures: ExtensionHookFailure[] = [...plan.failures];

  for (const batch of plan.batches) {
    const settled = await Promise.allSettled(batch.map(async (extensionName) => {
      const extension = registry.get(extensionName);
      const run = extension === undefined ? undefined : getOpenHook(extension);
      if (run === undefined) {
        throw new Error(`Extension "${extensionName}" open hook is unavailable.`);
      }
      return {
        extension: extensionName,
        result: await withTimeout(run(options), extensionName, "open")
      };
    }));

    for (let index = 0; index < settled.length; index += 1) {
      const result = settled[index];
      const extensionName = batch[index] ?? "unknown";
      if (result === undefined) continue;
      if (result.status === "rejected") {
        failures.push(failure(extensionName, "open", result.reason));
        continue;
      }
      activeExtensions.push(extensionName);
      for (const script of result.value.result?.scripts ?? []) {
        if (typeof script !== "string") {
          failures.push(failure(extensionName, "open", "Open hook returned a non-string script."));
        } else {
          scripts.push({ extension: extensionName, script });
        }
      }
    }
  }

  return { activeExtensions, scripts, failures };
}

export async function runDetectStackHooks(
  extensions: readonly OpenRuntimeExtensionDefinition[],
  options: OpenRuntimePageHookOptions,
  plan: ExtensionHookPlan = createExtensionHookPlan(extensions, "detectStack")
): Promise<{
  detections: Array<OpenRuntimeStackDetection & { extension: string }>;
  failures: ExtensionHookFailure[];
}> {
  const registry = new Map(extensions.map((extension) => [extension.name, extension]));
  const detections: Array<OpenRuntimeStackDetection & { extension: string }> = [];
  const failures: ExtensionHookFailure[] = [...plan.failures];

  for (const batch of plan.batches) {
    const settled = await Promise.allSettled(batch.map(async (extensionName) => {
      const extension = registry.get(extensionName);
      const run = extension === undefined ? undefined : getDetectStackHook(extension);
      if (run === undefined) {
        throw new Error(`Extension "${extensionName}" detectStack hook is unavailable.`);
      }
      return {
        extension: extensionName,
        result: await withTimeout(run(options), extensionName, "detectStack")
      };
    }));

    for (let index = 0; index < settled.length; index += 1) {
      const result = settled[index];
      const extensionName = batch[index] ?? "unknown";
      if (result === undefined) continue;
      if (result.status === "rejected") {
        failures.push(failure(extensionName, "detectStack", result.reason));
        continue;
      }
      const values = result.value.result === undefined
        ? []
        : Array.isArray(result.value.result) ? result.value.result : [result.value.result];
      for (const value of values) {
        try {
          detections.push({ ...validateDetection(value), extension: extensionName });
        } catch (error) {
          failures.push(failure(extensionName, "detectStack", error));
        }
      }
    }
  }

  return { detections, failures };
}

export async function runCloseHooks(
  extensions: readonly OpenRuntimeExtensionDefinition[],
  activeExtensions: readonly string[],
  options: OpenRuntimePageHookOptions,
  openPlan: ExtensionHookPlan = createExtensionHookPlan(extensions, "open")
): Promise<ExtensionHookFailure[]> {
  const active = new Set(activeExtensions);
  const registry = new Map(extensions.map((extension) => [extension.name, extension]));
  const failures: ExtensionHookFailure[] = [];
  for (const batch of [...openPlan.batches].reverse()) {
    const handlers = batch.flatMap((extensionName) => {
      const extension = registry.get(extensionName);
      const run = extension?.hooks?.close;
      return !active.has(extensionName) || run === undefined
        ? []
        : [{ extensionName, run }];
    });
    const settled = await Promise.allSettled(handlers.map(({ extensionName, run }) =>
      withTimeout(run(options), extensionName, "close")
    ));
    for (let index = 0; index < settled.length; index += 1) {
      const result = settled[index];
      if (result?.status === "rejected") {
        failures.push(failure(handlers[index]?.extensionName ?? "unknown", "close", result.reason));
      }
    }
  }
  return failures;
}

function validateDetection(value: OpenRuntimeStackDetection): OpenRuntimeStackDetection {
  if (value === null || typeof value !== "object") {
    throw new Error("detectStack must return an object, an array of objects, or undefined.");
  }
  if (typeof value.id !== "string" || value.id.length === 0) {
    throw new Error("detectStack result id must be a non-empty string.");
  }
  if (typeof value.name !== "string" || value.name.length === 0) {
    throw new Error("detectStack result name must be a non-empty string.");
  }
  if (value.version !== undefined && typeof value.version !== "string") {
    throw new Error("detectStack result version must be a string.");
  }
  if (value.evidence !== undefined && !isStringArray(value.evidence)) {
    throw new Error("detectStack result evidence must be an array of strings.");
  }
  if (value.recommendedExtensions !== undefined && !isStringArray(value.recommendedExtensions)) {
    throw new Error("detectStack result recommendedExtensions must be an array of strings.");
  }
  return value;
}

async function withTimeout<T>(
  promise: Promise<T>,
  extension: string,
  hook: ExtensionHookFailure["hook"]
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Extension "${extension}" ${hook} hook timed out after ${EXTENSION_HOOK_TIMEOUT_MS}ms.`));
        }, EXTENSION_HOOK_TIMEOUT_MS);
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function isStringArray(value: readonly string[]): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function failure(
  extension: string,
  hook: ExtensionHookFailure["hook"],
  error: unknown
): ExtensionHookFailure {
  return {
    extension,
    hook,
    message: error instanceof Error ? error.message : String(error)
  };
}
