import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Fetcher } from "../runtime/client.js";
import { createOptionalNumberProperty, createOptionalStringProperty } from "../../utils/command.js";
import { readJsonLinesIfExists, writeJsonFile } from "./storage.js";
import { normalizeTranscriptSegments, normalizeTranscriptWords } from "./script.js";
import type { AudioCaptureSummary, AudioChunkEntry, LiveTranscriptEvent, OperationEntry, RecordingFiles, TranscriptData, TranscriptSegment, TranscriptWord } from "./types.js";

const DEFAULT_TRANSCRIPTION_MODEL = "whisper-1";
export async function transcribeAudioFile(
  fetcher: Fetcher,
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

export async function collectAudioCapture(
  outputDirectory: string,
  files: RecordingFiles,
  requested: boolean
): Promise<{
  operation: OperationEntry;
  summary: AudioCaptureSummary;
}> {
  const started = new Date();
  const audioFile = join(outputDirectory, files.audio);
  const chunksFile = join(outputDirectory, files.audioChunks);
  const eventsFile = join(outputDirectory, files.audioEvents);
  const chunks = await readJsonLinesIfExists<AudioChunkEntry>(chunksFile);
  const events = await readJsonLinesIfExists<Record<string, unknown>>(eventsFile);
  const liveTranscript = createLiveTranscriptFromAudioEvents(files, events);
  if (liveTranscript.segments.length > 0) {
    await writeJsonFile(join(outputDirectory, files.transcript), liveTranscript);
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
  return message === undefined ? "No microphone audio chunks were captured." : message;
}


function getNumberProperty(record: Record<string, unknown> | undefined, name: string): number | undefined { const value = record?.[name]; return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
