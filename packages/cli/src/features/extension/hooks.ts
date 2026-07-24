import type {
  OpenRuntimeExtensionDefinition,
  OpenRuntimeExtensionContext,
  OpenRuntimeOpenHookOptions,
  OpenRuntimePageHookOptions,
  OpenRuntimeStackDetection
} from "../../types/commands.js";

export interface ExtensionHookFailure {
  extension: string;
  hook: "open" | "detectStack" | "close";
  message: string;
}

const EXTENSION_HOOK_TIMEOUT_MS = 5_000;

export async function runOpenHooks(
  extensions: readonly OpenRuntimeExtensionDefinition[],
  options: OpenRuntimeOpenHookOptions
): Promise<{
  activeExtensions: string[];
  extensionContexts: Record<string, OpenRuntimeExtensionContext>;
  scripts: string[];
  failures: ExtensionHookFailure[];
}> {
  const handlers = extensions.flatMap((extension) =>
    extension.hooks?.open === undefined ? [] : [{ extension, run: extension.hooks.open }]
  );
  const settled = await Promise.allSettled(handlers.map(async ({ extension, run }) => ({
    extension: extension.name,
    result: await withTimeout(run(options), extension.name, "open")
  })));
  const activeExtensions: string[] = [];
  const extensionContexts: Record<string, OpenRuntimeExtensionContext> = {};
  const scripts: string[] = [];
  const failures: ExtensionHookFailure[] = [];
  for (let index = 0; index < settled.length; index += 1) {
    const result = settled[index];
    const handler = handlers[index];
    if (result === undefined || handler === undefined) continue;
    if (result.status === "rejected") {
      failures.push(failure(handler.extension.name, "open", result.reason));
      continue;
    }
    activeExtensions.push(result.value.extension);
    if (result.value.result?.context !== undefined) {
      try {
        extensionContexts[result.value.extension] = cloneExtensionContext(result.value.result.context);
      } catch (error) {
        failures.push(failure(handler.extension.name, "open", error));
      }
    }
    for (const script of result.value.result?.scripts ?? []) {
      if (typeof script !== "string") {
        failures.push(failure(handler.extension.name, "open", "Open hook returned a non-string script."));
      } else {
        scripts.push(script);
      }
    }
  }
  return { activeExtensions, extensionContexts, scripts, failures };
}

export async function runDetectStackHooks(
  extensions: readonly OpenRuntimeExtensionDefinition[],
  extensionContexts: Readonly<Record<string, OpenRuntimeExtensionContext>>,
  options: OpenRuntimePageHookOptions
): Promise<{
  detections: Array<OpenRuntimeStackDetection & { extension: string }>;
  failures: ExtensionHookFailure[];
}> {
  const handlers = extensions.flatMap((extension) =>
    extension.hooks?.detectStack === undefined
      ? []
      : [{ extension, run: extension.hooks.detectStack }]
  );
  const settled = await Promise.allSettled(handlers.map(async ({ extension, run }) => ({
    extension: extension.name,
    result: await withTimeout(run({
      ...options,
      ...createOpenContextProperty(extensionContexts[extension.name])
    }), extension.name, "detectStack")
  })));
  const detections: Array<OpenRuntimeStackDetection & { extension: string }> = [];
  const failures: ExtensionHookFailure[] = [];
  for (let index = 0; index < settled.length; index += 1) {
    const result = settled[index];
    const handler = handlers[index];
    if (result === undefined || handler === undefined) continue;
    if (result.status === "rejected") {
      failures.push(failure(handler.extension.name, "detectStack", result.reason));
      continue;
    }
    const values = result.value.result === undefined
      ? []
      : Array.isArray(result.value.result) ? result.value.result : [result.value.result];
    for (const value of values) {
      try {
        detections.push({ ...validateDetection(value), extension: result.value.extension });
      } catch (error) {
        failures.push(failure(handler.extension.name, "detectStack", error));
      }
    }
  }
  return { detections, failures };
}

export async function runCloseHooks(
  extensions: readonly OpenRuntimeExtensionDefinition[],
  activeExtensions: readonly string[],
  extensionContexts: Readonly<Record<string, OpenRuntimeExtensionContext>>,
  options: OpenRuntimePageHookOptions
): Promise<ExtensionHookFailure[]> {
  const active = new Set(activeExtensions);
  const handlers = extensions.flatMap((extension) =>
    !active.has(extension.name) || extension.hooks?.close === undefined
      ? []
      : [{ extension, run: extension.hooks.close }]
  );
  const settled = await Promise.allSettled(handlers.map(({ extension, run }) =>
    withTimeout(run({
      ...options,
      ...createOpenContextProperty(extensionContexts[extension.name])
    }), extension.name, "close")
  ));
  return settled.flatMap((result, index) => {
    if (result.status === "fulfilled") return [];
    const extension = handlers[index]?.extension.name ?? "unknown";
    return [failure(extension, "close", result.reason)];
  });
}

function createOpenContextProperty(
  context: OpenRuntimeExtensionContext | undefined
): { openContext: OpenRuntimeExtensionContext } | Record<string, never> {
  return context === undefined ? {} : { openContext: context };
}

function cloneExtensionContext(value: OpenRuntimeExtensionContext): OpenRuntimeExtensionContext {
  if (!isPlainRecord(value) || !isExtensionContextValue(value, new Set())) {
    throw new Error("Open hook context must be a JSON object containing only serializable values.");
  }
  return JSON.parse(JSON.stringify(value)) as OpenRuntimeExtensionContext;
}

function isExtensionContextValue(value: unknown, seen: Set<object>): boolean {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isExtensionContextValue(item, seen))
    : isPlainRecord(value)
      && Object.values(value).every((item) => isExtensionContextValue(item, seen));
  seen.delete(value);
  return valid;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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
