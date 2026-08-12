import type { DivebellExtensionApi } from "@divebell/cli";

import { DebugClient } from "./debug-client.js";
import {
  readRstackStackEvidenceExpression,
  type RstackStackEvidence
} from "./open.js";
import { discoverRstackProfiles } from "./profiles.js";

export async function detectRstackStack(
  divebell: DivebellExtensionApi,
  command: string
): Promise<{
  id: string;
  name: string;
  evidence: string[];
  command: string;
} | undefined> {
  const debug = new DebugClient(divebell.browser);
  const before = await debug.status();
  const enabled = await debug.enable();
  const newlyEnabled = enabled.sessions
    .map((session) => session.sessionId)
    .filter((sessionId) => !before.sessions.some((session) =>
      session.sessionId === sessionId && session.enabled
    ));

  try {
    const [discovery, preloadedEvidence, sourceMarkerCount] = await Promise.all([
      discoverRstackProfiles(debug),
      readPreloadedEvidence(divebell),
      countRspackSourceMarkers(debug)
    ]);
    const hmr = discovery.runtimes.filter((runtime) =>
      runtime.kind === "rspack-hmr"
    );
    if (hmr.length === 0) return undefined;
    const observedDataRspack = (preloadedEvidence?.dataRspackScriptCount ?? 0) > 0;
    if (!observedDataRspack && sourceMarkerCount === 0) return undefined;
    const refresh = discovery.runtimes.some((runtime) =>
      runtime.kind === "react-refresh"
    );
    return {
      id: "rspack-hmr",
      name: "Rspack HMR",
      evidence: [
        observedDataRspack
          ? "script[data-rspack] observed during document loading"
          : `${sourceMarkerCount} compiled Rspack load-script marker${sourceMarkerCount === 1 ? "" : "s"}`,
        `${hmr.length} loaded compatible HMR runtime${hmr.length === 1 ? "" : "s"}`,
        refresh
          ? "compiled React Refresh runtime detected"
          : "compiled React Refresh runtime not detected"
      ],
      command
    };
  } finally {
    for (const sessionId of newlyEnabled) {
      await debug.disable(sessionId).catch(() => undefined);
    }
  }
}

async function readPreloadedEvidence(
  divebell: DivebellExtensionApi
): Promise<RstackStackEvidence | undefined> {
  try {
    const value = await divebell.browser.eval<RstackStackEvidence | null>(
      readRstackStackEvidenceExpression()
    );
    return value?.schemaVersion === 1 ? value : undefined;
  } catch {
    return undefined;
  }
}

async function countRspackSourceMarkers(debug: DebugClient): Promise<number> {
  try {
    const searched = await debug.sourceSearch("data-rspack");
    const unique = new Map<string, { scriptId: string; sessionId: string }>();
    for (const match of searched.matches) {
      unique.set(`${match.sessionId}\u0000${match.scriptId}`, {
        scriptId: match.scriptId,
        sessionId: match.sessionId
      });
    }
    let count = 0;
    for (const script of unique.values()) {
      try {
        const loaded = await debug.source(script.scriptId, script.sessionId);
        if (
          /\.setAttribute\(\s*["']data-rspack["']/u
            .test(loaded.scriptSource)
        ) {
          count += 1;
        }
      } catch {
        // A lazy script may disappear while stack detection is running.
      }
    }
    return count;
  } catch {
    return 0;
  }
}
