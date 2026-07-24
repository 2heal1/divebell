import type { OpenRuntimeOpenHook } from "@openruntime/cli";
import { createInteractionRecorderScript } from "./capture.js";
import { clearRecordingControlFile, readRecordingControlFile } from "./session.js";
import { appendJsonLine, readRecordingManifest, writeJsonFile } from "./storage.js";
import type { RecordingManifest } from "./types.js";
import { join } from "node:path";

const OPEN_RUNTIME_SESSION_QUERY_PARAM = "openruntimeSessionId";
type OpenHookOptions = Parameters<OpenRuntimeOpenHook>[0];
type OpenHookResult = Awaited<ReturnType<OpenRuntimeOpenHook>>;

export async function runRecordingOpenHook(
  options: OpenHookOptions
): Promise<OpenHookResult> {
  const control = await readRecordingControlFile();
  if (control === undefined) return;

  const manifest = await readRecordingManifest(control.outputDirectory);
  if (manifest.status === "completed") return;

  const page = {
    url: options.url,
    openedUrl: options.openedUrl,
    bridgeUrl: createBridgeUrl(options.args),
    sessionId: readSessionId(options.openedUrl)
  };
  const operationPath = join(control.outputDirectory, manifest.files.operations);

  if (manifest.status === "recording" && !recordingPageMatches(manifest, page)) {
    const invalidatedAt = new Date().toISOString();
    await writeJsonFile(join(control.outputDirectory, manifest.files.manifest), {
      ...manifest,
      invalidated: {
        reason: "Another openruntime open replaced the page while recording was active.",
        url: page.url,
        openedUrl: page.openedUrl,
        invalidatedAt
      }
    } satisfies RecordingManifest);
    await appendJsonLine(operationPath, {
      type: "record.page.changed",
      startedAt: invalidatedAt,
      url: page.url,
      openedUrl: page.openedUrl,
      bridgeUrl: page.bridgeUrl,
      sessionId: page.sessionId
    });
    await clearRecordingControlFile();
    return;
  } else if (manifest.status === "prepared") {
    const attachedAt = new Date().toISOString();
    await writeJsonFile(join(control.outputDirectory, manifest.files.manifest), {
      ...manifest,
      status: "recording",
      url: page.url,
      openedUrl: page.openedUrl,
      bridgeUrl: page.bridgeUrl,
      ...(page.sessionId === null ? {} : { sessionId: page.sessionId })
    } satisfies RecordingManifest);
    await appendJsonLine(operationPath, {
      type: "record.page.open",
      startedAt: attachedAt,
      ...page
    });
  }

  return {
    scripts: [createInteractionRecorderScript(Date.parse(control.startedAt))]
  };
}

function createBridgeUrl(args: OpenHookOptions["args"]): string | null {
  if (args.options.has("no-bridge")) return null;
  const bridge = args.options.get("bridge")?.at(-1);
  if (bridge !== undefined) return trimTrailingSlash(bridge);
  const port = args.options.get("port")?.at(-1);
  return `http://localhost:${port ?? "17321"}`;
}

function readSessionId(openedUrl: string): string | null {
  try {
    return new URL(openedUrl).searchParams.get(OPEN_RUNTIME_SESSION_QUERY_PARAM);
  } catch {
    return null;
  }
}

function recordingPageMatches(
  manifest: RecordingManifest,
  page: { url: string; openedUrl: string; bridgeUrl: string | null; sessionId: string | null }
): boolean {
  return manifest.url === page.url &&
    manifest.openedUrl === page.openedUrl &&
    manifest.bridgeUrl === page.bridgeUrl &&
    (manifest.sessionId ?? null) === page.sessionId;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
