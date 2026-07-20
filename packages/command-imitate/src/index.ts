import { mkdir } from "node:fs/promises";
import { collectInteractionEvents, sampleDomSnapshot, samplePageSnapshot, sampleRuntime, setRecordingInstrumentation } from "./capture.js";
import { collectAudioCapture, transcribeAudioFile } from "./audio.js";
import { clearRecordingControlFile, closeRecordingBrowser, createSkippedBrowserOpenOperation, ensureRecordBridge, openRecordingBrowser, resetRecordingBrowser, tryEnsureRecordBridge, writeRecordingControlFile } from "./session.js";
import { createManifestPath, writeGeneratedScript } from "./script.js";
import { appendJsonLine, createRecordingFiles, readRecordingCounts, readRecordingData, writeJsonFile, writeJsonLines, writeRecordingFiles } from "./storage.js";
import { join, resolve } from "node:path";
import type { OpenRuntimeCommandDefinition, ParsedCliArgs } from "@openruntime/cli";

import type { RecordCommandOptions, RecordingFiles, RecordingManifest, RecordingCaptureStatus, RuntimeSample, PageSnapshotSample, DomSnapshotSample, InteractionEvent, OperationEntry, TranscriptData, AudioCaptureSummary, GeneratedScriptResult } from "./types.js";
export type * from "./types.js";
const OPEN_RUNTIME_SESSION_QUERY_PARAM = "openruntimeSessionId";

interface RuntimeSelector {
  runtimeId?: string;
  sessionId?: string;
  url?: string;
}
const DEFAULT_RECORD_DURATION_MS = 10_000;
const DEFAULT_RECORD_INTERVAL_MS = 1_000;
const DEFAULT_RECORD_START_URL = "about:blank";
const RECORDING_FORMAT = "openruntime-recording";
const RECORDING_VERSION = 1;
const DEFAULT_TRANSCRIPTION_MODEL = "whisper-1";

const command: OpenRuntimeCommandDefinition = {
  schemaVersion: 1,
  name: "record",
  commandReferences: [
    {
      category: "Commands",
      usage: "openruntime record --url <url> --out <path> [--duration <ms>] [--interval <ms>] [--mic] [--headless] [--no-open]",
      description: "Open a page for a fixed duration and create an .orrec package with page snapshots, DOM, interactions, OpenRuntime state, and optional microphone audio."
    },
    {
      category: "Commands",
      usage: "openruntime record start [--url <url>] [--out <path>] [--interval <ms>] [--mic] [--headless] [--no-open]",
      description: "Start a manual recording; open a blank page when URL is omitted and write under ./recordings when out is omitted."
    },
    {
      category: "Commands",
      usage: "openruntime record stop --out <path> [--script-out <path>] [--no-close] [--no-script]",
      description: "Stop a manual recording, capture final interactions and state, then close the browser and draft a script by default."
    },
    {
      category: "Commands",
      usage: "openruntime record generate-script --input <path> [--out <path>]",
      description: "Regenerate a JavaScript script draft from an existing .orrec recording."
    },
    {
      category: "Commands",
      usage: "openruntime record transcribe --input <path> [--audio <path>] [--model <model>] [--api-key <key>]",
      description: "Transcribe microphone audio from an .orrec recording into timestamped text."
    }
  ],
  run: async (options) => await runRecordCommand({
    args: options.args,
    stdout: options.stdout,
    fetcher: options.fetcher,
    openruntime: options.openruntime,
    bridgeUrl: createBridgeUrl(options.args)
  })
};

export default command;

export async function runRecordCommand(options: RecordCommandOptions): Promise<number> {
  const subcommand = options.args.command[1];
  if (subcommand === "start") {
    return await runRecordStartCommand(options);
  }
  if (subcommand === "stop") {
    return await runRecordStopCommand(options);
  }
  if (subcommand === "generate-script") {
    return await runRecordGenerateScriptCommand(options);
  }
  if (subcommand === "transcribe") {
    return await runRecordTranscribeCommand(options);
  }

  return await runRecordFixedDurationCommand(options);
}

async function runRecordStartCommand(options: RecordCommandOptions): Promise<number> {
  const requestedUrl = getRecordUrl(options.args, "start");
  const url = requestedUrl ?? DEFAULT_RECORD_START_URL;
  const startedAt = new Date();
  const outputDirectory = resolveRecordStartOutputDirectory(options.args, startedAt);
  const intervalMs = getPositiveNumberOption(options.args, "interval") ?? DEFAULT_RECORD_INTERVAL_MS;
  const sessionId = getOptionValue(options.args, "session");
  const runtimeSelector = createRecordRuntimeSelector(requestedUrl, sessionId, getOptionValue(options.args, "runtime"));
  const openedUrl = withOpenRuntimeSession(url, sessionId);
  const files = createRecordingFiles();
  const operations: OperationEntry[] = [
    {
      type: "record.start",
      startedAt: startedAt.toISOString()
    }
  ];
  const runtimeSamples: RuntimeSample[] = [];
  const pageSnapshots: PageSnapshotSample[] = [];
  const domSnapshots: DomSnapshotSample[] = [];
  const interactions: InteractionEvent[] = [];

  await mkdir(outputDirectory, { recursive: true });
  operations.push(await writeRecordingControlFile(outputDirectory, files, startedAt, hasOption(options.args, "mic")));
  operations.push(await resetRecordingBrowser(options.openruntime.browser));
  await ensureRecordBridge(options, options.bridgeUrl);

  if (!hasOption(options.args, "no-open")) {
    operations.push(await openRecordingBrowser(options, openedUrl));
  } else {
    operations.push(createSkippedBrowserOpenOperation(openedUrl));
  }
  operations.push(await setRecordingInstrumentation(options.openruntime.browser, outputDirectory, startedAt));

  const sampledAt = new Date();
  const [runtimeSample, pageSnapshot, domSnapshot] = await Promise.all([
    sampleRuntime(options.openruntime, runtimeSelector, sampledAt),
    samplePageSnapshot(options.openruntime.browser, sampledAt),
    sampleDomSnapshot(options.openruntime.browser, sampledAt)
  ]);
  runtimeSamples.push(runtimeSample);
  pageSnapshots.push(pageSnapshot);
  domSnapshots.push(domSnapshot);

  const manifest = createRecordingManifest({
    args: options.args,
    url,
    openedUrl,
    bridgeUrl: options.bridgeUrl,
    sessionId,
    startedAt,
    intervalMs,
    status: "recording",
    files,
    counts: {
      runtimeSamples: runtimeSamples.length,
      pageSnapshots: pageSnapshots.length,
      domSnapshots: domSnapshots.length,
      interactions: interactions.length,
      audioChunks: 0,
      transcriptSegments: 0,
      operations: operations.length
    }
  });

  await writeRecordingFiles(outputDirectory, manifest, runtimeSamples, pageSnapshots, domSnapshots, interactions, operations);

  writeJson(options.stdout, {
    ok: true,
    status: "recording",
    output: outputDirectory,
    manifest: join(outputDirectory, files.manifest),
    next: `open-runtime record stop --out ${outputDirectory}`
  });
  return 0;
}

async function runRecordStopCommand(options: RecordCommandOptions): Promise<number> {
  const outputDirectory = resolve(requireOption(options.args, "out"));
  const recording = await readRecordingData(outputDirectory);
  const bridgeUrl = resolveRecordingBridgeUrl(options.args, options.bridgeUrl, recording.manifest);
  const sessionId = getOptionValue(options.args, "session") ?? recording.manifest.sessionId;
  const runtimeSelector = createRecordRuntimeSelector(
    recording.manifest.url,
    sessionId,
    getOptionValue(options.args, "runtime")
  );
  const scopedOpenRuntime = options.openruntime.scope({
    bridge: bridgeUrl,
    ...(recording.manifest.url === DEFAULT_RECORD_START_URL ? {} : { url: recording.manifest.url }),
    ...(sessionId === undefined ? {} : { session: sessionId })
  });
  const stopStartedAt = new Date();

  const bridge = await tryEnsureRecordBridge(options, bridgeUrl);

  const sampledAt = new Date();
  const [runtimeSample, pageSnapshot, domSnapshot] = await Promise.all([
    sampleRuntime(scopedOpenRuntime, runtimeSelector, sampledAt),
    samplePageSnapshot(scopedOpenRuntime.browser, sampledAt),
    sampleDomSnapshot(scopedOpenRuntime.browser, sampledAt)
  ]);
  await appendJsonLine(join(outputDirectory, recording.manifest.files.runtime), runtimeSample);
  await appendJsonLine(join(outputDirectory, recording.manifest.files.pageSnapshots), pageSnapshot);
  await appendJsonLine(join(outputDirectory, recording.manifest.files.domSnapshots), domSnapshot);

  const interactionCollection = await collectInteractionEvents(outputDirectory, options.openruntime.browser);
  await writeJsonLines(join(outputDirectory, recording.manifest.files.interactions), interactionCollection.interactions);
  await appendJsonLine(join(outputDirectory, recording.manifest.files.operations), interactionCollection.operation);

  const audioCollection = await collectAudioCapture(outputDirectory, recording.manifest.files, recording.manifest.capture.audio.requested);
  await appendJsonLine(join(outputDirectory, recording.manifest.files.operations), audioCollection.operation);

  const stopOperation: OperationEntry = {
    type: "record.stop",
    startedAt: stopStartedAt.toISOString(),
    endedAt: new Date().toISOString()
  };
  await appendJsonLine(join(outputDirectory, recording.manifest.files.operations), stopOperation);

  let closeOperation: OperationEntry | undefined;
  if (!hasOption(options.args, "no-close")) {
    closeOperation = await closeRecordingBrowser(options.openruntime.browser);
    await appendJsonLine(join(outputDirectory, recording.manifest.files.operations), closeOperation);
  } else {
    closeOperation = {
      type: "browser.close",
      startedAt: new Date().toISOString(),
      skipped: true,
      reason: "--no-close was set"
    };
    await appendJsonLine(join(outputDirectory, recording.manifest.files.operations), closeOperation);
  }
  await clearRecordingControlFile();

  const refreshedRecording = await readRecordingData(outputDirectory);
  let generatedScript: GeneratedScriptResult | undefined;
  if (!hasOption(options.args, "no-script")) {
    generatedScript = await writeGeneratedScript(
      outputDirectory,
      refreshedRecording,
      getOptionValue(options.args, "script-out")
    );
    await appendJsonLine(join(outputDirectory, recording.manifest.files.operations), {
      type: "script.generated",
      startedAt: new Date().toISOString(),
      path: generatedScript.path
    });
  }

  const completedAt = new Date();
  const counts = await readRecordingCounts(outputDirectory, recording.manifest.files);
  const manifest: RecordingManifest = {
    ...recording.manifest,
    bridgeUrl,
    status: "completed",
    endedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - Date.parse(recording.manifest.startedAt),
    capture: {
      ...recording.manifest.capture,
      audio: createCompletedAudioCapture(recording.manifest.files, audioCollection.summary)
    },
    counts,
    ...createOptionalGeneratedProperty(generatedScript)
  };
  await writeJsonFile(join(outputDirectory, recording.manifest.files.manifest), manifest);

  writeJson(options.stdout, {
    ok: true,
    status: "completed",
    output: outputDirectory,
    manifest: join(outputDirectory, recording.manifest.files.manifest),
    script: generatedScript?.path,
    bridge,
    close: closeOperation,
    counts: manifest.counts
  });
  return 0;
}

async function runRecordGenerateScriptCommand(options: RecordCommandOptions): Promise<number> {
  const inputDirectory = resolve(requireOption(options.args, "input"));
  const recording = await readRecordingData(inputDirectory);
  const generatedScript = await writeGeneratedScript(inputDirectory, recording, getOptionValue(options.args, "out"));
  const generatedAt = new Date().toISOString();
  const manifest: RecordingManifest = {
    ...recording.manifest,
    generated: {
      ...(recording.manifest.generated ?? {}),
      script: generatedScript.relativePath,
      generatedAt
    }
  };
  await appendJsonLine(join(inputDirectory, recording.manifest.files.operations), {
    type: "script.generated",
    startedAt: generatedAt,
    path: generatedScript.path
  });
  const counts = await readRecordingCounts(inputDirectory, recording.manifest.files);
  await writeJsonFile(join(inputDirectory, recording.manifest.files.manifest), {
    ...manifest,
    counts
  });

  writeJson(options.stdout, {
    ok: true,
    input: inputDirectory,
    script: generatedScript.path
  });
  return 0;
}

async function runRecordTranscribeCommand(options: RecordCommandOptions): Promise<number> {
  const inputDirectory = resolve(requireOption(options.args, "input"));
  const recording = await readRecordingData(inputDirectory);
  const model = getOptionValue(options.args, "model") ?? DEFAULT_TRANSCRIPTION_MODEL;
  const apiKey = getOptionValue(options.args, "api-key") ?? process.env.OPENAI_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error("Missing OpenAI API key. Set OPENAI_API_KEY or pass --api-key.");
  }
  const audioPath = resolve(inputDirectory, getOptionValue(options.args, "audio") ?? recording.manifest.files.audio);
  const startedAt = new Date();
  const transcript = await transcribeAudioFile(options.fetcher, audioPath, apiKey, model);
  const transcribedAt = new Date().toISOString();
  const transcriptData: TranscriptData = {
    status: "completed",
    audio: createManifestPath(inputDirectory, audioPath),
    model,
    transcribedAt,
    text: transcript.text,
    segments: transcript.segments,
    ...(transcript.words.length > 0 ? { words: transcript.words } : {})
  };
  await writeJsonFile(join(inputDirectory, recording.manifest.files.transcript), transcriptData);
  await appendJsonLine(join(inputDirectory, recording.manifest.files.operations), {
    type: "audio.transcribe",
    startedAt: startedAt.toISOString(),
    endedAt: transcribedAt,
    model,
    audio: audioPath,
    segmentCount: transcript.segments.length,
    wordCount: transcript.words.length
  });
  const counts = await readRecordingCounts(inputDirectory, recording.manifest.files);
  const manifest: RecordingManifest = {
    ...recording.manifest,
    capture: {
      ...recording.manifest.capture,
      audio: {
        ...recording.manifest.capture.audio,
        requested: true,
        status: "transcribed",
        file: recording.manifest.files.audio,
        chunks: recording.manifest.files.audioChunks,
        transcript: recording.manifest.files.transcript,
        segmentCount: transcript.segments.length,
        chunkCount: counts.audioChunks,
        reason: "Microphone audio was transcribed with timestamps."
      }
    },
    counts
  };
  await writeJsonFile(join(inputDirectory, recording.manifest.files.manifest), manifest);

  writeJson(options.stdout, {
    ok: true,
    input: inputDirectory,
    transcript: join(inputDirectory, recording.manifest.files.transcript),
    model,
    segmentCount: transcript.segments.length,
    wordCount: transcript.words.length
  });
  return 0;
}

async function runRecordFixedDurationCommand(options: RecordCommandOptions): Promise<number> {
  const url = requireRecordUrl(options.args);
  const outputDirectory = resolve(requireOption(options.args, "out"));
  const durationMs = getPositiveNumberOption(options.args, "duration") ?? DEFAULT_RECORD_DURATION_MS;
  const intervalMs = getPositiveNumberOption(options.args, "interval") ?? DEFAULT_RECORD_INTERVAL_MS;
  const sessionId = getOptionValue(options.args, "session");
  const runtimeSelector = createRecordRuntimeSelector(url, sessionId, getOptionValue(options.args, "runtime"));
  const openedUrl = withOpenRuntimeSession(url, sessionId);
  const startedAt = new Date();
  const files = createRecordingFiles();
  const operations: OperationEntry[] = [];
  const runtimeSamples: RuntimeSample[] = [];
  const pageSnapshots: PageSnapshotSample[] = [];
  const domSnapshots: DomSnapshotSample[] = [];
  const interactions: InteractionEvent[] = [];

  await mkdir(outputDirectory, { recursive: true });
  await ensureRecordBridge(options, options.bridgeUrl);

  if (!hasOption(options.args, "no-open")) {
    operations.push(await openRecordingBrowser(options, openedUrl));
  } else {
    operations.push(createSkippedBrowserOpenOperation(openedUrl));
  }

  const deadline = Date.now() + durationMs;
  do {
    const sampledAt = new Date();
    const [runtimeSample, pageSnapshot, domSnapshot] = await Promise.all([
      sampleRuntime(options.openruntime, runtimeSelector, sampledAt),
      samplePageSnapshot(options.openruntime.browser, sampledAt),
      sampleDomSnapshot(options.openruntime.browser, sampledAt)
    ]);
    runtimeSamples.push(runtimeSample);
    pageSnapshots.push(pageSnapshot);
    domSnapshots.push(domSnapshot);

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await sleep(Math.min(intervalMs, remainingMs));
  } while (Date.now() <= deadline);

  const endedAt = new Date();
  const manifest = createRecordingManifest({
    args: options.args,
    url,
    openedUrl,
    bridgeUrl: options.bridgeUrl,
    sessionId,
    startedAt,
    intervalMs,
    status: "completed",
    files,
    requestedDurationMs: durationMs,
    endedAt,
    counts: {
      runtimeSamples: runtimeSamples.length,
      pageSnapshots: pageSnapshots.length,
      domSnapshots: domSnapshots.length,
      interactions: interactions.length,
      audioChunks: 0,
      transcriptSegments: 0,
      operations: operations.length
    }
  });

  await writeRecordingFiles(outputDirectory, manifest, runtimeSamples, pageSnapshots, domSnapshots, interactions, operations);

  writeJson(options.stdout, {
    ok: true,
    output: outputDirectory,
    manifest: join(outputDirectory, files.manifest),
    counts: manifest.counts,
    media: manifest.capture
  });
  return 0;
}

function createRecordingManifest(input: {
  args: ParsedCliArgs;
  url: string;
  openedUrl: string;
  bridgeUrl: string;
  sessionId: string | undefined;
  startedAt: Date;
  intervalMs: number;
  status: "recording" | "completed";
  files: RecordingFiles;
  counts: RecordingManifest["counts"];
  requestedDurationMs?: number;
  endedAt?: Date;
}): RecordingManifest {
  return {
    format: RECORDING_FORMAT,
    version: RECORDING_VERSION,
    status: input.status,
    url: input.url,
    openedUrl: input.openedUrl,
    bridgeUrl: input.bridgeUrl,
    ...createOptionalStringProperty("sessionId", input.sessionId),
    startedAt: input.startedAt.toISOString(),
    ...createOptionalEndedAtProperties(input.startedAt, input.endedAt),
    ...createOptionalNumberProperty("requestedDurationMs", input.requestedDurationMs),
    intervalMs: input.intervalMs,
    capture: {
      runtime: true,
      browserSnapshots: true,
      operations: true,
      video: {
        requested: !hasOption(input.args, "headless"),
        status: "not-captured",
        reason: "This prototype records browser snapshots and OpenRuntime state; continuous video capture is reserved for the next stage."
      },
      audio: createInitialAudioCapture(input.args, input.files, input.status)
    },
    counts: input.counts,
    files: input.files
  };
}

function createOptionalEndedAtProperties(startedAt: Date, endedAt: Date | undefined): Pick<RecordingManifest, "endedAt" | "durationMs"> | Record<string, never> {
  if (endedAt === undefined) return {};
  return {
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime()
  };
}

function createOptionalGeneratedProperty(generatedScript: GeneratedScriptResult | undefined): Pick<RecordingManifest, "generated"> | Record<string, never> {
  if (generatedScript === undefined) return {};
  return {
    generated: {
      script: generatedScript.relativePath,
      generatedAt: new Date().toISOString()
    }
  };
}

function createInitialAudioCapture(
  args: ParsedCliArgs,
  files: RecordingFiles,
  status: "recording" | "completed"
): RecordingCaptureStatus {
  if (!hasOption(args, "mic")) {
    return {
      requested: false,
      status: "not-requested",
      reason: "Microphone capture was not requested."
    };
  }
  if (status === "completed") {
    return {
      requested: true,
      status: "not-captured",
      file: files.audio,
      chunks: files.audioChunks,
      transcript: files.transcript,
      reason: "Microphone capture is available for manual record start/stop sessions."
    };
  }
  return {
    requested: true,
    status: "recording",
    file: files.audio,
    chunks: files.audioChunks,
    transcript: files.transcript,
    reason: "Microphone capture was requested; audio chunks are written while the browser recording is active."
  };
}

function createCompletedAudioCapture(files: RecordingFiles, summary: AudioCaptureSummary): RecordingCaptureStatus {
  if (!summary.requested) {
    return {
      requested: false,
      status: "not-requested",
      reason: "Microphone capture was not requested."
    };
  }
  if (summary.chunkCount === 0) {
    return {
      requested: true,
      status: "not-captured",
      file: files.audio,
      chunks: files.audioChunks,
      transcript: files.transcript,
      reason: summary.reason ?? "No microphone audio chunks were captured."
    };
  }
  return {
    requested: true,
    status: "captured",
    file: files.audio,
    chunks: files.audioChunks,
    transcript: files.transcript,
    chunkCount: summary.chunkCount,
    reason: "Microphone audio was captured. Run record transcribe to extract text with timestamps."
  };
}

function resolveRecordingBridgeUrl(args: ParsedCliArgs, defaultBridgeUrl: string, manifest: RecordingManifest): string {
  return getOptionValue(args, "bridge") === undefined ? manifest.bridgeUrl : defaultBridgeUrl;
}

function getRecordUrl(args: ParsedCliArgs, subcommand?: "start"): string | undefined {
  const optionUrl = getOptionValue(args, "url");
  const commandUrl = args.command[subcommand === "start" ? 2 : 1];
  return optionUrl ?? commandUrl;
}

function requireRecordUrl(args: ParsedCliArgs): string {
  const url = getRecordUrl(args);
  if (url === undefined || url.length === 0) {
    throw new Error("Missing required URL. Use open-runtime record --url <url> --out <path>.");
  }
  return url;
}

function resolveRecordStartOutputDirectory(args: ParsedCliArgs, startedAt: Date): string {
  const output = getOptionValue(args, "out");
  if (output !== undefined && output.length > 0) return resolve(output);
  return resolve("recordings", `openruntime-${formatTimestampForPath(startedAt)}.orrec`);
}

function formatTimestampForPath(date: Date): string {
  return date.toISOString().replace(/[:.]/gu, "-");
}

function requireOption(args: ParsedCliArgs, name: string): string {
  const value = getOptionValue(args, name);
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required option "--${name}".`);
  }
  return value;
}

function getPositiveNumberOption(args: ParsedCliArgs, name: string): number | undefined {
  const rawValue = getOptionValue(args, name);
  if (rawValue === undefined) return undefined;
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`--${name} must be a positive number.`);
  }
  return value;
}

function createRecordRuntimeSelector(
  url: string | undefined,
  sessionId: string | undefined,
  runtimeId: string | undefined
): RuntimeSelector {
  return {
    ...createOptionalStringProperty("runtimeId", runtimeId),
    ...createOptionalStringProperty("sessionId", sessionId),
    ...createOptionalStringProperty("url", url === undefined || url === DEFAULT_RECORD_START_URL
      ? undefined
      : withOpenRuntimeSession(url, sessionId))
  };
}

function hasOption(args: ParsedCliArgs, name: string): boolean {
  return args.options.has(name);
}

function getOptionValue(args: ParsedCliArgs, name: string): string | undefined {
  return args.options.get(name)?.at(-1);
}

function createBridgeUrl(args: ParsedCliArgs): string {
  const bridge = getOptionValue(args, "bridge");
  if (bridge !== undefined) return bridge.replace(/\/$/, "");
  const port = getOptionValue(args, "port") ?? "17321";
  return `http://localhost:${port}`;
}

function withOpenRuntimeSession(input: string, sessionId: string | undefined): string {
  if (sessionId === undefined || sessionId.length === 0) return input;

  try {
    const url = new URL(input);
    url.searchParams.set(OPEN_RUNTIME_SESSION_QUERY_PARAM, sessionId);
    return url.toString();
  } catch {
    return input;
  }
}

function writeJson(stdout: { write(chunk: string): void }, value: unknown): void {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
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

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
