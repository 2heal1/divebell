import type { DivebellBrowserApi, DivebellBrowserDebugSession } from "@divebell/cli";
import { matchDivebellChunk, type DivebellChunkMap } from "@divebell/chunk-map";
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type { CodeUsageCaptureOptions, CodeUsageCaptureResult } from "./types.js";

interface PageIdentity {
  tabId: string;
  targetId: string;
  url: string;
  timeOrigin: number;
}

/** Freeze coverage first, then obtain source from that same renderer/document. */
export async function captureCodeUsage(
  browser: DivebellBrowserApi,
  options: CodeUsageCaptureOptions
): Promise<CodeUsageCaptureResult> {
  const mapValue: unknown = JSON.parse(await readFile(resolve(options.chunkMap), "utf8"));
  if (!isRecord(mapValue) || typeof mapValue.buildId !== "string" || !Array.isArray(mapValue.chunks)) {
    throw new Error("The Chunk Map must contain a buildId and chunks array.");
  }
  const chunkMap = mapValue as unknown as DivebellChunkMap;
  const coverage = await browser.coverage.status();
  if (!coverage.active) throw new Error("Start coverage before code-usage capture.");
  const page = await readPageIdentity(browser);
  if (page.targetId !== coverage.targetId) {
    throw new Error("The active page is not the target where coverage was started. Select that target or recapture.");
  }

  const outputPath = resolve(options.outputPath);
  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryDirectory = await mkdtemp(join(dirname(outputPath), ".code-usage-capture-"));
  const rawPath = join(temporaryDirectory, "raw.coverage.json");
  let rawCaptured = false;
  let restoreDebugger = false;
  try {
    const checkpoint = await browser.coverage[options.stop ? "stop" : "take"]({
      path: rawPath,
      label: options.label
    });
    rawCaptured = true;
    if (resolve(checkpoint.path) !== rawPath || checkpoint.captureId !== coverage.captureId
      || checkpoint.targetId !== page.targetId || checkpoint.label !== options.label) {
      throw new Error("Coverage checkpoint identity does not match the selected capture, target, or label.");
    }
    const value: unknown = JSON.parse(await readFile(rawPath, "utf8"));
    if (!isRecord(value) || !Array.isArray(value.scripts)
      || value.captureId !== checkpoint.captureId || value.targetId !== checkpoint.targetId
      || value.checkpoint !== checkpoint.checkpoint || value.label !== options.label
      || value.url !== checkpoint.url) {
      throw new Error("The saved raw coverage does not match the browser checkpoint evidence.");
    }
    const scripts = value.scripts.map((script: unknown) => {
      if (!isRecord(script) || typeof script.scriptId !== "string" || typeof script.url !== "string"
        || !Array.isArray(script.functions)) throw new Error("Invalid script in the raw coverage checkpoint.");
      return script;
    });
    const matched = scripts.filter((script) => {
      const match = matchDivebellChunk(chunkMap, script.url as string);
      if (match.status === "ambiguous") {
        throw new Error(`Ambiguous Chunk Map match for ${JSON.stringify(script.url)}.`);
      }
      return match.status === "matched";
    });
    if (matched.length === 0) throw new Error("No coverage scripts match the supplied Chunk Map.");

    const priorDebug = await browser.debug.status({ tab: page.tabId });
    const wasEnabled = priorDebug.sessions.some((session) => session.enabled
      && session.targetId === page.targetId && session.tabId === page.tabId);
    const enabled = await browser.debug.enable({ tab: page.tabId });
    restoreDebugger = !wasEnabled;
    // enable returns only tabId/sessionId on some supported engines. The status
    // below provides the target and document identity for the strict check.
    const enabledSession = enabled.sessions.find((session) => session.tabId === page.tabId);
    if (!enabled.enabled || !enabledSession) {
      throw new Error("Debugger did not attach to the coverage page target.");
    }
    const debug = await browser.debug.status({ tab: page.tabId });
    const session = matchingSession(debug.sessions, page, enabledSession.sessionId);
    if (debug.connectionGeneration !== enabled.connectionGeneration) {
      throw new Error("Browser reconnected while enabling source capture; recapture this phase.");
    }

    // A bounded batch avoids launching one CLI process per script at once.
    for (let index = 0; index < matched.length; index += 4) {
      const results = await Promise.allSettled(matched.slice(index, index + 4).map(async (script) => {
        const source = await browser.debug.source(script.scriptId as string, { tab: page.tabId });
        if (source.script.scriptId !== script.scriptId || source.script.url !== script.url
          || source.script.sessionId !== session.sessionId
          || source.script.documentGeneration !== session.documentGeneration
          || source.script.connectionGeneration !== debug.connectionGeneration
          || typeof source.scriptSource !== "string") {
          throw new Error(`Runtime source identity changed for script ${script.scriptId} (${script.url}).`);
        }
        script.runtimeSource = source.scriptSource;
        script.runtimeSourceIdentity = {
          targetId: page.targetId,
          sessionId: session.sessionId,
          connectionGeneration: debug.connectionGeneration,
          documentGeneration: session.documentGeneration
        };
      }));
      const failed = results.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
    }

    const afterPage = await readPageIdentity(browser);
    if (afterPage.tabId !== page.tabId || afterPage.targetId !== page.targetId
      || afterPage.url !== page.url || afterPage.timeOrigin !== page.timeOrigin) {
      throw new Error("The active page navigated or changed during runtime source capture; recapture this phase.");
    }
    const afterDebug = await browser.debug.status({ tab: page.tabId });
    const afterSession = matchingSession(afterDebug.sessions, page, session.sessionId);
    if (afterDebug.connectionGeneration !== debug.connectionGeneration
      || afterSession.documentGeneration !== session.documentGeneration) {
      throw new Error("The renderer document or debugger connection changed during source capture.");
    }
    const afterCoverage = await browser.coverage.status();
    if (options.stop ? afterCoverage.active : !afterCoverage.active
      || afterCoverage.captureId !== coverage.captureId || afterCoverage.targetId !== page.targetId
      || afterCoverage.checkpointCount !== checkpoint.checkpoint) {
      throw new Error("Coverage capture changed while collecting runtime sources.");
    }

    const enriched = {
      ...value,
      scripts,
      captureEvidence: {
        source: "Debugger.getScriptSource",
        capturedAt: new Date().toISOString(),
        ...page,
        captureStartedUrl: checkpoint.url,
        captureId: checkpoint.captureId,
        checkpoint: checkpoint.checkpoint,
        connectionGeneration: debug.connectionGeneration,
        sessionId: session.sessionId,
        documentGeneration: session.documentGeneration,
        runtimeSourceCount: matched.length
      }
    };
    if (restoreDebugger) {
      await browser.debug.disable({ tab: page.tabId });
      restoreDebugger = false;
    }
    const enrichedPath = join(temporaryDirectory, "enriched.coverage.json");
    await writeFile(enrichedPath, `${JSON.stringify(enriched, null, 2)}\n`, "utf8");
    await rename(enrichedPath, outputPath);
    let cleanupWarning: string | undefined;
    try {
      await rm(temporaryDirectory, { recursive: true, force: true });
    } catch {
      cleanupWarning = `Checkpoint published; temporary evidence could not be removed from ${temporaryDirectory}.`;
    }
    return {
      outputPath,
      captureId: checkpoint.captureId,
      checkpoint: checkpoint.checkpoint,
      label: options.label,
      targetId: page.targetId,
      url: page.url,
      scriptCount: scripts.length,
      runtimeSourceCount: matched.length,
      stopped: options.stop === true,
      ...(cleanupWarning === undefined ? {} : { cleanupWarning })
    };
  } catch (error) {
    // The native command may have saved/reset coverage before its response failed.
    rawCaptured ||= await access(rawPath).then(() => true, () => false);
    if (!rawCaptured) await rm(temporaryDirectory, { recursive: true, force: true });
    let reason = error instanceof Error ? error.message : String(error);
    if (restoreDebugger) {
      try {
        await browser.debug.disable({ tab: page.tabId });
      } catch (cleanupError) {
        reason += ` Debugger cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}.`;
      }
    }
    throw new Error(`${reason}${rawCaptured ? ` Raw coverage was retained at ${rawPath}; no enriched checkpoint was published. Coverage counts may have reset: preserve this evidence and restart the phase instead of blindly retrying capture.` : ""}`);
  }
}

async function readPageIdentity(browser: DivebellBrowserApi): Promise<PageIdentity> {
  const active = (await browser.tabs.list()).filter((tab) => tab.active);
  if (active.length !== 1 || !active[0]?.targetId) {
    throw new Error("Cannot identify one active browser target. Open and select the intended page first.");
  }
  const tab = active[0];
  const page = await browser.eval<{ url: string; timeOrigin: number }>(
    "({ url: location.href, timeOrigin: performance.timeOrigin })"
  );
  if (typeof page?.url !== "string" || !Number.isFinite(page.timeOrigin)) {
    throw new Error("Cannot read the current document identity.");
  }
  const after = (await browser.tabs.list()).filter((item) => item.active);
  if (after.length !== 1 || after[0]?.tabId !== tab.tabId || after[0]?.targetId !== tab.targetId) {
    throw new Error("The active browser target changed while reading document identity.");
  }
  return { tabId: tab.tabId, targetId: tab.targetId as string, url: page.url, timeOrigin: page.timeOrigin };
}

function matchingSession(
  sessions: DivebellBrowserDebugSession[],
  page: PageIdentity,
  sessionId: string
): DivebellBrowserDebugSession {
  const session = sessions.find((item) => item.enabled && item.sessionId === sessionId
    && item.targetId === page.targetId && item.tabId === page.tabId);
  if (!session || !Number.isFinite(session.documentGeneration)) {
    throw new Error("Cannot verify the debugger session and document for this coverage target.");
  }
  return session;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
