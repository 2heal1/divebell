import type { DivebellBrowserApi } from "@divebell/cli";

import type { DebugClient } from "./debug-client.js";
import type {
  ReactDomBuildEvidence,
  ReactDomBuildKind,
  ReactRefreshHookEvidence,
  ReactRefreshPreflight,
  ReactRefreshRendererEvidence
} from "./types.js";

const REACT_DOM_SOURCE_FINGERPRINT = "rendererPackageName";
const REACT_DOM_RENDERER =
  /bundleType\s*:\s*([01])[\s\S]{0,240}?rendererPackageName\s*:\s*["']react-dom["']/gu;

interface HookSnapshot {
  status: ReactRefreshHookEvidence["status"];
  supportsFiber?: boolean;
  disabled?: boolean;
  rendererCount: number;
  renderers: ReactRefreshRendererEvidence["renderers"];
  reason?: string;
}

const HOOK_SNAPSHOT_SCRIPT = `(() => {
  try {
    const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!hook) {
      return { status: "missing", rendererCount: 0, renderers: [] };
    }
    const entries = hook.renderers && typeof hook.renderers.entries === "function"
      ? Array.from(hook.renderers.entries())
      : [];
    return {
      status: "installed",
      supportsFiber: hook.supportsFiber === true,
      disabled: hook.isDisabled === true,
      rendererCount: entries.length,
      renderers: entries.map(([id, renderer]) => ({
        id: String(id),
        packageName: typeof renderer?.rendererPackageName === "string"
          ? renderer.rendererPackageName
          : undefined,
        version: typeof renderer?.version === "string" ? renderer.version : undefined,
        build: renderer?.bundleType === 1
          ? "development"
          : renderer?.bundleType === 0
            ? "production"
            : "unknown",
        hasScheduleRefresh: typeof renderer?.scheduleRefresh === "function",
        hasSetRefreshHandler: typeof renderer?.setRefreshHandler === "function"
      }))
    };
  } catch (error) {
    return {
      status: "unavailable",
      rendererCount: 0,
      renderers: [],
      reason: error instanceof Error ? error.message : String(error)
    };
  }
})()`;

export async function collectReactRefreshPreflight(
  debug: DebugClient,
  browser: DivebellBrowserApi,
  sessionId: string
): Promise<ReactRefreshPreflight> {
  const reactDom = await detectReactDomBuilds(debug, sessionId);
  const snapshot = await readHookSnapshot(browser);
  const globalHook: ReactRefreshHookEvidence = {
    status: snapshot.status,
    rendererCount: snapshot.rendererCount,
    ...(snapshot.supportsFiber === undefined
      ? {}
      : { supportsFiber: snapshot.supportsFiber }),
    ...(snapshot.disabled === undefined ? {} : { disabled: snapshot.disabled }),
    ...(snapshot.reason === undefined ? {} : { reason: snapshot.reason })
  };
  return {
    reactDom,
    globalHook,
    refreshRenderer: classifyRefreshRenderer(reactDom, snapshot)
  };
}

export function unavailableReactRefreshPreflight(
  reason: string
): ReactRefreshPreflight {
  return {
    reactDom: {
      status: "not-observed",
      builds: [],
      scripts: []
    },
    globalHook: {
      status: "unavailable",
      rendererCount: 0,
      reason
    },
    refreshRenderer: {
      status: "not-observed",
      renderers: [],
      reason
    }
  };
}

async function detectReactDomBuilds(
  debug: DebugClient,
  sessionId: string
): Promise<ReactDomBuildEvidence> {
  const searched = await debug.sourceSearch(REACT_DOM_SOURCE_FINGERPRINT, sessionId);
  const scripts: ReactDomBuildEvidence["scripts"] = [];
  const visited = new Set<string>();
  for (const match of searched.matches) {
    if (match.sessionId !== sessionId || visited.has(match.scriptId)) continue;
    visited.add(match.scriptId);
    try {
      const loaded = await debug.source(match.scriptId, match.sessionId);
      const builds = reactDomBuildsInSource(loaded.scriptSource);
      for (const build of builds) {
        scripts.push({
          scriptId: match.scriptId,
          url: loaded.script.url ?? match.url ?? "",
          build
        });
      }
    } catch {
      // The script may disappear during a lazy chunk transition. Other
      // evidence remains usable and the result stays not-observed/ambiguous.
    }
  }
  const builds = unique(scripts.map((script) => script.build));
  return {
    status: builds.length === 0
      ? "not-observed"
      : builds.length === 1
        ? "observed"
        : "ambiguous",
    builds,
    scripts
  };
}

export function reactDomBuildsInSource(source: string): ReactDomBuildKind[] {
  const builds: ReactDomBuildKind[] = [];
  for (const match of source.matchAll(REACT_DOM_RENDERER)) {
    builds.push(match[1] === "1" ? "development" : "production");
  }
  return unique(builds);
}

async function readHookSnapshot(browser: DivebellBrowserApi): Promise<HookSnapshot> {
  try {
    return await browser.eval<HookSnapshot>(HOOK_SNAPSHOT_SCRIPT);
  } catch (error) {
    return {
      status: "unavailable",
      rendererCount: 0,
      renderers: [],
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

function classifyRefreshRenderer(
  reactDom: ReactDomBuildEvidence,
  hook: HookSnapshot
): ReactRefreshRendererEvidence {
  const reactDomRenderers = hook.renderers.filter((renderer) =>
    renderer.packageName === "react-dom"
  );
  const ready = reactDomRenderers.filter((renderer) =>
    renderer.build === "development"
    && renderer.hasScheduleRefresh
    && renderer.hasSetRefreshHandler
  );
  if (ready.length === 1) {
    return {
      status: "ready",
      renderers: hook.renderers,
      reason: "A development ReactDOM renderer registered both React Refresh scheduling hooks."
    };
  }
  if (ready.length > 1) {
    return {
      status: "ambiguous",
      renderers: hook.renderers,
      reason: "Multiple Refresh-capable ReactDOM renderers are registered; the mounted root owner is ambiguous."
    };
  }
  if (
    reactDom.builds.length === 1
    && reactDom.builds[0] === "production"
  ) {
    return {
      status: "react-dom-production",
      renderers: hook.renderers,
      reason: "Only a production ReactDOM build was observed; its renderer does not expose React Refresh scheduling hooks."
    };
  }
  if (
    reactDomRenderers.length === 1
    && reactDomRenderers[0]?.build === "production"
  ) {
    return {
      status: "react-dom-production",
      renderers: hook.renderers,
      reason: "The registered ReactDOM renderer is a production build and does not expose React Refresh scheduling hooks."
    };
  }
  if (hook.status === "missing") {
    return {
      status: "hook-missing",
      renderers: [],
      reason: "The React DevTools global hook was not installed before renderer discovery."
    };
  }
  if (hook.disabled || hook.supportsFiber === false) {
    return {
      status: "hook-incompatible",
      renderers: hook.renderers,
      reason: hook.disabled
        ? "The React DevTools global hook is disabled."
        : "The React DevTools global hook does not support Fiber renderers."
    };
  }
  if (hook.status === "installed" && hook.rendererCount === 0) {
    return {
      status: "renderer-missing",
      renderers: [],
      reason: "The global hook is installed, but no React renderer registered with it; the hook may have been installed after ReactDOM initialized."
    };
  }
  if (reactDomRenderers.length > 0) {
    return {
      status: "renderer-incompatible",
      renderers: hook.renderers,
      reason: "ReactDOM renderer registration was observed without both React Refresh scheduling hooks."
    };
  }
  if (reactDom.status === "ambiguous") {
    return {
      status: "ambiguous",
      renderers: hook.renderers,
      reason: "Both development and production ReactDOM builds were observed, but no Refresh-capable renderer could be selected."
    };
  }
  return {
    status: "not-observed",
    renderers: hook.renderers,
    reason: hook.reason ?? "No loaded ReactDOM build or compatible renderer was observed."
  };
}

function unique<Value>(values: Value[]): Value[] {
  return Array.from(new Set(values));
}
