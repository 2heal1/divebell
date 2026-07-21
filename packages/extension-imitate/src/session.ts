import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolve } from "node:path";
import type { OpenRuntimeBrowserApi } from "@openruntime/cli";
import { ensureJsonLinesFile, writeJsonFile } from "./storage.js";
import type { OperationEntry, RecordCommandOptions, RecordingFiles } from "./types.js";

const RECORD_EVENT_CONSOLE_MARKER = "__OPENRUNTIME_RECORD_EVENT__";
const RECORD_AUDIO_CONSOLE_MARKER = "__OPENRUNTIME_RECORD_AUDIO__";
const OPENRUNTIME_RECORDING_CONTROL_FILE = "recording-session.json";
export async function ensureRecordBridge(options: RecordCommandOptions, bridgeUrl: string): Promise<void> {
  const port = getNumberOption(options.args, "port");
  await options.openruntime.scope({ bridge: bridgeUrl }).ensureBridge(port === undefined ? {} : { port });
}

export async function tryEnsureRecordBridge(
  options: RecordCommandOptions,
  bridgeUrl: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await ensureRecordBridge(options, bridgeUrl);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function openRecordingBrowser(options: RecordCommandOptions, openedUrl: string): Promise<OperationEntry> {
  const openStartedAt = new Date();
  const openResult = await options.openruntime.browser.raw(["open", openedUrl], {
    ui: !hasOption(options.args, "headless")
  });
  const operation: OperationEntry = {
    type: "browser.open",
    url: openedUrl,
    startedAt: openStartedAt.toISOString(),
    endedAt: new Date().toISOString(),
    exitCode: openResult.exitCode,
    stdout: openResult.stdout.trim(),
    stderr: openResult.stderr.trim()
  };
  if (openResult.exitCode !== 0) {
    throw new Error(openResult.stderr.trim() || openResult.stdout.trim() || "Could not open browser for recording.");
  }
  return operation;
}

export function createSkippedBrowserOpenOperation(openedUrl: string): OperationEntry {
  return {
    type: "browser.open",
    url: openedUrl,
    startedAt: new Date().toISOString(),
    skipped: true,
    reason: "--no-open was set"
  };
}

export async function closeRecordingBrowser(browser: OpenRuntimeBrowserApi): Promise<OperationEntry> {
  const closeStartedAt = new Date();
  const closeResult = await browser.raw(["close"]);
  return {
    type: "browser.close",
    startedAt: closeStartedAt.toISOString(),
    endedAt: new Date().toISOString(),
    exitCode: closeResult.exitCode,
    stdout: closeResult.stdout.trim(),
    stderr: closeResult.stderr.trim()
  };
}

export async function writeRecordingControlFile(
  outputDirectory: string,
  files: RecordingFiles,
  startedAt: Date,
  audioRequested: boolean
): Promise<OperationEntry> {
  const operationStartedAt = new Date();
  const profileDirectory = resolveBrowserProfileDirectory();
  const controlFile = join(profileDirectory, OPENRUNTIME_RECORDING_CONTROL_FILE);
  const eventsFile = join(outputDirectory, "interaction-events.raw.jsonl");
  const audioFile = join(outputDirectory, files.audio);
  const audioChunksFile = join(outputDirectory, files.audioChunks);
  const audioEventsFile = join(outputDirectory, files.audioEvents);
  const audioChunksDirectory = join(outputDirectory, "audio-chunks");
  await mkdir(profileDirectory, { recursive: true });
  await mkdir(audioChunksDirectory, { recursive: true });
  await writeJsonFile(controlFile, {
    marker: RECORD_EVENT_CONSOLE_MARKER,
    eventsFile,
    startedAt: startedAt.toISOString(),
    audio: audioRequested
      ? {
        marker: RECORD_AUDIO_CONSOLE_MARKER,
        audioFile,
        chunksFile: audioChunksFile,
        eventsFile: audioEventsFile,
        chunksDirectory: audioChunksDirectory,
        recorderUrl: "https://openruntime-recorder.localhost/recorder",
        startedAt: startedAt.toISOString(),
        chunkMs: 1000
      }
      : undefined
  });
  await writeFile(eventsFile, "", "utf8");
  await ensureJsonLinesFile(audioChunksFile);
  await ensureJsonLinesFile(audioEventsFile);
  if (audioRequested) {
    await writeFile(audioFile, "");
  }
  return {
    type: "recording.control.write",
    startedAt: operationStartedAt.toISOString(),
    endedAt: new Date().toISOString(),
    profileDirectory,
    controlFile,
    eventsFile,
    audioRequested,
    ...(audioRequested
      ? {
        audioFile,
        audioChunksFile,
        audioEventsFile
      }
      : {})
  };
}

export async function clearRecordingControlFile(): Promise<void> {
  await rm(join(resolveBrowserProfileDirectory(), OPENRUNTIME_RECORDING_CONTROL_FILE), {
    force: true
  });
}

export async function resetRecordingBrowser(browser: OpenRuntimeBrowserApi): Promise<OperationEntry> {
  const started = new Date();
  const result = await browser.raw(["close"]);
  return {
    type: "browser.reset",
    startedAt: started.toISOString(),
    endedAt: new Date().toISOString(),
    exitCode: result.exitCode,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim()
  };
}

function resolveBrowserProfileDirectory(): string {
  return resolve(process.env.OPENRUNTIME_BROWSER_PROFILE_DIR ?? join(homedir(), ".openruntime", "browser-profile"));
}

function getNumberOption(args: RecordCommandOptions["args"], name: string): number | undefined {
  const value = args.options.get(name)?.at(-1);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function hasOption(args: RecordCommandOptions["args"], name: string): boolean {
  return args.options.has(name);
}
