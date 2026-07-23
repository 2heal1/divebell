import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolve } from "node:path";
import { ensureJsonLinesFile, writeJsonFile } from "./storage.js";
import type { OperationEntry, RecordingFiles } from "./types.js";

const RECORD_EVENT_CONSOLE_MARKER = "__OPENRUNTIME_RECORD_EVENT__";
const RECORD_AUDIO_CONSOLE_MARKER = "__OPENRUNTIME_RECORD_AUDIO__";
const OPENRUNTIME_RECORDING_CONTROL_FILE = "recording-session.json";

export interface RecordingControl {
  outputDirectory: string;
  startedAt: string;
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
  await writeFile(eventsFile, "", "utf8");
  await ensureJsonLinesFile(audioChunksFile);
  await ensureJsonLinesFile(audioEventsFile);
  if (audioRequested) {
    await writeFile(audioFile, "");
  }
  await writeJsonFile(controlFile, {
    outputDirectory,
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

export async function readRecordingControlFile(): Promise<RecordingControl | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(
      join(resolveBrowserProfileDirectory(), OPENRUNTIME_RECORDING_CONTROL_FILE),
      "utf8"
    ));
    if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
    const control = value as Partial<RecordingControl>;
    if (typeof control.outputDirectory !== "string" || typeof control.startedAt !== "string") return undefined;
    return {
      outputDirectory: control.outputDirectory,
      startedAt: control.startedAt
    };
  } catch {
    return undefined;
  }
}

function resolveBrowserProfileDirectory(): string {
  return resolve(process.env.OPENRUNTIME_BROWSER_PROFILE_DIR ?? join(homedir(), ".openruntime", "browser-profile"));
}
