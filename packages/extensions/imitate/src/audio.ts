import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readJsonLinesIfExists, writeJsonFile, writeJsonLines } from "./storage.js";
import { normalizeTranscriptSegments, normalizeTranscriptWords } from "./script.js";
import type { DivebellBrowserApi } from "@divebell/cli";
import type { AudioCaptureSummary, AudioChunkEntry, LiveTranscriptEvent, OperationEntry, RecordingFiles, TranscriptData, TranscriptSegment, TranscriptWord } from "./types.js";

const DEFAULT_TRANSCRIPTION_MODEL = "whisper-1";
const RECORDING_COMPANION_PATH = "/__divebell/recorder";
const RECORDING_START_PAGE_PATH = "/__divebell/recording-start";
export const RECORDING_COMPANION_LABEL = "divebell-recorder";

export function createRecordingCompanionUrl(
  bridgeUrl: string | null | undefined,
  startedAt: string,
  chunkMs = 1000
): string | undefined {
  if (bridgeUrl === null || bridgeUrl === undefined) return undefined;
  const url = new URL(RECORDING_COMPANION_PATH, `${bridgeUrl.replace(/\/+$/u, "")}/`);
  url.searchParams.set("startedAt", startedAt);
  url.searchParams.set("chunkMs", String(chunkMs));
  return url.toString();
}

export function createRecordingStartPageUrl(
  bridgeUrl: string | null,
  openedUrl: string,
  startedAt: string
): string | undefined {
  if (bridgeUrl === null) return undefined;
  const url = new URL(RECORDING_START_PAGE_PATH, `${bridgeUrl.replace(/\/+$/u, "")}/`);
  url.searchParams.set("startedAt", startedAt);
  const sessionId = readUrlSearchParam(openedUrl, "divebellSessionId");
  if (sessionId !== undefined) {
    url.searchParams.set("divebellSessionId", sessionId);
  }
  return url.toString();
}

export async function transcribeAudioFile(
  fetcher: typeof fetch,
  audioPath: string,
  apiKey: string,
  model: string
): Promise<{
  text: string;
  segments: TranscriptSegment[];
  words: TranscriptWord[];
}> {
  const audio = await readFile(audioPath);
  const form = new FormData();
  form.set("file", new Blob([audio], { type: "audio/webm" }), "audio.webm");
  form.set("model", model);
  if (model === DEFAULT_TRANSCRIPTION_MODEL) {
    form.set("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "segment");
    form.append("timestamp_granularities[]", "word");
  } else {
    form.set("response_format", "json");
  }

  const response = await fetcher("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`
    },
    body: form
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text.length === 0 ? `Audio transcription failed with status ${response.status}.` : text);
  }

  const parsed = JSON.parse(text) as {
    text?: unknown;
    segments?: unknown;
    words?: unknown;
  };
  return {
    text: typeof parsed.text === "string" ? parsed.text : "",
    segments: normalizeTranscriptSegments(parsed.segments, parsed.text),
    words: normalizeTranscriptWords(parsed.words)
  };
}

function createOptionalNumberProperty<Name extends string>(
  name: Name,
  value: number | undefined
): Record<Name, number> | Record<string, never> {
  return value === undefined ? {} : { [name]: value } as Record<Name, number>;
}

function createOptionalStringProperty<Name extends string>(
  name: Name,
  value: string | undefined
): Record<Name, string> | Record<string, never> {
  return value === undefined ? {} : { [name]: value } as Record<Name, string>;
}

export async function collectAudioCapture(
  outputDirectory: string,
  files: RecordingFiles,
  requested: boolean,
  browser?: DivebellBrowserApi,
  recorder?: {
    url: string;
    startedAt: string;
  }
): Promise<{
  operation: OperationEntry;
  summary: AudioCaptureSummary;
}> {
  const started = new Date();
  const audioFile = join(outputDirectory, files.audio);
  const chunksFile = join(outputDirectory, files.audioChunks);
  const eventsFile = join(outputDirectory, files.audioEvents);
  if (requested && browser !== undefined && recorder !== undefined) {
    try {
      await persistBrowserAudioCapture(
        outputDirectory,
        files,
        browser,
        recorder.url,
        recorder.startedAt
      );
    } catch (error) {
      const existingEvents = await readJsonLinesIfExists<Record<string, unknown>>(eventsFile);
      await writeJsonLines(eventsFile, [
        ...existingEvents,
        {
          type: "audio-error",
          timeMs: Math.max(0, Date.now() - Date.parse(recorder.startedAt)),
          message: error instanceof Error ? error.message : String(error)
        }
      ]);
    }
  }
  const chunks = await readJsonLinesIfExists<AudioChunkEntry>(chunksFile);
  const events = await readJsonLinesIfExists<Record<string, unknown>>(eventsFile);
  const liveTranscript = createLiveTranscriptFromAudioEvents(files, events);
  if (liveTranscript.segments.length > 0) {
    await writeJsonFile(join(outputDirectory, files.transcript), liveTranscript);
  } else if (requested && chunks.length === 0) {
    await writeJsonFile(join(outputDirectory, files.transcript), {
      status: "not-captured",
      segments: []
    } satisfies TranscriptData);
  }
  const summary: AudioCaptureSummary = {
    requested,
    chunkCount: chunks.length,
    audioFile,
    chunksFile,
    eventsFile,
    status: requested && chunks.length > 0 ? "captured" : requested ? "not-captured" : "not-requested",
    ...createOptionalStringProperty("reason", createAudioCaptureReason(requested, chunks, events))
  };
  return {
    operation: {
      type: "audio.collect",
      startedAt: started.toISOString(),
      endedAt: new Date().toISOString(),
      requested,
      chunkCount: chunks.length,
      audioFile,
      chunksFile,
      eventsFile,
      status: summary.status,
      transcriptSegmentCount: liveTranscript.segments.length,
      ...createOptionalStringProperty("reason", summary.reason)
    },
    summary
  };
}

async function persistBrowserAudioCapture(
  outputDirectory: string,
  files: RecordingFiles,
  browser: DivebellBrowserApi,
  recorderUrl: string,
  recordingStartedAt: string
): Promise<void> {
  const tabs = await browser.tabs.list();
  const recorderTab = tabs.find((tab) =>
    typeof tab.url === "string" && recordingCompanionMatches(tab.url, recorderUrl)
  );
  const recorderTabId = typeof recorderTab?.tabId === "string" ? recorderTab.tabId : undefined;
  if (recorderTabId === undefined) {
    throw new Error("The microphone recording page was not found.");
  }
  const activeTabId = tabs.find((tab) => tab.active === true && typeof tab.tabId === "string")?.tabId;
  await browser.tabs.activate(recorderTabId);

  try {
    const capture = await browser.eval<BrowserAudioCaptureResult>(createStopBrowserAudioScript());
    if (
      capture === null ||
      typeof capture !== "object" ||
      !Number.isInteger(capture.chunkCount) ||
      capture.chunkCount < 0 ||
      capture.chunkCount > 100_000 ||
      !Array.isArray(capture.chunks) ||
      !Array.isArray(capture.events)
    ) {
      throw new Error("The microphone recording page returned invalid audio data.");
    }

    const audioBuffers: Buffer[] = [];
    const chunkEntries: AudioChunkEntry[] = [];
    const chunksDirectory = join(outputDirectory, "audio-chunks");
    await mkdir(chunksDirectory, { recursive: true });
    for (let index = 0; index < capture.chunkCount; index += 1) {
      const metadata = capture.chunks[index];
      if (metadata === undefined) {
        throw new Error(`Microphone audio chunk ${index} is missing metadata.`);
      }
      const encoded = await browser.eval<string>(createReadBrowserAudioChunkScript(index));
      if (typeof encoded !== "string") {
        throw new Error(`Microphone audio chunk ${index} is invalid.`);
      }
      const bytes = Buffer.from(encoded, "base64");
      const fileName = `chunk-${String(index).padStart(6, "0")}.webm`;
      await writeFile(join(chunksDirectory, fileName), bytes);
      audioBuffers.push(bytes);
      const startMs = normalizeAudioTime(metadata.startMs);
      const endMs = Math.max(startMs, normalizeAudioTime(metadata.endMs));
      chunkEntries.push({
        index,
        startedAt: new Date(Date.parse(recordingStartedAt) + startMs).toISOString(),
        endedAt: new Date(Date.parse(recordingStartedAt) + endMs).toISOString(),
        startMs,
        endMs,
        durationMs: endMs - startMs,
        file: `audio-chunks/${fileName}`,
        mimeType: normalizeAudioMimeType(metadata.mimeType, capture.mimeType),
        size: bytes.length
      });
    }
    await writeFile(join(outputDirectory, files.audio), Buffer.concat(audioBuffers));
    await writeJsonLines(join(outputDirectory, files.audioChunks), chunkEntries);
    await writeJsonLines(join(outputDirectory, files.audioEvents), capture.events);
  } finally {
    if (typeof activeTabId === "string" && activeTabId !== recorderTabId) {
      await browser.tabs.activate(activeTabId);
    }
  }
}

interface BrowserAudioCaptureResult {
  status: string;
  mimeType: string;
  chunkCount: number;
  chunks: Array<{
    startMs?: unknown;
    endMs?: unknown;
    mimeType?: unknown;
    size?: unknown;
  }>;
  events: Array<Record<string, unknown>>;
}

function createStopBrowserAudioScript(): string {
  return [
    "(async () => {",
    "  const recorder = globalThis.__DIVEBELL_AUDIO_RECORDER__;",
    "  if (recorder === undefined || typeof recorder.stop !== 'function') {",
    "    throw new Error('The microphone recorder is not ready.');",
    "  }",
    "  return await recorder.stop();",
    "})()"
  ].join("\n");
}

function createReadBrowserAudioChunkScript(index: number): string {
  return [
    "(async () => {",
    "  const recorder = globalThis.__DIVEBELL_AUDIO_RECORDER__;",
    "  if (recorder === undefined || typeof recorder.readChunk !== 'function') {",
    "    throw new Error('The microphone recorder is not ready.');",
    "  }",
    `  return await recorder.readChunk(${JSON.stringify(index)});`,
    "})()"
  ].join("\n");
}

function recordingCompanionMatches(actual: string, expected: string): boolean {
  try {
    const actualUrl = new URL(actual);
    const expectedUrl = new URL(expected);
    return actualUrl.origin === expectedUrl.origin &&
      actualUrl.pathname === expectedUrl.pathname &&
      actualUrl.searchParams.get("startedAt") === expectedUrl.searchParams.get("startedAt");
  } catch {
    return actual === expected;
  }
}

function normalizeAudioTime(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
}

function normalizeAudioMimeType(value: unknown, fallback: unknown): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof fallback === "string" && fallback.length > 0) return fallback;
  return "audio/webm";
}

function readUrlSearchParam(value: string, name: string): string | undefined {
  try {
    return new URL(value).searchParams.get(name) ?? undefined;
  } catch {
    return undefined;
  }
}

function createLiveTranscriptFromAudioEvents(files: RecordingFiles, events: Array<Record<string, unknown>>): TranscriptData {
  const speechEvents = events
    .map((event) => normalizeLiveTranscriptEvent(event))
    .filter((event): event is LiveTranscriptEvent => event !== undefined);
  if (speechEvents.length === 0) {
    return {
      status: "pending",
      audio: files.audio,
      segments: []
    };
  }
  const segments = speechEvents.map((event) => {
    const endMs = event.endMs ?? event.timeMs ?? 0;
    const startMs = event.startMs ?? Math.max(0, endMs - estimateSpeechDurationMs(event.text ?? ""));
    return {
      startMs,
      endMs,
      text: event.text ?? ""
    };
  });
  return {
    status: "completed",
    audio: files.audio,
    model: "browser-speech-recognition",
    transcribedAt: new Date().toISOString(),
    text: segments.map((segment) => segment.text).join(" ").trim(),
    segments
  };
}

function normalizeLiveTranscriptEvent(event: Record<string, unknown>): LiveTranscriptEvent | undefined {
  if (event.type !== "speech-result") return undefined;
  const text = typeof event.text === "string" ? event.text.trim() : "";
  if (text.length === 0) return undefined;
  return {
    type: "speech-result",
    ...createOptionalNumberProperty("timeMs", getNumberProperty(event, "timeMs")),
    ...createOptionalNumberProperty("startMs", getNumberProperty(event, "startMs")),
    ...createOptionalNumberProperty("endMs", getNumberProperty(event, "endMs")),
    text,
    ...createOptionalNumberProperty("confidence", getNumberProperty(event, "confidence"))
  };
}

function estimateSpeechDurationMs(text: string): number {
  const normalized = text.trim();
  if (normalized.length === 0) return 0;
  return Math.min(12_000, Math.max(1200, normalized.length * 180));
}

function createAudioCaptureReason(
  requested: boolean,
  chunks: AudioChunkEntry[],
  events: Array<Record<string, unknown>>
): string | undefined {
  if (!requested) return "Microphone capture was not requested.";
  if (chunks.length > 0) return undefined;
  const errorEvent = [...events].reverse().find((event) => event.type === "audio-error");
  const message = typeof errorEvent?.message === "string" ? errorEvent.message : undefined;
  return message === undefined
    ? "No usable microphone audio was captured; browser replay generation continued without it."
    : `${message} Browser replay generation continued without microphone audio.`;
}


function getNumberProperty(record: Record<string, unknown> | undefined, name: string): number | undefined { const value = record?.[name]; return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
