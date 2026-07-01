import { appendFile, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { BridgeRuntimeInfo } from "@openruntime/bridge";
import { OPEN_RUNTIME_SESSION_QUERY_PARAM } from "@openruntime/core";
import { getNumberOption, getOptionValue, type ParsedCliArgs } from "./args.js";
import { parseBrowserJsonOutput, resolveBrowserProfileDirectory, type BrowserRunner } from "./browser.js";
import { ensureBridge, type BridgeStarter, type BridgeStateStore } from "./bridge-process.js";
import {
  fetchRuntimeResource,
  fetchRuntimes,
  selectRuntime,
  type Fetcher,
  type RuntimeSelector
} from "./client.js";

const DEFAULT_RECORD_DURATION_MS = 10_000;
const DEFAULT_RECORD_INTERVAL_MS = 1_000;
const DEFAULT_RECORD_START_URL = "about:blank";
const RECORDING_FORMAT = "openruntime-recording";
const RECORDING_VERSION = 1;
const RECORD_EVENT_CONSOLE_MARKER = "__OPENRUNTIME_RECORD_EVENT__";
const OPENRUNTIME_RECORDING_CONTROL_FILE = "recording-session.json";

export interface RecordCommandOptions {
  args: ParsedCliArgs;
  stdout: { write(chunk: string): void };
  fetcher: Fetcher;
  browserRunner: BrowserRunner;
  bridgeUrl: string;
  bridgeStarter: BridgeStarter;
  bridgeStateStore: BridgeStateStore;
}

interface RecordingFiles {
  manifest: string;
  runtime: string;
  pageSnapshots: string;
  domSnapshots: string;
  interactions: string;
  operations: string;
  transcript: string;
}

interface RecordingManifest {
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
    operations: number;
  };
  files: RecordingFiles;
  generated?: {
    script?: string;
    generatedAt?: string;
  };
}

interface RecordingCaptureStatus {
  requested: boolean;
  status: "not-captured";
  reason: string;
}

interface RecordingData {
  manifest: RecordingManifest;
  runtimeSamples: RuntimeSample[];
  pageSnapshots: PageSnapshotSample[];
  domSnapshots: DomSnapshotSample[];
  interactions: InteractionEvent[];
  operations: OperationEntry[];
}

interface RuntimeSample {
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

interface PageSnapshotSample {
  sampledAt: string;
  ok: boolean;
  result?: unknown;
  stdout?: string;
  stderr?: string;
  exitCode: number;
}

interface DomSnapshotSample {
  sampledAt: string;
  ok: boolean;
  result?: unknown;
  stdout?: string;
  stderr?: string;
  exitCode: number;
}

interface InteractionEvent {
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

interface OperationEntry {
  type: string;
  startedAt: string;
  endedAt?: string;
  [key: string]: unknown;
}

interface GeneratedScriptResult {
  path: string;
  relativePath: string;
}

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
  operations.push(await writeRecordingControlFile(outputDirectory, startedAt));
  operations.push(await resetRecordingBrowser(options.browserRunner));
  await ensureRecordBridge(options, options.bridgeUrl);

  if (!hasOption(options.args, "no-open")) {
    operations.push(await openRecordingBrowser(options, openedUrl));
  } else {
    operations.push(createSkippedBrowserOpenOperation(openedUrl));
  }
  operations.push(await setRecordingInstrumentation(options.browserRunner, outputDirectory, startedAt));

  const sampledAt = new Date();
  const [runtimeSample, pageSnapshot, domSnapshot] = await Promise.all([
    sampleRuntime(options.fetcher, options.bridgeUrl, runtimeSelector, sampledAt),
    samplePageSnapshot(options.browserRunner, sampledAt),
    sampleDomSnapshot(options.browserRunner, sampledAt)
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
  const stopStartedAt = new Date();

  const bridge = await tryEnsureRecordBridge(options, bridgeUrl);

  const sampledAt = new Date();
  const [runtimeSample, pageSnapshot, domSnapshot] = await Promise.all([
    sampleRuntime(options.fetcher, bridgeUrl, runtimeSelector, sampledAt),
    samplePageSnapshot(options.browserRunner, sampledAt),
    sampleDomSnapshot(options.browserRunner, sampledAt)
  ]);
  await appendJsonLine(join(outputDirectory, recording.manifest.files.runtime), runtimeSample);
  await appendJsonLine(join(outputDirectory, recording.manifest.files.pageSnapshots), pageSnapshot);
  await appendJsonLine(join(outputDirectory, recording.manifest.files.domSnapshots), domSnapshot);

  const interactionCollection = await collectInteractionEvents(outputDirectory, options.browserRunner);
  await writeJsonLines(join(outputDirectory, recording.manifest.files.interactions), interactionCollection.interactions);
  await appendJsonLine(join(outputDirectory, recording.manifest.files.operations), interactionCollection.operation);

  const stopOperation: OperationEntry = {
    type: "record.stop",
    startedAt: stopStartedAt.toISOString(),
    endedAt: new Date().toISOString()
  };
  await appendJsonLine(join(outputDirectory, recording.manifest.files.operations), stopOperation);

  let closeOperation: OperationEntry | undefined;
  if (!hasOption(options.args, "no-close")) {
    closeOperation = await closeRecordingBrowser(options.browserRunner);
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
      sampleRuntime(options.fetcher, options.bridgeUrl, runtimeSelector, sampledAt),
      samplePageSnapshot(options.browserRunner, sampledAt),
      sampleDomSnapshot(options.browserRunner, sampledAt)
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

async function ensureRecordBridge(options: RecordCommandOptions, bridgeUrl: string): Promise<void> {
  await ensureBridge({
    fetcher: options.fetcher,
    bridgeUrl,
    starter: options.bridgeStarter,
    stateStore: options.bridgeStateStore,
    ...createOptionalNumberProperty("port", getNumberOption(options.args, "port"))
  });
}

async function tryEnsureRecordBridge(
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

async function openRecordingBrowser(options: RecordCommandOptions, openedUrl: string): Promise<OperationEntry> {
  const openStartedAt = new Date();
  const openResult = await options.browserRunner.run(["open", openedUrl], {
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

function createSkippedBrowserOpenOperation(openedUrl: string): OperationEntry {
  return {
    type: "browser.open",
    url: openedUrl,
    startedAt: new Date().toISOString(),
    skipped: true,
    reason: "--no-open was set"
  };
}

async function closeRecordingBrowser(browserRunner: BrowserRunner): Promise<OperationEntry> {
  const closeStartedAt = new Date();
  const closeResult = await browserRunner.run(["close"]);
  return {
    type: "browser.close",
    startedAt: closeStartedAt.toISOString(),
    endedAt: new Date().toISOString(),
    exitCode: closeResult.exitCode,
    stdout: closeResult.stdout.trim(),
    stderr: closeResult.stderr.trim()
  };
}

async function writeRecordingControlFile(outputDirectory: string, startedAt: Date): Promise<OperationEntry> {
  const operationStartedAt = new Date();
  const profileDirectory = resolveBrowserProfileDirectory();
  const controlFile = join(profileDirectory, OPENRUNTIME_RECORDING_CONTROL_FILE);
  const eventsFile = join(outputDirectory, "interaction-events.raw.jsonl");
  await mkdir(profileDirectory, { recursive: true });
  await writeJsonFile(controlFile, {
    marker: RECORD_EVENT_CONSOLE_MARKER,
    eventsFile,
    startedAt: startedAt.toISOString()
  });
  await writeFile(eventsFile, "", "utf8");
  return {
    type: "recording.control.write",
    startedAt: operationStartedAt.toISOString(),
    endedAt: new Date().toISOString(),
    profileDirectory,
    controlFile,
    eventsFile
  };
}

async function clearRecordingControlFile(): Promise<void> {
  await rm(join(resolveBrowserProfileDirectory(), OPENRUNTIME_RECORDING_CONTROL_FILE), {
    force: true
  });
}

async function resetRecordingBrowser(browserRunner: BrowserRunner): Promise<OperationEntry> {
  const started = new Date();
  const result = await browserRunner.run(["close"]);
  return {
    type: "browser.reset",
    startedAt: started.toISOString(),
    endedAt: new Date().toISOString(),
    exitCode: result.exitCode,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim()
  };
}

async function setRecordingInstrumentation(
  browserRunner: BrowserRunner,
  outputDirectory: string,
  startedAt: Date
): Promise<OperationEntry> {
  const started = new Date();
  const scriptPath = join(outputDirectory, "recording-instrumentation.js");
  await writeFile(scriptPath, createInteractionRecorderScript(startedAt.getTime()), "utf8");
  const result = await browserRunner.run(["instrumentation", "set", scriptPath]);
  return {
    type: "browser.instrumentation.set",
    path: scriptPath,
    startedAt: started.toISOString(),
    endedAt: new Date().toISOString(),
    exitCode: result.exitCode,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim()
  };
}

async function collectInteractionEvents(outputDirectory: string, browserRunner: BrowserRunner): Promise<{
  operation: OperationEntry;
  interactions: InteractionEvent[];
}> {
  const started = new Date();
  const result = await browserRunner.run(["browser-logs"]);
  const persistedInteractions = await readJsonLinesIfExists<InteractionEvent>(join(outputDirectory, "interaction-events.raw.jsonl"));
  const browserLogInteractions = result.exitCode === 0 ? parseInteractionEventsFromBrowserLogs(result.stdout) : [];
  const interactions = mergeInteractionEvents(persistedInteractions, browserLogInteractions);
  return {
    operation: {
      type: "interactions.collect",
      startedAt: started.toISOString(),
      endedAt: new Date().toISOString(),
      exitCode: result.exitCode,
      count: interactions.length,
      persistedCount: persistedInteractions.length,
      browserLogCount: browserLogInteractions.length,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim()
    },
    interactions
  };
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
      audio: {
        requested: hasOption(input.args, "mic"),
        status: "not-captured",
        reason: hasOption(input.args, "mic")
          ? "Microphone capture was requested, but this prototype only records the request in the manifest."
          : "Microphone capture was not requested."
      }
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

function createRecordingFiles(): RecordingFiles {
  return {
    manifest: "manifest.json",
    runtime: "runtime.jsonl",
    pageSnapshots: "page-snapshots.jsonl",
    domSnapshots: "dom-snapshots.jsonl",
    interactions: "interactions.jsonl",
    operations: "operations.jsonl",
    transcript: "transcript.json"
  };
}

async function writeRecordingFiles(
  outputDirectory: string,
  manifest: RecordingManifest,
  runtimeSamples: RuntimeSample[],
  pageSnapshots: PageSnapshotSample[],
  domSnapshots: DomSnapshotSample[],
  interactions: InteractionEvent[],
  operations: OperationEntry[]
): Promise<void> {
  await writeJsonFile(join(outputDirectory, manifest.files.manifest), manifest);
  await writeJsonLines(join(outputDirectory, manifest.files.runtime), runtimeSamples);
  await writeJsonLines(join(outputDirectory, manifest.files.pageSnapshots), pageSnapshots);
  await writeJsonLines(join(outputDirectory, manifest.files.domSnapshots), domSnapshots);
  await writeJsonLines(join(outputDirectory, manifest.files.interactions), interactions);
  await writeJsonLines(join(outputDirectory, manifest.files.operations), operations);
  await writeJsonFile(join(outputDirectory, manifest.files.transcript), {
    status: manifest.capture.audio.requested ? "pending-audio-capture" : "not-requested",
    segments: []
  });
}

async function readRecordingData(outputDirectory: string): Promise<RecordingData> {
  const manifest = await readRecordingManifest(outputDirectory);
  return {
    manifest,
    runtimeSamples: await readJsonLines(join(outputDirectory, manifest.files.runtime)),
    pageSnapshots: await readJsonLines(join(outputDirectory, manifest.files.pageSnapshots)),
    domSnapshots: await readJsonLinesIfExists(join(outputDirectory, manifest.files.domSnapshots)),
    interactions: await readJsonLinesIfExists(join(outputDirectory, manifest.files.interactions)),
    operations: await readJsonLines(join(outputDirectory, manifest.files.operations))
  };
}

async function readRecordingManifest(outputDirectory: string): Promise<RecordingManifest> {
  const manifest = await readJsonFile<RecordingManifest>(join(outputDirectory, createRecordingFiles().manifest));
  if (manifest.format !== RECORDING_FORMAT) {
    throw new Error(`Unsupported recording format in ${outputDirectory}.`);
  }
  if (manifest.version !== RECORDING_VERSION) {
    throw new Error(`Unsupported recording version "${manifest.version}".`);
  }
  return {
    ...manifest,
    files: {
      ...createRecordingFiles(),
      ...(manifest.files ?? {})
    }
  };
}

async function readRecordingCounts(outputDirectory: string, files: RecordingFiles): Promise<RecordingManifest["counts"]> {
  const [runtimeSamples, pageSnapshots, domSnapshots, interactions, operations] = await Promise.all([
    countJsonLines(join(outputDirectory, files.runtime)),
    countJsonLines(join(outputDirectory, files.pageSnapshots)),
    countJsonLinesIfExists(join(outputDirectory, files.domSnapshots)),
    countJsonLinesIfExists(join(outputDirectory, files.interactions)),
    countJsonLines(join(outputDirectory, files.operations))
  ]);
  return {
    runtimeSamples,
    pageSnapshots,
    domSnapshots,
    interactions,
    operations
  };
}

async function writeGeneratedScript(
  recordingDirectory: string,
  recording: RecordingData,
  outputPath: string | undefined
): Promise<GeneratedScriptResult> {
  const scriptPath = resolve(outputPath ?? join(recordingDirectory, "generated-script.mjs"));
  const content = createGeneratedScriptContent(recording);
  await mkdir(dirname(scriptPath), { recursive: true });
  await writeFile(scriptPath, content, "utf8");
  await chmod(scriptPath, 0o755);
  return {
    path: scriptPath,
    relativePath: createManifestPath(recordingDirectory, scriptPath)
  };
}

function createGeneratedScriptContent(recording: RecordingData): string {
  const manifest = recording.manifest;
  const waitTarget = findWaitTarget(recording.runtimeSamples);
  const actionNames = findActionNames(recording.runtimeSamples);
  const pageTitle = findLatestPageTitle(recording.pageSnapshots);
  const recordedUrl = findLatestRuntimeUrl(recording.runtimeSamples);
  const scriptUrl = manifest.url === DEFAULT_RECORD_START_URL
    ? recordedUrl ?? (manifest.openedUrl || manifest.url)
    : manifest.openedUrl || manifest.url;
  const waitTargetLiteral = waitTarget === undefined ? "undefined" : JSON.stringify(waitTarget, null, 2);
  const actionsComment = actionNames.length === 0
    ? "No runtime actions were discovered in the recording."
    : `Discovered runtime actions: ${actionNames.join(", ")}`;
  const pageComment = pageTitle === undefined ? "No page title was captured." : `Captured page title: ${pageTitle}`;
  const interactionSteps = createInteractionScriptSteps(recording.interactions);
  const interactionComment = interactionSteps.length === 0
    ? "No browser interaction events were captured."
    : `Captured browser interaction events: ${recording.interactions.length}`;

  return `#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cli = process.env.OPENRUNTIME_CLI ?? "openruntime";
const bridgeUrl = ${JSON.stringify(manifest.bridgeUrl)};
const url = ${JSON.stringify(scriptUrl)};
const waitTarget = ${waitTargetLiteral};

// Generated from an OpenRuntime recording.
// ${pageComment}
// ${actionsComment}
// ${interactionComment}

async function run(args) {
  const { stdout, stderr } = await execFileAsync(cli, args, {
    env: process.env
  });
  if (stdout.trim().length > 0) process.stdout.write(stdout);
  if (stderr.trim().length > 0) process.stderr.write(stderr);
}

async function main() {
  await run(["open", url, "--bridge", bridgeUrl, "--ui"]);

${interactionSteps.length === 0 ? "  // TODO: no click/input events were captured for this recording." : interactionSteps.map((step) => `  ${step}`).join("\n")}

  if (waitTarget !== undefined) {
    await run([
      "wait-for",
      "--bridge",
      bridgeUrl,
      "--url",
      url,
      waitTarget.targetId,
      waitTarget.status,
      "--timeout",
      "10000"
    ]);
  }

  await run(["snapshot", "--bridge", bridgeUrl, "--url", url]);
  await run(["events", "--bridge", bridgeUrl, "--url", url, "--limit", "50"]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;
}

function createInteractionScriptSteps(interactions: InteractionEvent[]): string[] {
  const steps: string[] = [];
  for (const interaction of compactInteractionEvents(interactions)) {
    const selector = interaction.target?.selector;
    if (selector === undefined || selector.length === 0) continue;
    if ((interaction.type === "input" || interaction.type === "change") && typeof interaction.target?.value === "string") {
      if (interaction.target.value === "[redacted]") {
        steps.push(`// ${formatInteractionTime(interaction)} skipped redacted input for ${JSON.stringify(selector)}.`);
        continue;
      }
      steps.push(`await run(["fill", ${JSON.stringify(selector)}, ${JSON.stringify(interaction.target.value)}]); // ${formatInteractionTime(interaction)}`);
      continue;
    }
    if (interaction.type === "click") {
      steps.push(`await run(["click", ${JSON.stringify(selector)}]); // ${formatInteractionTime(interaction)}`);
      continue;
    }
    if (interaction.type === "keydown" && interaction.key === "Enter") {
      steps.push(`await run(["eval", ${JSON.stringify(createKeyboardEventScript(selector, "Enter"))}]); // ${formatInteractionTime(interaction)}`);
    }
  }
  return steps;
}

function compactInteractionEvents(interactions: InteractionEvent[]): InteractionEvent[] {
  const output: InteractionEvent[] = [];
  for (const interaction of interactions) {
    if (interaction.type === "recorder-ready" || interaction.type === "recorder-error") continue;
    const previous = output.at(-1);
    if (
      previous !== undefined &&
      (interaction.type === "input" || interaction.type === "change") &&
      (previous.type === "input" || previous.type === "change") &&
      previous.target?.selector === interaction.target?.selector &&
      interaction.timeMs - previous.timeMs < 1200
    ) {
      output[output.length - 1] = interaction;
      continue;
    }
    output.push(interaction);
  }
  return output;
}

function createKeyboardEventScript(selector: string, key: string): string {
  return [
    "(() => {",
    `  const element = document.querySelector(${JSON.stringify(selector)});`,
    "  if (!element) throw new Error('Recorded target was not found.');",
    "  element.focus?.();",
    `  element.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, code: ${JSON.stringify(key)}, bubbles: true, cancelable: true }));`,
    "})()"
  ].join("\n");
}

function formatInteractionTime(interaction: InteractionEvent): string {
  return `t=${Math.round(interaction.timeMs)}ms ${interaction.type}`;
}

function findWaitTarget(runtimeSamples: RuntimeSample[]): { targetId: string; status: string } | undefined {
  for (const sample of [...runtimeSamples].reverse()) {
    const snapshot = asRecord(sample.resources?.snapshot);
    const targets = asRecord(snapshot?.targets);
    if (targets === undefined) continue;

    const candidates: Array<{ targetId: string; status: string }> = [];
    for (const [targetId, targetValue] of Object.entries(targets)) {
      const target = asRecord(targetValue);
      const status = getStringProperty(target, "status");
      if (status === undefined) continue;
      candidates.push({ targetId, status });
    }
    const readyTarget = candidates.find((candidate) => candidate.status === "ready");
    if (readyTarget !== undefined) return readyTarget;
    if (candidates[0] !== undefined) return candidates[0];
  }
  return undefined;
}

function findActionNames(runtimeSamples: RuntimeSample[]): string[] {
  const names = new Set<string>();
  for (const sample of runtimeSamples) {
    collectActionNames(sample.resources?.actions, names);
  }
  return [...names].slice(0, 8);
}

function collectActionNames(value: unknown, names: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectActionNames(item, names);
    return;
  }

  const record = asRecord(value);
  if (record === undefined) return;
  const name = getStringProperty(record, "name");
  if (name !== undefined) names.add(name);
  collectActionNames(record.actions, names);
  collectActionNames(record.items, names);
}

function findLatestPageTitle(pageSnapshots: PageSnapshotSample[]): string | undefined {
  for (const sample of [...pageSnapshots].reverse()) {
    const result = asRecord(sample.result);
    const title = getStringProperty(result, "title");
    if (title !== undefined) return title;
  }
  return undefined;
}

function findLatestRuntimeUrl(runtimeSamples: RuntimeSample[]): string | undefined {
  for (const sample of [...runtimeSamples].reverse()) {
    const url = sample.runtime?.url;
    if (url !== undefined && url.length > 0) return url;
  }
  return undefined;
}

function createManifestPath(recordingDirectory: string, scriptPath: string): string {
  const relativePath = relative(recordingDirectory, scriptPath);
  if (relativePath.length > 0 && !relativePath.startsWith("..") && !isAbsolute(relativePath)) {
    return relativePath;
  }
  return scriptPath;
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

async function sampleRuntime(
  fetcher: Fetcher,
  bridgeUrl: string,
  selector: RuntimeSelector,
  sampledAt: Date
): Promise<RuntimeSample> {
  try {
    const runtimes = await fetchRuntimes(fetcher, bridgeUrl);
    const runtime = selectRuntime(runtimes, selector);
    const [targets, snapshot, actions, events] = await Promise.all([
      fetchRuntimeResource(fetcher, bridgeUrl, runtime, "targets", new URLSearchParams()),
      fetchRuntimeResource(fetcher, bridgeUrl, runtime, "snapshot", new URLSearchParams()),
      fetchRuntimeResource(fetcher, bridgeUrl, runtime, "actions", new URLSearchParams()),
      fetchRuntimeResource(fetcher, bridgeUrl, runtime, "events", createEventsQuery())
    ]);
    return {
      sampledAt: sampledAt.toISOString(),
      ok: true,
      runtimes,
      runtime,
      resources: {
        targets: targets.result,
        snapshot: snapshot.result,
        actions: actions.result,
        events: events.result
      }
    };
  } catch (error) {
    return {
      sampledAt: sampledAt.toISOString(),
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function samplePageSnapshot(
  browserRunner: BrowserRunner,
  sampledAt: Date
): Promise<PageSnapshotSample> {
  const result = await browserRunner.run(["snapshot"]);
  if (result.exitCode !== 0) {
    return {
      sampledAt: sampledAt.toISOString(),
      ok: false,
      exitCode: result.exitCode,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim()
    };
  }

  try {
    return {
      sampledAt: sampledAt.toISOString(),
      ok: true,
      exitCode: result.exitCode,
      result: parseBrowserJsonOutput(result.stdout)
    };
  } catch {
    return {
      sampledAt: sampledAt.toISOString(),
      ok: true,
      exitCode: result.exitCode,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim()
    };
  }
}

async function sampleDomSnapshot(
  browserRunner: BrowserRunner,
  sampledAt: Date
): Promise<DomSnapshotSample> {
  const result = await browserRunner.run(["eval", createDomSnapshotScript()]);
  if (result.exitCode !== 0) {
    return {
      sampledAt: sampledAt.toISOString(),
      ok: false,
      exitCode: result.exitCode,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim()
    };
  }

  try {
    return {
      sampledAt: sampledAt.toISOString(),
      ok: true,
      exitCode: result.exitCode,
      result: parseBrowserJsonOutput(result.stdout)
    };
  } catch {
    return {
      sampledAt: sampledAt.toISOString(),
      ok: true,
      exitCode: result.exitCode,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim()
    };
  }
}

function createDomSnapshotScript(): string {
  return [
    "(() => {",
    "  const html = document.documentElement?.outerHTML ?? '';",
    "  return {",
    "    url: location.href,",
    "    title: document.title,",
    "    capturedAt: Date.now(),",
    "    htmlLength: html.length,",
    "    html: html.slice(0, 200000)",
    "  };",
    "})()"
  ].join("\n");
}

function createInteractionRecorderScript(recordingStartedAtMs: number): string {
  return [
    "(() => {",
    "  const marker = " + JSON.stringify(RECORD_EVENT_CONSOLE_MARKER) + ";",
    "  const startedAt = " + JSON.stringify(recordingStartedAtMs) + ";",
    "  if (window.__OPENRUNTIME_INTERACTION_RECORDER_INSTALLED__) return;",
    "  window.__OPENRUNTIME_INTERACTION_RECORDER_INSTALLED__ = true;",
    "  const textOf = (value, max = 160) => String(value ?? '').replace(/\\s+/g, ' ').trim().slice(0, max);",
    "  const cssEscape = (value) => {",
    "    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);",
    "    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&');",
    "  };",
    "  const selectorFor = (element) => {",
    "    if (!(element instanceof Element)) return undefined;",
    "    const test = (selector) => {",
    "      try { return document.querySelectorAll(selector).length === 1; } catch { return false; }",
    "    };",
    "    const id = element.getAttribute('id');",
    "    if (id) {",
    "      const selector = `#${cssEscape(id)}`;",
    "      if (test(selector)) return selector;",
    "    }",
    "    const attrs = ['data-testid', 'data-test-id', 'aria-label', 'name', 'placeholder', 'title'];",
    "    for (const attr of attrs) {",
    "      const value = element.getAttribute(attr);",
    "      if (!value) continue;",
    "      const selector = `${element.tagName.toLowerCase()}[${attr}=${JSON.stringify(value)}]`;",
    "      if (test(selector)) return selector;",
    "    }",
    "    const parts = [];",
    "    let current = element;",
    "    while (current && current.nodeType === 1 && current !== document.documentElement) {",
    "      let part = current.tagName.toLowerCase();",
    "      const parent = current.parentElement;",
    "      if (!parent) break;",
    "      const siblings = Array.from(parent.children).filter((item) => item.tagName === current.tagName);",
    "      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;",
    "      parts.unshift(part);",
    "      const selector = parts.join(' > ');",
    "      if (test(selector)) return selector;",
    "      current = parent;",
    "    }",
    "    return parts.join(' > ') || undefined;",
    "  };",
    "  const targetOf = (event) => {",
    "    const element = event.target instanceof Element ? event.target : undefined;",
    "    if (!element) return undefined;",
    "    const input = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element : undefined;",
    "    const value = input ? (input.type === 'password' ? '[redacted]' : input.value) : undefined;",
    "    return {",
    "      selector: selectorFor(element),",
    "      tagName: element.tagName.toLowerCase(),",
    "      role: element.getAttribute('role') ?? undefined,",
    "      name: element.getAttribute('name') ?? undefined,",
    "      inputType: input instanceof HTMLInputElement ? input.type : undefined,",
    "      text: textOf(element.textContent),",
    "      value",
    "    };",
    "  };",
    "  const emit = (type, event, extra = {}) => {",
    "    try {",
    "      const entry = {",
    "        type,",
    "        timeMs: Math.max(0, Date.now() - startedAt),",
    "        url: location.href,",
    "        title: document.title,",
    "        target: targetOf(event),",
    "        ...extra",
    "      };",
    "      console.info(marker + JSON.stringify(entry));",
    "    } catch (error) {",
    "      console.info(marker + JSON.stringify({ type: 'recorder-error', timeMs: Math.max(0, Date.now() - startedAt), message: String(error) }));",
    "    }",
    "  };",
    "  document.addEventListener('click', (event) => emit('click', event, { pointer: { x: event.clientX, y: event.clientY, button: event.button } }), true);",
    "  document.addEventListener('input', (event) => emit('input', event), true);",
    "  document.addEventListener('change', (event) => emit('change', event), true);",
    "  document.addEventListener('keydown', (event) => emit('keydown', event, { key: event.key, code: event.code, altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey }), true);",
    "  document.addEventListener('submit', (event) => emit('submit', event), true);",
    "  console.info(marker + JSON.stringify({ type: 'recorder-ready', timeMs: Math.max(0, Date.now() - startedAt), url: location.href, title: document.title }));",
    "})()"
  ].join("\n");
}

function parseInteractionEventsFromBrowserLogs(stdout: string): InteractionEvent[] {
  const events: InteractionEvent[] = [];
  const seen = new Set<string>();
  for (const line of stdout.split(/\r?\n/u)) {
    const markerIndex = line.indexOf(RECORD_EVENT_CONSOLE_MARKER);
    if (markerIndex < 0) continue;
    const payload = line.slice(markerIndex + RECORD_EVENT_CONSOLE_MARKER.length).trim();
    if (payload.length === 0 || seen.has(payload)) continue;
    try {
      const parsed = JSON.parse(payload) as InteractionEvent;
      if (typeof parsed.type === "string" && typeof parsed.timeMs === "number") {
        seen.add(payload);
        events.push(parsed);
      }
    } catch {
      // Ignore unrelated console lines that happen to contain the marker.
    }
  }
  return events.sort((left, right) => left.timeMs - right.timeMs);
}

function mergeInteractionEvents(...sources: InteractionEvent[][]): InteractionEvent[] {
  const merged: InteractionEvent[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    for (const event of source) {
      const key = JSON.stringify(event);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(event);
    }
  }
  return merged.sort((left, right) => left.timeMs - right.timeMs);
}

function createEventsQuery(): URLSearchParams {
  const params = new URLSearchParams();
  params.set("limit", "50");
  return params;
}

function hasOption(args: ParsedCliArgs, name: string): boolean {
  return args.options.has(name);
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

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function writeJsonLines(path: string, values: unknown[]): Promise<void> {
  await writeFile(path, values.map((value) => JSON.stringify(value)).join("\n") + (values.length === 0 ? "" : "\n"), "utf8");
}

async function appendJsonLine(path: string, value: unknown): Promise<void> {
  await appendFile(path, `${JSON.stringify(value)}\n`, "utf8");
}

async function readJsonLines<T>(path: string): Promise<T[]> {
  const text = await readFile(path, "utf8");
  if (text.trim().length === 0) return [];
  return text
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

async function readJsonLinesIfExists<T>(path: string): Promise<T[]> {
  try {
    return await readJsonLines(path);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }
}

async function countJsonLines(path: string): Promise<number> {
  return (await readJsonLines(path)).length;
}

async function countJsonLinesIfExists(path: string): Promise<number> {
  return (await readJsonLinesIfExists(path)).length;
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function getStringProperty(record: Record<string, unknown> | undefined, name: string): string | undefined {
  const value = record?.[name];
  return typeof value === "string" ? value : undefined;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
