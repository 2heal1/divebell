import { mkdir } from "node:fs/promises";
import { collectInteractionEvents, sampleDomSnapshot, samplePageSnapshot, sampleRuntime } from "./capture.js";
import { collectAudioCapture, createRecordingCompanionUrl, transcribeAudioFile } from "./audio.js";
import { clearRecordingControlFile, writeRecordingControlFile } from "./session.js";
import { createManifestPath, writeGeneratedScript, writeWorkflowDraft } from "./script.js";
import { appendJsonLine, createRecordingFiles, readJsonFile, readRecordingCounts, readRecordingData, writeJsonFile, writeJsonLines, writeRecordingFiles } from "./storage.js";
import {
  runRecordAmendCommand,
  runRecordConfirmCommand,
  runRecordRemoveStepCommand,
  runRecordReviewCommand
} from "./review.js";
import { alignWorkflowTranscript } from "./workflow.js";
import { join, resolve } from "node:path";
import type { CliExtensionPageContext, CliExtensionRunOptions, ParsedCliArgs } from "@divebell/cli";

import type { RecordCommandOptions, RecordingFiles, RecordingManifest, RecordingCaptureStatus, RuntimeSample, PageSnapshotSample, DomSnapshotSample, InteractionEvent, OperationEntry, TranscriptData, AudioCaptureSummary, RecordedWorkflow } from "./types.js";
export type * from "./types.js";
const DIVEBELL_SESSION_QUERY_PARAM = "divebellSessionId";

interface RuntimeSelector {
  runtimeId?: string;
  sessionId?: string;
  url?: string;
}
const DEFAULT_RECORD_DURATION_MS = 10_000;
const DEFAULT_RECORD_INTERVAL_MS = 1_000;
const RECORDING_FORMAT = "divebell-recording";
const RECORDING_VERSION = 1;
const DEFAULT_TRANSCRIPTION_MODEL = "whisper-1";

export async function runRecordCliCommand(options: CliExtensionRunOptions): Promise<unknown> {
  return await runRecordCommand({
    args: options.args,
    fetcher: options.fetcher,
    ...(options.page === undefined ? {} : { page: options.page }),
    divebell: options.divebell
  });
}

export async function runRecordCommand(options: RecordCommandOptions): Promise<unknown> {
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
  if (subcommand === "review") {
    return await runRecordReviewCommand(options);
  }
  if (subcommand === "confirm") {
    return await runRecordConfirmCommand(options);
  }
  if (subcommand === "remove-step") {
    return await runRecordRemoveStepCommand(options);
  }
  if (subcommand === "amend") {
    return await runRecordAmendCommand(options);
  }
  if (subcommand === "transcribe") {
    return await runRecordTranscribeCommand(options);
  }
  if (subcommand === undefined) {
    return await runRecordFixedDurationCommand(options);
  }
  throw new Error(`Unknown record subcommand "${subcommand}".`);
}

async function runRecordStartCommand(options: RecordCommandOptions): Promise<unknown> {
  requireNoCurrentPage(options);
  assertNoLegacyPageLifecycleOptions(options.args);
  assertNoPageSelectionOptions(options.args);
  const startedAt = new Date();
  const outputDirectory = resolveRecordStartOutputDirectory(options.args, startedAt);
  const intervalMs = getPositiveNumberOption(options.args, "interval") ?? DEFAULT_RECORD_INTERVAL_MS;
  const files = createRecordingFiles();
  const operations: OperationEntry[] = [
    {
      type: "record.prepare",
      startedAt: startedAt.toISOString()
    }
  ];
  const runtimeSamples: RuntimeSample[] = [];
  const pageSnapshots: PageSnapshotSample[] = [];
  const domSnapshots: DomSnapshotSample[] = [];
  const interactions: InteractionEvent[] = [];
  const audioRequested = true;

  await mkdir(outputDirectory, { recursive: true });

  const manifest = createRecordingManifest({
    args: options.args,
    audioRequested,
    startedAt,
    intervalMs,
    status: "prepared",
    files,
    counts: {
      runtimeSamples: runtimeSamples.length,
      pageSnapshots: pageSnapshots.length,
      domSnapshots: domSnapshots.length,
      interactions: interactions.length,
      audioChunks: 0,
      transcriptSegments: 0,
      operations: operations.length + 1
    }
  });

  await writeRecordingFiles(outputDirectory, manifest, runtimeSamples, pageSnapshots, domSnapshots, interactions, operations);
  const controlOperation = await writeRecordingControlFile(
    outputDirectory,
    files,
    startedAt,
    audioRequested
  );
  await appendJsonLine(join(outputDirectory, files.operations), controlOperation);

  return {
    status: "prepared",
    output: outputDirectory,
    manifest: join(outputDirectory, files.manifest),
    next: "Choose no authentication, one Chrome profile, or one state file; then run `divebell open <url> [--profile <name|path> | --state <path>] --ui`."
  };
}

async function runRecordStopCommand(options: RecordCommandOptions): Promise<unknown> {
  if (hasOption(options.args, "script-out")) {
    throw new Error(
      "record stop now creates a workflow draft. Pass --script-out to `record confirm --all` after review."
    );
  }
  const page = requireCurrentPage(options);
  const outputDirectory = resolve(requireOption(options.args, "out"));
  const recording = await readRecordingData(outputDirectory);
  if (recording.manifest.status !== "recording") {
    throw new Error("This recording has not been attached to a page. Run `divebell open <url>` after `record start`.");
  }
  if (recording.manifest.invalidated !== undefined) {
    throw new Error(recording.manifest.invalidated.reason);
  }
  assertRecordingPageMatches(page, recording.manifest);
  const sessionId = page.sessionId ?? undefined;
  const runtimeSelector = createRecordRuntimeSelector(
    recording.manifest.url,
    sessionId,
    getOptionValue(options.args, "runtime")
  );
  const stopStartedAt = new Date();

  const recorderUrl = createRecordingCompanionUrl(
    recording.manifest.bridgeUrl,
    recording.manifest.startedAt,
    recording.manifest.intervalMs
  );
  const interactionCollection = await collectInteractionEvents(
    outputDirectory,
    options.divebell.browser,
    recorderUrl === undefined ? {} : { companionUrl: recorderUrl }
  );
  await writeJsonLines(join(outputDirectory, recording.manifest.files.interactions), interactionCollection.interactions);
  await appendJsonLine(join(outputDirectory, recording.manifest.files.operations), interactionCollection.operation);

  const sampledAt = new Date();
  const [runtimeSample, pageSnapshot, domSnapshot] = await Promise.all([
    sampleRuntimeForPage(options.divebell, runtimeSelector, page, sampledAt),
    samplePageSnapshot(options.divebell.browser, sampledAt),
    sampleDomSnapshot(options.divebell.browser, sampledAt)
  ]);
  await appendJsonLine(join(outputDirectory, recording.manifest.files.runtime), runtimeSample);
  await appendJsonLine(join(outputDirectory, recording.manifest.files.pageSnapshots), pageSnapshot);
  await appendJsonLine(join(outputDirectory, recording.manifest.files.domSnapshots), domSnapshot);
  const audioCollection = await collectAudioCapture(
    outputDirectory,
    recording.manifest.files,
    recording.manifest.capture.audio.requested,
    options.divebell.browser,
    recorderUrl === undefined
      ? undefined
      : {
          url: recorderUrl,
          startedAt: recording.manifest.startedAt
        }
  );
  await appendJsonLine(join(outputDirectory, recording.manifest.files.operations), audioCollection.operation);

  const stopOperation: OperationEntry = {
    type: "record.stop",
    startedAt: stopStartedAt.toISOString(),
    endedAt: new Date().toISOString()
  };
  await appendJsonLine(join(outputDirectory, recording.manifest.files.operations), stopOperation);

  await clearRecordingControlFile();

  const refreshedRecording = await readRecordingData(outputDirectory);
  const workflowDraft = await writeWorkflowDraft(outputDirectory, refreshedRecording);
  await appendJsonLine(join(outputDirectory, recording.manifest.files.operations), {
    type: "workflow.draft.generated",
    startedAt: new Date().toISOString(),
    path: workflowDraft.path,
    reviewStatus: workflowDraft.workflow.review.status
  });

  const completedAt = new Date();
  const counts = await readRecordingCounts(outputDirectory, recording.manifest.files);
  const manifest: RecordingManifest = {
    ...recording.manifest,
    status: "completed",
    endedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - Date.parse(recording.manifest.startedAt),
    capture: {
      ...recording.manifest.capture,
      audio: createCompletedAudioCapture(recording.manifest.files, audioCollection.summary)
    },
    counts,
    generated: {
      workflow: workflowDraft.relativePath,
      generatedAt: new Date().toISOString()
    }
  };
  await writeJsonFile(join(outputDirectory, recording.manifest.files.manifest), manifest);

  return {
    status: "needs_confirmation",
    output: outputDirectory,
    manifest: join(outputDirectory, recording.manifest.files.manifest),
    workflow: workflowDraft.path,
    reviewStatus: workflowDraft.workflow.review.status,
    counts: manifest.counts,
    next: `divebell record review --input ${JSON.stringify(outputDirectory)}`
  };
}

async function runRecordGenerateScriptCommand(options: RecordCommandOptions): Promise<unknown> {
  const inputDirectory = resolve(requireOption(options.args, "input"));
  const recording = await readRecordingData(inputDirectory);
  let workflow: RecordedWorkflow;
  try {
    const existing = await readJsonFile<RecordedWorkflow>(
      join(inputDirectory, recording.manifest.files.workflow)
    );
    workflow = existing.schemaVersion === 2
      ? existing
      : (await writeWorkflowDraft(inputDirectory, recording)).workflow;
  } catch {
    workflow = (await writeWorkflowDraft(inputDirectory, recording)).workflow;
  }
  const generatedScript = await writeGeneratedScript(inputDirectory, workflow, getOptionValue(options.args, "out"));
  const generatedAt = new Date().toISOString();
  const manifest: RecordingManifest = {
    ...recording.manifest,
    generated: {
      ...(recording.manifest.generated ?? {}),
      script: generatedScript.relativePath,
      workflow: generatedScript.workflowRelativePath,
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

  return {
    input: inputDirectory,
    script: generatedScript.path,
    workflow: generatedScript.workflowPath
  };
}

async function runRecordTranscribeCommand(options: RecordCommandOptions): Promise<unknown> {
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
  try {
    const workflowPath = join(inputDirectory, recording.manifest.files.workflow);
    const workflow = await readJsonFile<RecordedWorkflow>(workflowPath);
    if (workflow.schemaVersion === 2) {
      await writeJsonFile(workflowPath, alignWorkflowTranscript(workflow, transcript.segments));
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
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

  return {
    input: inputDirectory,
    transcript: join(inputDirectory, recording.manifest.files.transcript),
    model,
    segmentCount: transcript.segments.length,
    wordCount: transcript.words.length
  };
}

async function runRecordFixedDurationCommand(options: RecordCommandOptions): Promise<unknown> {
  const page = requireCurrentPage(options);
  const outputDirectory = resolve(requireOption(options.args, "out"));
  const durationMs = getPositiveNumberOption(options.args, "duration") ?? DEFAULT_RECORD_DURATION_MS;
  const intervalMs = getPositiveNumberOption(options.args, "interval") ?? DEFAULT_RECORD_INTERVAL_MS;
  const sessionId = page.sessionId ?? undefined;
  const runtimeSelector = createRecordRuntimeSelector(page.url, sessionId, getOptionValue(options.args, "runtime"));
  const startedAt = new Date();
  const files = createRecordingFiles();
  const operations: OperationEntry[] = [{
    type: "record.start",
    startedAt: startedAt.toISOString(),
    url: page.url,
    openedUrl: page.openedUrl,
    bridgeUrl: page.bridgeUrl,
    sessionId: page.sessionId
  }];
  const runtimeSamples: RuntimeSample[] = [];
  const pageSnapshots: PageSnapshotSample[] = [];
  const domSnapshots: DomSnapshotSample[] = [];
  const interactions: InteractionEvent[] = [];

  await mkdir(outputDirectory, { recursive: true });

  const deadline = Date.now() + durationMs;
  do {
    const sampledAt = new Date();
    const [runtimeSample, pageSnapshot, domSnapshot] = await Promise.all([
      sampleRuntimeForPage(options.divebell, runtimeSelector, page, sampledAt),
      samplePageSnapshot(options.divebell.browser, sampledAt),
      sampleDomSnapshot(options.divebell.browser, sampledAt)
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
    audioRequested: false,
    page,
    ...createOptionalStringProperty("sessionId", sessionId),
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

  return {
    output: outputDirectory,
    manifest: join(outputDirectory, files.manifest),
    counts: manifest.counts,
    media: manifest.capture
  };
}

function createRecordingManifest(input: {
  args: ParsedCliArgs;
  audioRequested: boolean;
  page?: CliExtensionPageContext;
  sessionId?: string;
  startedAt: Date;
  intervalMs: number;
  status: "prepared" | "recording" | "completed";
  files: RecordingFiles;
  counts: RecordingManifest["counts"];
  requestedDurationMs?: number;
  endedAt?: Date;
}): RecordingManifest {
  return {
    format: RECORDING_FORMAT,
    version: RECORDING_VERSION,
    status: input.status,
    ...(input.page === undefined
      ? {}
      : {
        url: input.page.url,
        openedUrl: input.page.openedUrl,
        bridgeUrl: input.page.bridgeUrl
      }),
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
        reason: "This prototype records browser snapshots and Divebell state; continuous video capture is reserved for the next stage."
      },
      audio: createInitialAudioCapture(input.audioRequested, input.files, input.status)
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

function createInitialAudioCapture(
  requested: boolean,
  files: RecordingFiles,
  status: "prepared" | "recording" | "completed"
): RecordingCaptureStatus {
  if (!requested) {
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
    reason: "Microphone capture starts automatically; missing or denied audio never blocks the browser recording."
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
      reason: summary.reason ?? "No usable microphone audio was captured; browser replay generation continued without it."
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

function resolveRecordStartOutputDirectory(args: ParsedCliArgs, startedAt: Date): string {
  const output = getOptionValue(args, "out");
  if (output !== undefined && output.length > 0) return resolve(output);
  return resolve("recordings", `divebell-${formatTimestampForPath(startedAt)}.orrec`);
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
    ...createOptionalStringProperty("url", sessionId !== undefined || url === undefined
      ? undefined
      : withDivebellSession(url, sessionId))
  };
}

function sampleRuntimeForPage(
  divebell: RecordCommandOptions["divebell"],
  selector: RuntimeSelector,
  page: CliExtensionPageContext,
  sampledAt: Date
): Promise<RuntimeSample> {
  if (page.bridgeUrl === null) {
    return Promise.resolve({
      sampledAt: sampledAt.toISOString(),
      ok: false,
      error: "The current page was opened without a Bridge."
    });
  }
  return sampleRuntime(divebell, selector, sampledAt);
}

function requireCurrentPage(options: RecordCommandOptions): CliExtensionPageContext {
  if (options.page === undefined) {
    throw new Error("No current Divebell page is available. Run `divebell open <url>` before recording.");
  }
  assertNoLegacyPageLifecycleOptions(options.args);
  assertCommandPageMatches(options.args, options.page);
  return options.page;
}

function requireNoCurrentPage(options: RecordCommandOptions): void {
  if (options.page === undefined) return;
  throw new Error("A current Divebell page is already open. Run `divebell stop`, then prepare the recording before opening the page again.");
}

function assertNoLegacyPageLifecycleOptions(args: ParsedCliArgs): void {
  for (const option of ["headless", "no-open", "no-close", "port"]) {
    if (hasOption(args, option)) {
      throw new Error(
        `Recording no longer accepts --${option}. Configure and open the page with \`divebell open <url>\`, then run record.`
      );
    }
  }
}

function assertNoPageSelectionOptions(args: ParsedCliArgs): void {
  for (const option of ["url", "bridge", "session", "runtime", "profile", "state"]) {
    if (hasOption(args, option)) {
      throw new Error(
        `Recording no longer accepts --${option}. Put page and Bridge options on the following \`divebell open <url>\` command.`
      );
    }
  }
}

function assertCommandPageMatches(args: ParsedCliArgs, page: CliExtensionPageContext): void {
  const selectedUrl = getOptionValue(args, "url");
  const selectedSession = getOptionValue(args, "session");
  const selectedBridge = getOptionValue(args, "bridge");
  if (
    (selectedUrl !== undefined && selectedUrl !== page.url) ||
    (selectedSession !== undefined && selectedSession !== page.sessionId) ||
    normalizeOptionalUrl(selectedBridge) !== normalizeOptionalUrl(page.bridgeUrl)
  ) {
    throw new Error(
      "Recording only operates on the current Divebell page. Put URL, session, and Bridge options on `divebell open`, not on record."
    );
  }
}

function assertRecordingPageMatches(page: CliExtensionPageContext, manifest: RecordingManifest): void {
  const expectedSessionId = manifest.sessionId ?? null;
  if (
    page.url === manifest.url &&
    page.openedUrl === manifest.openedUrl &&
    page.bridgeUrl === manifest.bridgeUrl &&
    page.sessionId === expectedSessionId
  ) {
    return;
  }
  throw new Error(
    "The current Divebell page does not match this recording. Return to the project and page used by `record start`, then retry."
  );
}

function normalizeOptionalUrl(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function hasOption(args: ParsedCliArgs, name: string): boolean {
  return args.options.has(name);
}

function getOptionValue(args: ParsedCliArgs, name: string): string | undefined {
  return args.options.get(name)?.at(-1);
}

function withDivebellSession(input: string, sessionId: string | undefined): string {
  if (sessionId === undefined || sessionId.length === 0) return input;

  try {
    const url = new URL(input);
    url.searchParams.set(DIVEBELL_SESSION_QUERY_PARAM, sessionId);
    return url.toString();
  } catch {
    return input;
  }
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
