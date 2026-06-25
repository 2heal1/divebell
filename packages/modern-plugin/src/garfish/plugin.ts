import {
  createOpenRuntimeGarfishReporter,
  resolveRenderPayloadAppInfo,
  toGarfishRuntimeError
} from "./reporter.js";
import type {
  GarfishAppInfoLike,
  GarfishAppInstanceLike,
  GarfishCustomLoader,
  GarfishExecOptionsLike,
  GarfishLoaderResult,
  GarfishProviderDestroyPayload,
  GarfishProviderLike,
  GarfishProviderRenderPayload,
  OpenRuntimeGarfishCustomLoaderOptions,
  OpenRuntimeGarfishPlugin,
  OpenRuntimeGarfishPluginFactory,
  OpenRuntimeGarfishPluginOptions,
  OpenRuntimeGarfishReporter
} from "./types.js";

export function createOpenRuntimeGarfishPlugin(
  options: OpenRuntimeGarfishPluginOptions = {}
): OpenRuntimeGarfishPluginFactory {
  const reporter = resolveReporter(options);

  return () => ({
    name: "@openruntime/garfish-plugin",
    version: "0.1.0",
    beforeRegisterApp(appInfo) {
      for (const info of normalizeAppInfos(appInfo)) {
        reporter.registerApp(info);
      }
    },
    registerApp(apps) {
      for (const info of normalizeAppInfos(apps)) {
        reporter.registerApp(info);
      }
    },
    beforeLoad(appInfo) {
      reporter.updateApp(appInfo, "loading", {
        lifecycle: "beforeLoad",
        phase: "load"
      });
    },
    afterLoad(appInfo, appInstance) {
      const details = {
        lifecycle: "afterLoad",
        phase: "load"
      };
      reporter.updateApp(appInfo, "loaded", appInstance === undefined
        ? details
        : { ...details, appInstance });
    },
    errorLoadApp(error, appInfo) {
      reporter.updateApp(appInfo, "error", {
        lifecycle: "errorLoadApp",
        phase: "load",
        error: toGarfishRuntimeError(error, "garfish_load_error")
      });
    },
    beforeEval(appInfo, _code, _env, scriptUrl, execOptions) {
      reporter.updateApp(appInfo, "evaluating", {
        lifecycle: "beforeEval",
        phase: "eval",
        ...(scriptUrl === undefined ? {} : { scriptUrl }),
        ...(execOptions === undefined ? {} : { execOptions })
      });
    },
    afterEval(appInfo, _code, _env, scriptUrl, execOptions) {
      reporter.updateApp(appInfo, "evaluated", {
        lifecycle: "afterEval",
        phase: "eval",
        ...(scriptUrl === undefined ? {} : { scriptUrl }),
        ...(execOptions === undefined ? {} : { execOptions })
      });
    },
    errorExecCode(error, appInfo, _code, _env, scriptUrl, execOptions) {
      reporter.updateApp(appInfo, "error", {
        lifecycle: "errorExecCode",
        phase: "eval",
        ...(scriptUrl === undefined ? {} : { scriptUrl }),
        ...(execOptions === undefined ? {} : { execOptions }),
        error: toGarfishRuntimeError(error, "garfish_exec_error")
      });
    },
    beforeMount(appInfo, appInstance, cacheMode) {
      const details = {
        lifecycle: "beforeMount",
        phase: "mount",
        payload: { cacheMode }
      };
      reporter.updateApp(appInfo, "mounting", appInstance === undefined
        ? details
        : { ...details, appInstance });
    },
    afterMount(appInfo, appInstance, cacheMode) {
      const details = {
        lifecycle: "afterMount",
        phase: "mount",
        payload: { cacheMode }
      };
      reporter.updateApp(appInfo, "mounted", appInstance === undefined
        ? details
        : { ...details, appInstance });
    },
    errorMountApp(error, appInfo) {
      reporter.updateApp(appInfo, "error", {
        lifecycle: "errorMountApp",
        phase: "mount",
        error: toGarfishRuntimeError(error, "garfish_mount_error")
      });
    },
    beforeUnmount(appInfo, appInstance, cacheMode) {
      const details = {
        lifecycle: "beforeUnmount",
        phase: "unmount",
        payload: { cacheMode }
      };
      reporter.updateApp(appInfo, "unmounting", appInstance === undefined
        ? details
        : { ...details, appInstance });
    },
    afterUnmount(appInfo, appInstance, cacheMode) {
      const details = {
        lifecycle: "afterUnmount",
        phase: "unmount",
        payload: { cacheMode }
      };
      reporter.updateApp(appInfo, "unmounted", appInstance === undefined
        ? details
        : { ...details, appInstance });
    },
    errorUnmountApp(error, appInfo) {
      reporter.updateApp(appInfo, "error", {
        lifecycle: "errorUnmountApp",
        phase: "unmount",
        error: toGarfishRuntimeError(error, "garfish_unmount_error")
      });
    }
  });
}

export function createOpenRuntimeGarfishCustomLoader(
  options: OpenRuntimeGarfishCustomLoaderOptions = {}
): GarfishCustomLoader {
  const reporter = resolveReporter(options);

  return async (provider, appInfo, basename) => {
    const baseResult = await options.loader?.(provider, appInfo, basename);
    const targetResult = baseResult ?? createDefaultLoaderResult(provider);

    return wrapLoaderResult(targetResult, appInfo, reporter);
  };
}

function resolveReporter(
  options: OpenRuntimeGarfishPluginOptions | OpenRuntimeGarfishCustomLoaderOptions
): OpenRuntimeGarfishReporter {
  return options.reporter ?? createOpenRuntimeGarfishReporter(options);
}

function wrapLoaderResult(
  result: GarfishLoaderResult,
  appInfo: GarfishAppInfoLike,
  reporter: OpenRuntimeGarfishReporter
): GarfishLoaderResult {
  return {
    ...(result.mount === undefined
      ? {}
      : {
        mount(payload: GarfishProviderRenderPayload) {
          reporter.markProviderRenderCalled(resolveRenderPayloadAppInfo(appInfo, payload), payload);
          return result.mount?.(payload);
        }
      }),
    ...(result.unmount === undefined
      ? {}
      : {
        unmount(payload: GarfishProviderDestroyPayload) {
          reporter.markProviderDestroyCalled(resolveRenderPayloadAppInfo(appInfo, payload), payload);
          return result.unmount?.(payload);
        }
      })
  };
}

function createDefaultLoaderResult(provider: GarfishProviderLike): GarfishLoaderResult {
  return {
    ...(provider.render === undefined
      ? {}
      : {
        mount(payload: GarfishProviderRenderPayload) {
          return provider.render?.(payload);
        }
      }),
    ...(provider.destroy === undefined
      ? {}
      : {
        unmount(payload: GarfishProviderDestroyPayload) {
          return provider.destroy?.(payload);
        }
      })
  };
}

function normalizeAppInfos(
  input: GarfishAppInfoLike | GarfishAppInfoLike[] | Record<string, GarfishAppInfoLike>
): GarfishAppInfoLike[] {
  if (Array.isArray(input)) {
    return input;
  }

  if (isAppInfo(input)) {
    return [input];
  }

  return Object.values(input).filter(isAppInfo);
}

function isAppInfo(value: unknown): value is GarfishAppInfoLike {
  return typeof value === "object" && value !== null && "name" in value;
}

export type {
  GarfishAppInfoLike,
  GarfishAppInstanceLike,
  GarfishCustomLoader,
  GarfishExecOptionsLike,
  GarfishLoaderResult,
  GarfishProviderLike,
  OpenRuntimeGarfishCustomLoaderOptions,
  OpenRuntimeGarfishPlugin,
  OpenRuntimeGarfishPluginFactory,
  OpenRuntimeGarfishPluginOptions,
  OpenRuntimeGarfishReporter
} from "./types.js";
