import type {
  DivebellExtensionDefinition,
  DivebellOpenHookNetworkThrottling,
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
  throttling?: {
    cpuRate?: number;
    network?: DivebellOpenHookNetworkThrottling;
  };
  failures: ExtensionHookFailure[];
}> {
  const registry = new Map(extensions.map((extension) => [extension.name, extension]));
  const activeExtensions: string[] = [];
  let openedUrl: string | undefined;
  let openedUrlExtension: string | undefined;
  const scripts: ExtensionOpenHookScript[] = [];
  const companionPages: ExtensionOpenHookCompanionPage[] = [];
  const throttling: {
    cpuRate?: number;
    network?: DivebellOpenHookNetworkThrottling;
  } = {};
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
      mergeOpenHookThrottling(
        throttling,
        result.value.result?.throttling,
        extensionName,
        failures
      );
    }
  }

  return {
    activeExtensions,
    ...(openedUrl === undefined ? {} : { openedUrl }),
    scripts,
    companionPages,
    ...(Object.keys(throttling).length === 0 ? {} : { throttling }),
    failures
  };
}

function mergeOpenHookThrottling(
  target: {
    cpuRate?: number;
    network?: DivebellOpenHookNetworkThrottling;
  },
  value: unknown,
  extensionName: string,
  failures: ExtensionHookFailure[]
): void {
  if (value === undefined) return;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    failures.push(failure(extensionName, "open", "Open hook throttling must be an object."));
    return;
  }
  const throttling = value as {
    cpuRate?: unknown;
    network?: unknown;
  };
  const next: {
    cpuRate?: number;
    network?: DivebellOpenHookNetworkThrottling;
  } = {};
  if (throttling.cpuRate !== undefined) {
    if (!isFiniteNumberAtLeast(throttling.cpuRate, 1)) {
      failures.push(failure(extensionName, "open", "Open hook cpuRate must be a finite number greater than or equal to 1."));
      return;
    }
    next.cpuRate = throttling.cpuRate;
  }
  if (throttling.network !== undefined) {
    const network = validateOpenHookNetworkThrottling(throttling.network, extensionName, failures);
    if (network === undefined) return;
    next.network = network;
  }
  if (next.cpuRate === undefined && next.network === undefined) {
    failures.push(failure(extensionName, "open", "Open hook throttling requires cpuRate or network conditions."));
    return;
  }
  if (
    next.cpuRate !== undefined
    && target.cpuRate !== undefined
    && target.cpuRate !== next.cpuRate
  ) {
    failures.push(failure(extensionName, "open", "Open hook cpuRate conflicts with another Extension."));
    return;
  }
  const mergedNetwork = { ...target.network };
  if (next.network !== undefined) {
    for (const field of ["latencyMs", "downloadKbps", "uploadKbps"] as const) {
      const nextValue = next.network[field];
      if (nextValue === undefined) continue;
      if (mergedNetwork[field] !== undefined && mergedNetwork[field] !== nextValue) {
        failures.push(failure(extensionName, "open", `Open hook network ${field} conflicts with another Extension.`));
        return;
      }
      mergedNetwork[field] = nextValue;
    }
  }
  if (next.cpuRate !== undefined) target.cpuRate = next.cpuRate;
  if (next.network !== undefined) target.network = mergedNetwork;
}

function validateOpenHookNetworkThrottling(
  value: unknown,
  extensionName: string,
  failures: ExtensionHookFailure[]
): DivebellOpenHookNetworkThrottling | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    failures.push(failure(extensionName, "open", "Open hook network throttling must be an object."));
    return undefined;
  }
  const network = value as Record<string, unknown>;
  const result: DivebellOpenHookNetworkThrottling = {};
  for (const field of ["latencyMs", "downloadKbps", "uploadKbps"] as const) {
    const fieldValue = network[field];
    if (fieldValue === undefined) continue;
    if (!isFiniteNumberAtLeast(fieldValue, 0)) {
      failures.push(failure(extensionName, "open", `Open hook network ${field} must be a non-negative finite number.`));
      return undefined;
    }
    result[field] = fieldValue;
  }
  if (Object.keys(result).length === 0) {
    failures.push(failure(extensionName, "open", "Open hook network throttling requires at least one condition."));
    return undefined;
  }
  return result;
}

function isFiniteNumberAtLeast(value: unknown, minimum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum;
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
  return {
    id: value.id,
    name: value.name,
    ...(value.version === undefined ? {} : { version: value.version }),
    ...(value.evidence === undefined ? {} : { evidence: value.evidence }),
    ...(value.command === undefined ? {} : { command: value.command })
  };
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
