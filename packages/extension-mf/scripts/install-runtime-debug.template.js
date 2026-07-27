(() => {
  const RUNTIME_VERSION = "__MF_RUNTIME_VERSION__";
  const MARKER_NAME = "__MF_RUNTIME_DEBUG_INJECTION__";
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
    const federation = target.__FEDERATION__ ?? target.__VMOK__;
    const existingConstructor = federation?.__DEBUG_CONSTRUCTOR__;
    const existingVersion = federation?.__DEBUG_CONSTRUCTOR_VERSION__;
    const runtimeAlreadyStarted =
      Array.isArray(federation?.__INSTANCES__) && federation.__INSTANCES__.length > 0;

    if (
      typeof existingConstructor === "function" &&
      existingVersion === RUNTIME_VERSION
    ) {
      notify({
        schemaVersion: 1,
        source: "openruntime/extension-mf",
        status: "already-installed",
        runtimeVersion: RUNTIME_VERSION,
        installedAt,
        timing: runtimeAlreadyStarted ? "late" : "before-runtime"
      });
      return;
    }

    /*__MF_RUNTIME_DEBUG_SOURCE__*/

    const installedFederation =
      target.__FEDERATION__ ?? target.__VMOK__ ?? {};
    if (target.__FEDERATION__ === undefined) {
      target.__FEDERATION__ = installedFederation;
    }
    if (target.__VMOK__ === undefined) {
      target.__VMOK__ = installedFederation;
    }
    const DebugConstructor =
      ModuleFederationDebugRuntime?.ModuleFederation;
    if (typeof DebugConstructor !== "function") {
      throw new Error("Module Federation Runtime Core export is unavailable.");
    }
    installedFederation.__DEBUG_CONSTRUCTOR__ = DebugConstructor;
    installedFederation.__DEBUG_CONSTRUCTOR_VERSION__ = RUNTIME_VERSION;
    if (typeof installedFederation?.__DEBUG_CONSTRUCTOR__ !== "function") {
      throw new Error("Module Federation debug constructor is unavailable.");
    }
    if (installedFederation.__DEBUG_CONSTRUCTOR_VERSION__ !== RUNTIME_VERSION) {
      throw new Error(
        `Expected Module Federation debug runtime ${RUNTIME_VERSION}, received ${
          installedFederation.__DEBUG_CONSTRUCTOR_VERSION__ ?? "unknown"
        }.`
      );
    }

    notify({
      schemaVersion: 1,
      source: "openruntime/extension-mf",
      status: "installed",
      runtimeVersion: RUNTIME_VERSION,
      installedAt,
      timing: runtimeAlreadyStarted ? "late" : "before-runtime"
    });
  } catch (error) {
    notify({
      schemaVersion: 1,
      source: "openruntime/extension-mf",
      status: "error",
      runtimeVersion: RUNTIME_VERSION,
      installedAt,
      timing: "unknown",
      message: error instanceof Error ? error.message : String(error)
    });
  }
})();
