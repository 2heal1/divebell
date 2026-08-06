import type { DivebellOpenHook } from "@divebell/cli";
import { createInteractionRecorderScript } from "./capture.js";
import {
  createRecordingCompanionUrl,
  createRecordingStartPageUrl,
  RECORDING_COMPANION_LABEL
} from "./audio.js";
import {
  clearRecordingControlFile,
  readRecordingControlFile,
  updateRecordingControlFile
} from "./session.js";
import { appendJsonLine, readJsonFile, readRecordingManifest, writeJsonFile } from "./storage.js";
import type { RecordedAuthenticationRequirement, RecordedWorkflow, RecordingManifest } from "./types.js";
import { basename, join } from "node:path";

const DIVEBELL_SESSION_QUERY_PARAM = "divebellSessionId";
type OpenHookOptions = Parameters<DivebellOpenHook>[0];
type OpenHookResult = Awaited<ReturnType<DivebellOpenHook>>;

export async function runRecordingOpenHook(
  options: OpenHookOptions
): Promise<OpenHookResult> {
  const control = await readRecordingControlFile();
  if (control === undefined) return;

  const manifest = await readRecordingManifest(control.outputDirectory);
  if (control.mode === "amendment") {
    if (control.amendment === undefined) return;
    const workflow = await readJsonFile<RecordedWorkflow>(
      join(control.outputDirectory, manifest.files.workflow)
    );
    const authentication = readAuthenticationRequirement(options);
    if (!samePageUrl(workflow.startUrl, options.url)) {
      throw new Error(
        `Supplemental recording must open ${JSON.stringify(workflow.startUrl)}, not ${JSON.stringify(options.url)}.`
      );
    }
    if (workflow.requirements.authentication.mode !== authentication.mode) {
      throw new Error(
        `Supplemental recording requires --${workflow.requirements.authentication.mode}; the opened page used ${authentication.mode}.`
      );
    }
    const openedAt = new Date().toISOString();
    await updateRecordingControlFile({
      ...control,
      amendment: {
        ...control.amendment,
        status: "opened"
      }
    });
    await appendJsonLine(join(control.outputDirectory, manifest.files.operations), {
      type: "amend.page.open",
      startedAt: openedAt,
      afterStepId: control.amendment.afterStepId,
      url: options.url,
      openedUrl: options.openedUrl,
      authentication
    });
    return {
      scripts: [createInteractionRecorderScript(Date.parse(control.startedAt))]
    };
  }
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
      authentication: readAuthenticationRequirement(options),
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
        excludedPageUrls: [recordingStartUrl, companionUrl]
          .filter((url): url is string => url !== undefined)
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

function samePageUrl(expected: string, actual: string): boolean {
  try {
    const left = new URL(expected);
    const right = new URL(actual);
    left.searchParams.delete(DIVEBELL_SESSION_QUERY_PARAM);
    right.searchParams.delete(DIVEBELL_SESSION_QUERY_PARAM);
    return left.origin === right.origin &&
      left.pathname === right.pathname &&
      left.search === right.search &&
      left.hash === right.hash;
  } catch {
    return expected === actual;
  }
}

function readAuthenticationRequirement(options: OpenHookOptions): RecordedAuthenticationRequirement {
  const profile = options.args.options.get("profile")?.at(-1);
  const state = options.args.options.get("state")?.at(-1);
  if (profile !== undefined && state !== undefined) {
    throw new Error("A recording must use either --profile or --state, not both.");
  }
  if (profile !== undefined) {
    return {
      id: "setup-auth",
      mode: "profile",
      required: true,
      displayName: profile.includes("/") ? basename(profile) : profile,
      parameter: "--profile",
      status: "draft"
    };
  }
  if (state !== undefined) {
    return {
      id: "setup-auth",
      mode: "state",
      required: true,
      displayName: basename(state),
      parameter: "--state",
      status: "draft"
    };
  }
  return {
    id: "setup-auth",
    mode: "none",
    required: false,
    status: "draft"
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
