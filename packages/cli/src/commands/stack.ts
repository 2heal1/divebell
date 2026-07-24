import { createBridgeStateStore } from "../features/bridge/config.js";
import { createOpenRuntimeExtensionApi } from "../features/extension/api.js";
import { runDetectStackHooks } from "../features/extension/hooks.js";
import { applyOpenContextDefaultsOrThrow, createExtensionPageContext } from "../open-context.js";
import type { OpenRuntimeExtensionDefinition } from "../types/commands.js";
import type { RuntimeCliCommandOptions } from "../types/cli.js";
import { createCommandOutput, createError } from "../utils/output.js";

export async function runStackCommand(
  options: RuntimeCliCommandOptions & { extensions: readonly OpenRuntimeExtensionDefinition[] }
): Promise<number> {
  if (options.args.command.length !== 1) {
    throw createError({
      code: "STACK_USAGE_INVALID",
      kind: "validation",
      message: "stack does not accept a subcommand.",
      hint: "Run `openruntime stack`."
    });
  }
  const openContext = await options.operationLogStore.read();
  const args = applyOpenContextDefaultsOrThrow(options.args, openContext, "always");
  if (openContext === undefined) throw new Error("Open context is required.");
  const page = createExtensionPageContext(openContext);
  const openruntime = createOpenRuntimeExtensionApi({
    args,
    fetcher: options.fetcher,
    browserRunner: options.browserRunner,
    bridgeStarter: options.bridgeStarter,
    bridgeStateStore: createBridgeStateStore(args, options.bridgeStateDirectory),
    openContext
  });
  const currentUrl = await openruntime.browser.eval<string>("globalThis.location.href");
  if (typeof currentUrl !== "string" || currentUrl.length === 0) {
    throw createError({
      code: "STACK_PAGE_URL_UNAVAILABLE",
      kind: "browser",
      message: "Could not read the current page URL."
    });
  }
  const detectorNames = options.extensions
    .filter((extension) => extension.hooks?.detectStack !== undefined)
    .map((extension) => extension.name)
    .sort();
  const detectorSignature = detectorNames.join("\n");
  if (
    !args.options.has("refresh") &&
    openContext.stackDetection?.url === currentUrl &&
    openContext.stackDetection.detectorSignature === detectorSignature
  ) {
    const { detectorSignature: _, ...cachedDetection } = openContext.stackDetection;
    createCommandOutput(options.stdout, "stack").ok({
      page,
      ...cachedDetection,
      cached: true
    }, openContext.stackDetection.detections.length === 0
      ? "No technology stack detected."
      : "Technology stack detected.");
    return 0;
  }
  const result = await runDetectStackHooks(options.extensions, { args, page, openruntime });
  const stackDetection = {
    url: currentUrl,
    detectedAt: Date.now(),
    detections: result.detections,
    failures: result.failures,
    detectorCount: detectorNames.length,
    detectorSignature
  };
  await options.operationLogStore.write({
    command: openContext.command,
    url: openContext.url,
    normalizedUrl: openContext.normalizedUrl,
    bridgeUrl: openContext.bridgeUrl,
    bridgePort: openContext.bridgePort,
    sessionId: openContext.sessionId,
    openedAt: openContext.openedAt,
    exitCode: openContext.exitCode,
    activeExtensions: openContext.activeExtensions,
    stackDetection
  });
  const { detectorSignature: _, ...publicDetection } = stackDetection;
  createCommandOutput(options.stdout, "stack").ok({
    page,
    ...publicDetection,
    cached: false
  }, result.detections.length === 0 ? "No technology stack detected." : "Technology stack detected.");
  return 0;
}
