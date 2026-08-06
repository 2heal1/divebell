import type { CliExtensionPageContext, DivebellExtensionApi, ParsedCliArgs } from "@divebell/cli";

interface BridgeRuntimeInfo {
  runtimeId: string;
  url: string;
  sessionId?: string;
  status: string;
  connectedAt: number;
  lastSeenAt: number;
}

export interface RecordCommandOptions {
  args: ParsedCliArgs;
  fetcher: typeof fetch;
  page?: CliExtensionPageContext;
  divebell: DivebellExtensionApi;
}

export interface RecordingFiles {
  manifest: string;
  runtime: string;
  pageSnapshots: string;
  domSnapshots: string;
  interactions: string;
  workflow: string;
  audio: string;
  audioChunks: string;
  audioEvents: string;
  operations: string;
  transcript: string;
}

export interface RecordingManifest {
  format: string;
  version: number;
  status?: "prepared" | "recording" | "completed";
  url?: string;
  openedUrl?: string;
  bridgeUrl?: string | null;
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
  authentication?: RecordedAuthenticationRequirement;
  generated?: {
    script?: string;
    workflow?: string;
    generatedAt?: string;
  };
  invalidated?: {
    reason: string;
    url: string;
    openedUrl: string;
    invalidatedAt: string;
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
  target?: RecordedInteractionTarget;
  [key: string]: unknown;
}

export type RecordedLocatorKind =
  | "test-id"
  | "id"
  | "aria-label"
  | "label"
  | "role"
  | "name"
  | "placeholder"
  | "href"
  | "text"
  | "css";

export interface RecordedLocatorCandidate {
  kind: RecordedLocatorKind;
  value: string;
  selector?: string;
  role?: string;
}

export interface RecordedInteractionTarget {
  selector?: string;
  locators?: RecordedLocatorCandidate[];
  tagName?: string;
  text?: string;
  value?: string;
  role?: string;
  name?: string;
  inputType?: string;
  id?: string;
  testId?: string;
  ariaLabel?: string;
  accessibleName?: string;
  label?: string;
  placeholder?: string;
  title?: string;
  href?: string;
  checked?: boolean;
  selectedValues?: string[];
  contentEditable?: boolean;
  disabled?: boolean;
}

export type RecordedWorkflowAction = "click" | "fill" | "select" | "press";

export type RecordedReviewStatus = "draft" | "needs-confirmation" | "confirmed";

export type RecordedStepSource = "recording" | "supplemental-recording";

export type RecordedReplayRisk = "safe" | "potentially-mutating";

export type RecordedAuthenticationRequirement =
  | {
      id: "setup-auth";
      mode: "none";
      required: false;
      status: RecordedReviewStatus;
    }
  | {
      id: "setup-auth";
      mode: "profile" | "state";
      required: true;
      displayName: string;
      parameter: "--profile" | "--state";
      status: RecordedReviewStatus;
    };

export interface RecordedWorkflowStep {
  id: string;
  title: string;
  status: RecordedReviewStatus;
  source: RecordedStepSource;
  replayRisk: RecordedReplayRisk;
  action: RecordedWorkflowAction;
  timeMs: number;
  page: {
    url?: string;
    title?: string;
  };
  target: RecordedInteractionTarget;
  value?: string;
  key?: string;
  evidence: {
    interactionTimeMs: number;
    transcript: TranscriptSegment[];
  };
}

export interface RecordedWorkflow {
  schemaVersion: 2;
  source: "divebell-recording";
  startUrl: string;
  requirements: {
    authentication: RecordedAuthenticationRequirement;
  };
  review: {
    status: RecordedReviewStatus;
    updatedAt: string;
  };
  finalState: {
    url?: string;
    title?: string;
    signals?: Array<{
      selector?: string;
      text: string;
    }>;
  };
  steps: RecordedWorkflowStep[];
  revisions: RecordedWorkflowRevision[];
}

export interface RecordedWorkflowRevision {
  id: string;
  type: "insert-after" | "remove" | "confirm";
  createdAt: string;
  afterStepId?: string;
  stepIds: string[];
  status: "proposed" | "applied";
  source: "user-confirmation" | "supplemental-recording";
}

export interface RecordingAmendment {
  status: "prepared" | "opened" | "capturing";
  afterStepId: string;
  startedAt: string;
  eventsFile: string;
  armedAtMs?: number;
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
  status: "not-requested" | "not-captured" | "pending" | "completed" | "failed";
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
  workflowPath: string;
  workflowRelativePath: string;
}

export interface WorkflowDraftResult {
  path: string;
  relativePath: string;
  workflow: RecordedWorkflow;
}
