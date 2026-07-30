import type { DivebellOpenHook } from "@divebell/cli";
import { createInteractionRecorderScript } from "./capture.js";
import {
  createRecordingCompanionUrl,
  createRecordingStartPageUrl,
  RECORDING_COMPANION_LABEL
} from "./audio.js";
import { clearRecordingControlFile, readRecordingControlFile } from "./session.js";
import { appendJsonLine, readRecordingManifest, writeJsonFile } from "./storage.js";
import type { RecordingManifest } from "./types.js";
import { join } from "node:path";

const DIVEBELL_SESSION_QUERY_PARAM = "divebellSessionId";
type OpenHookOptions = Parameters<DivebellOpenHook>[0];
type OpenHookResult = Awaited<ReturnType<DivebellOpenHook>>;

export async function runRecordingOpenHook(
  options: OpenHookOptions
): Promise<OpenHookResult> {
  const control = await readRecordingControlFile();
  if (control === undefined) return;

  const manifest = await readRecordingManifest(control.outputDirectory);
  if (manifest.status === "completed") return;

  const recordingStartUrl = options.url === "about:blank"
    ? createRecordingStartPageUrl(options.bridgeUrl, options.openedUrl, control.startedAt)
    : undefined;
  const page = {
    url: options.url,
    openedUrl: recordingStartUrl ?? options.openedUrl,
    bridgeUrl: options.bridgeUrl,
    sessionId: readSessionId(recordingStartUrl ?? options.openedUrl)
  };
  const operationPath = join(control.outputDirectory, manifest.files.operations);

  if (manifest.status === "recording" && !recordingPageMatches(manifest, page)) {
    const invalidatedAt = new Date().toISOString();
    await writeJsonFile(join(control.outputDirectory, manifest.files.manifest), {
      ...manifest,
      invalidated: {
        reason: "Another divebell open replaced the page while recording was active.",
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

  const companionUrl = manifest.capture.audio.requested
    ? createRecordingCompanionUrl(options.bridgeUrl, control.startedAt, manifest.intervalMs)
    : undefined;
  return {
    ...(recordingStartUrl === undefined ? {} : { openedUrl: recordingStartUrl }),
    scripts: [
      createInteractionRecorderScript(Date.parse(control.startedAt), {
        ...(companionUrl === undefined ? {} : { companionUrl })
      })
    ],
    ...(companionUrl === undefined
      ? {}
      : {
          companionPages: [{
            url: companionUrl,
            label: RECORDING_COMPANION_LABEL,
            waitFor: {
              script: "globalThis.__DIVEBELL_AUDIO_RECORDER__?.status !== 'requesting'",
              timeout: 30_000
            }
          }]
        })
  };
}

function readSessionId(openedUrl: string): string | null {
  try {
    return new URL(openedUrl).searchParams.get(DIVEBELL_SESSION_QUERY_PARAM);
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
