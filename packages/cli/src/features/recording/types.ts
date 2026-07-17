import type { BridgeRuntimeInfo } from "@openruntime/bridge";
import type { ParsedCliArgs } from "../../utils/args.js";
import type { BrowserRunner } from "../browser/runner.js";
import type { BridgeStarter, BridgeStateStore } from "../bridge/process.js";
import type { Fetcher } from "../runtime/client.js";
export interface RecordCommandOptions {
  args: ParsedCliArgs;
  stdout: { write(chunk: string): void };
  fetcher: Fetcher;
  browserRunner: BrowserRunner;
  bridgeUrl: string;
  bridgeStarter: BridgeStarter;
  bridgeStateStore: BridgeStateStore;
}

export interface RecordingFiles {
  manifest: string;
  runtime: string;
  pageSnapshots: string;
  domSnapshots: string;
  interactions: string;
  audio: string;
  audioChunks: string;
  audioEvents: string;
  operations: string;
  transcript: string;
}

export interface RecordingManifest {
  format: string;
  version: number;
  status?: "recording" | "completed";
  url: string;
  openedUrl: string;
  bridgeUrl: string;
  sessionId?: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  requestedDurationMs?: number;
  intervalMs: number;
  capture: {
    runtime: boolean;
    browserSnapshots: boolean;
    operations: boolean;
    video: RecordingCaptureStatus;
    audio: RecordingCaptureStatus;
  };
  counts: {
    runtimeSamples: number;
    pageSnapshots: number;
    domSnapshots: number;
    interactions: number;
    audioChunks: number;
    transcriptSegments: number;
    operations: number;
  };
  files: RecordingFiles;
  generated?: {
    script?: string;
    generatedAt?: string;
  };
}

export interface RecordingCaptureStatus {
  requested: boolean;
  status: "not-requested" | "recording" | "captured" | "not-captured" | "transcribed";
  reason?: string;
  file?: string;
  chunks?: string;
  transcript?: string;
  chunkCount?: number;
  segmentCount?: number;
}

export interface RecordingData {
  manifest: RecordingManifest;
  runtimeSamples: RuntimeSample[];
  pageSnapshots: PageSnapshotSample[];
  domSnapshots: DomSnapshotSample[];
  interactions: InteractionEvent[];
  transcript: TranscriptData;
  operations: OperationEntry[];
}

export interface RuntimeSample {
  sampledAt: string;
  ok: boolean;
  runtimes?: BridgeRuntimeInfo[];
  runtime?: BridgeRuntimeInfo;
  resources?: {
    targets?: unknown;
    snapshot?: unknown;
    actions?: unknown;
    events?: unknown;
  };
  error?: string;
}

export interface PageSnapshotSample {
  sampledAt: string;
  ok: boolean;
  result?: unknown;
  stdout?: string;
  stderr?: string;
  exitCode: number;
}

export interface DomSnapshotSample {
  sampledAt: string;
  ok: boolean;
  result?: unknown;
  stdout?: string;
  stderr?: string;
  exitCode: number;
}

export interface InteractionEvent {
  type: string;
  timeMs: number;
  url?: string;
  title?: string;
  target?: {
    selector?: string;
    tagName?: string;
    text?: string;
    value?: string;
    role?: string;
    name?: string;
    inputType?: string;
  };
  [key: string]: unknown;
}

export interface OperationEntry {
  type: string;
  startedAt: string;
  endedAt?: string;
  [key: string]: unknown;
}

export interface AudioChunkEntry {
  index: number;
  startedAt: string;
  endedAt: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  file: string;
  mimeType: string;
  size: number;
}

export interface TranscriptData {
  status: "not-requested" | "pending" | "completed" | "failed";
  audio?: string;
  model?: string;
  transcribedAt?: string;
  text?: string;
  segments: TranscriptSegment[];
  words?: TranscriptWord[];
  error?: string;
}

export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface TranscriptWord {
  startMs: number;
  endMs: number;
  text: string;
}

export interface LiveTranscriptEvent {
  type: "speech-result";
  timeMs?: number;
  startMs?: number;
  endMs?: number;
  text?: string;
  confidence?: number;
}

export interface AudioCaptureSummary {
  requested: boolean;
  chunkCount: number;
  audioFile: string;
  chunksFile: string;
  eventsFile: string;
  status: RecordingCaptureStatus["status"];
  reason?: string;
}

export interface GeneratedScriptResult {
  path: string;
  relativePath: string;
}
