import type {
  DivebellExtensionDefinition,
  DivebellOpenHookOptions,
  DivebellPageHookOptions,
  DivebellStackDetection
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

export interface ExtensionOpenHookCompanionPage {
  extension: string;
  url: string;
  label?: string;
  waitFor?: {
    script: string;
    timeout?: number;
  };
}

const EXTENSION_HOOK_TIMEOUT_MS = 5_000;

export async function runOpenHooks(
  extensions: readonly DivebellExtensionDefinition[],
  options: DivebellOpenHookOptions,
  plan: ExtensionHookPlan = createExtensionHookPlan(extensions, "open")
): Promise<{
  activeExtensions: string[];
  openedUrl?: string;
  scripts: ExtensionOpenHookScript[];
  companionPages: ExtensionOpenHookCompanionPage[];
  failures: ExtensionHookFailure[];
}> {
  const registry = new Map(extensions.map((extension) => [extension.name, extension]));
  const activeExtensions: string[] = [];
  let openedUrl: string | undefined;
  let openedUrlExtension: string | undefined;
  const scripts: ExtensionOpenHookScript[] = [];
  const companionPages: ExtensionOpenHookCompanionPage[] = [];
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
      const replacementUrl = result.value.result?.openedUrl;
      if (replacementUrl !== undefined) {
        if (typeof replacementUrl !== "string" || replacementUrl.length === 0) {
          failures.push(failure(extensionName, "open", "Open hook returned an invalid openedUrl."));
        } else if (openedUrl !== undefined && openedUrl !== replacementUrl) {
          failures.push(failure(
            extensionName,
            "open",
            `Open hook openedUrl conflicts with Extension "${openedUrlExtension ?? "unknown"}".`
          ));
        } else {
          openedUrl = replacementUrl;
          openedUrlExtension = extensionName;
        }
      }
      for (const script of result.value.result?.scripts ?? []) {
        if (typeof script !== "string") {
          failures.push(failure(extensionName, "open", "Open hook returned a non-string script."));
        } else {
          scripts.push({ extension: extensionName, script });
        }
      }
      for (const page of result.value.result?.companionPages ?? []) {
        if (
          page === null ||
          typeof page !== "object" ||
          typeof page.url !== "string" ||
          page.url.length === 0
        ) {
          failures.push(failure(extensionName, "open", "Open hook returned an invalid companion page."));
          continue;
        }
        if (page.label !== undefined && (typeof page.label !== "string" || page.label.length === 0)) {
          failures.push(failure(extensionName, "open", "Companion page label must be a non-empty string."));
          continue;
        }
        if (
          page.waitFor !== undefined &&
          (
            page.waitFor === null ||
            typeof page.waitFor !== "object" ||
            typeof page.waitFor.script !== "string" ||
            page.waitFor.script.length === 0 ||
            (
              page.waitFor.timeout !== undefined &&
              (
                typeof page.waitFor.timeout !== "number" ||
                !Number.isFinite(page.waitFor.timeout) ||
                page.waitFor.timeout <= 0
              )
            )
          )
        ) {
          failures.push(failure(extensionName, "open", "Companion page wait condition is invalid."));
          continue;
        }
        companionPages.push({
          extension: extensionName,
          url: page.url,
          ...(page.label === undefined ? {} : { label: page.label }),
          ...(page.waitFor === undefined
            ? {}
            : {
                waitFor: {
                  script: page.waitFor.script,
                  ...(page.waitFor.timeout === undefined ? {} : { timeout: page.waitFor.timeout })
                }
              })
        });
      }
    }
  }

  return {
    activeExtensions,
    ...(openedUrl === undefined ? {} : { openedUrl }),
    scripts,
    companionPages,
    failures
  };
}

export async function runDetectStackHooks(
  extensions: readonly DivebellExtensionDefinition[],
  options: DivebellPageHookOptions,
  plan: ExtensionHookPlan = createExtensionHookPlan(extensions, "detectStack")
): Promise<{
  detections: Array<DivebellStackDetection & { extension: string }>;
  failures: ExtensionHookFailure[];
}> {
  const registry = new Map(extensions.map((extension) => [extension.name, extension]));
  const detections: Array<DivebellStackDetection & { extension: string }> = [];
  const failures: ExtensionHookFailure[] = [...plan.failures];

  for (const batch of plan.batches) {
    const settled = await Promise.allSettled(batch.map(async (extensionName) => {
      const extension = registry.get(extensionName);
      if (extension === undefined) {
        throw new Error(`Extension "${extensionName}" detectStack hook is unavailable.`);
      }
      const run = getDetectStackHook(extension);
      if (run === undefined) {
        throw new Error(`Extension "${extensionName}" detectStack hook is unavailable.`);
      }
      return {
        extension: extensionName,
        definition: extension,
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
          detections.push({
            ...validateDetection(value, result.value.definition),
            extension: extensionName
          });
        } catch (error) {
          failures.push(failure(extensionName, "detectStack", error));
        }
      }
    }
  }

  return { detections, failures };
}

export async function runCloseHooks(
  extensions: readonly DivebellExtensionDefinition[],
  activeExtensions: readonly string[],
  options: DivebellPageHookOptions,
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

function validateDetection(
  value: DivebellStackDetection,
  extension: DivebellExtensionDefinition
): DivebellStackDetection {
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
  if (value.details !== undefined && !isStackDetails(value.details)) {
    throw new Error(
      "detectStack result details must be a JSON object no larger than 20 KB."
    );
  }
  const legacyValue = value as DivebellStackDetection & {
    recommendedExtensions?: unknown;
  };
  if (legacyValue.recommendedExtensions !== undefined) {
    throw new Error(
      "detectStack result recommendedExtensions is no longer supported; return command instead."
    );
  }
  if (value.command !== undefined) {
    if (typeof value.command !== "string" || value.command.length === 0) {
      throw new Error("detectStack result command must be a non-empty string.");
    }
    if (!extension.commands?.some((command) => command.name === value.command)) {
      throw new Error(
        `detectStack result command "${value.command}" is not provided by Extension "${extension.name}".`
      );
    }
  }
  return value;
}

function isStackDetails(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  if (!isJsonValue(value, new Set(), 0)) return false;
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8") <= 20_000;
  } catch {
    return false;
  }
}

function isJsonValue(
  value: unknown,
  ancestors: Set<object>,
  depth: number
): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || depth > 8 || ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, ancestors, depth + 1))
    : Object.getPrototypeOf(value) === Object.prototype
      && Object.values(value).every((item) => isJsonValue(item, ancestors, depth + 1));
  ancestors.delete(value);
  return valid;
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
