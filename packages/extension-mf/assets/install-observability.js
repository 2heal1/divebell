(() => {
  const PLUGIN_VERSION = "0.0.0-feat-operate-openruntime-20260722064424";
  const SCOPE = "chrome_extension";
  const PLUGIN_NAME = "observability-plugin:chrome-extension";
  const LEGACY_PLUGIN_NAME = "observability-plugin-devtools";
  const MARKER_NAME = "__MF_OBSERVABILITY_INJECTION__";
  const installedAt = Date.now();
  const target = globalThis;

  const notify = (value) => {
    try {
      Object.defineProperty(target, MARKER_NAME, {
        value,
        configurable: true,
        writable: true
      });
    } catch {
      target[MARKER_NAME] = value;
    }
  };

  try {
    const exported = target.ModuleFederationChromeObservabilityPlugin;
    const createPlugin = exported?.ChromeObservabilityPlugin ?? exported?.default;
    if (typeof createPlugin !== "function") {
      throw new Error("ChromeObservabilityPlugin export is unavailable.");
    }

    const federation = target.__FEDERATION__ ?? target.__VMOK__ ?? {};
    if (target.__FEDERATION__ === undefined) target.__FEDERATION__ = federation;
    if (target.__VMOK__ === undefined) target.__VMOK__ = federation;
    federation.__GLOBAL_PLUGIN__ ??= [];

    const runtimeAlreadyStarted =
      Array.isArray(federation.__INSTANCES__) && federation.__INSTANCES__.length > 0;
    const existing = federation.__GLOBAL_PLUGIN__.some(
      (plugin) => plugin?.name === PLUGIN_NAME || plugin?.name === LEGACY_PLUGIN_NAME
    );

    if (!existing) {
      federation.__GLOBAL_PLUGIN__.push(createPlugin({
        level: "verbose",
        console: true,
        browser: {
          enabled: true,
          mode: "development"
        },
        trace: {
          printStart: true
        },
        devtools: {
          enabled: true,
          source: "openruntime/extension-mf"
        }
      }));
    }

    notify({
      schemaVersion: 1,
      source: "openruntime/extension-mf",
      status: existing ? "already-installed" : "installed",
      scope: SCOPE,
      observabilityVersion: PLUGIN_VERSION,
      installedAt,
      timing: runtimeAlreadyStarted ? "late" : "before-runtime"
    });
  } catch (error) {
    notify({
      schemaVersion: 1,
      source: "openruntime/extension-mf",
      status: "error",
      scope: SCOPE,
      observabilityVersion: PLUGIN_VERSION,
      installedAt,
      timing: "unknown",
      message: error instanceof Error ? error.message : String(error)
    });
  }
})();
