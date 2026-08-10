import type {
  DomSnapshotSample,
  InteractionEvent,
  RecordedAuthenticationRequirement,
  RecordedInteractionTarget,
  RecordedWorkflow,
  RecordedWorkflowStep,
  RecordingData,
  TranscriptSegment
} from "./types.js";

const DEFAULT_RECORD_START_URL = "about:blank";
const NON_ACTION_KEYS = new Set(["Alt", "Control", "Meta", "Shift", "CapsLock"]);
const ENTER_SUBMISSION_WINDOW_MS = 100;

export function createRecordedWorkflow(recording: RecordingData): RecordedWorkflow {
  const steps = createWorkflowSteps(recording.interactions, recording.transcript.segments);
  const finalState = findFinalState(recording.domSnapshots, recording.interactions);
  return {
    schemaVersion: 2,
    source: "divebell-recording",
    startUrl: findStartUrl(recording, steps, finalState.url),
    requirements: {
      authentication: recording.manifest.authentication ?? createNoAuthenticationRequirement()
    },
    review: {
      status: "draft",
      updatedAt: new Date().toISOString()
    },
    finalState,
    steps,
    revisions: []
  };
}

export function createWorkflowSteps(
  interactions: InteractionEvent[],
  transcript: TranscriptSegment[] = [],
  options: {
    source?: RecordedWorkflowStep["source"];
    status?: RecordedWorkflowStep["status"];
    idPrefix?: string;
  } = {}
): RecordedWorkflowStep[] {
  const steps: RecordedWorkflowStep[] = [];
  let pendingInput: InteractionEvent | undefined;
  let recentEnter: InteractionEvent | undefined;
  const latestInputValues = new Map<string, string>();

  const appendStep = (
    action: RecordedWorkflowStep["action"],
    interaction: InteractionEvent,
    properties: Pick<RecordedWorkflowStep, "value" | "key"> | Record<string, never> = {}
  ): void => {
    if (interaction.target === undefined) return;
    const target = interaction.target;
    steps.push({
      id: `${options.idPrefix ?? "step"}-${steps.length + 1}`,
      title: createStepTitle(action, target),
      status: options.status ?? "draft",
      source: options.source ?? "recording",
      replayRisk: createReplayRisk(action),
      action,
      timeMs: interaction.timeMs,
      page: {
        ...(interaction.url === undefined ? {} : { url: stripDivebellSession(interaction.url) }),
        ...(interaction.title === undefined ? {} : { title: interaction.title })
      },
      target,
      ...properties,
      evidence: {
        interactionTimeMs: interaction.timeMs,
        transcript: findRelatedTranscript(transcript, interaction.timeMs)
      }
    });
  };

  const flushInputs = (): void => {
    const interaction = pendingInput;
    pendingInput = undefined;
    const value = interaction?.target?.value;
    if (interaction === undefined || value === undefined) return;
    const identity = createTargetIdentity(interaction);
    if (latestInputValues.get(identity) === value) return;
    latestInputValues.set(identity, value);
    appendStep(
      interaction.target?.tagName === "select" ? "select" : "fill",
      interaction,
      { value }
    );
  };

  for (const interaction of interactions) {
    if (interaction.target === undefined) continue;
    if (interaction.type === "input" || interaction.type === "change") {
      if (isClickControlledInput(interaction.target)) continue;
      if (isChangeCausedByEnter(interaction, recentEnter)) continue;
      recentEnter = undefined;
      if (
        pendingInput !== undefined &&
        createTargetIdentity(pendingInput) !== createTargetIdentity(interaction)
      ) {
        flushInputs();
      }
      pendingInput = interaction;
      continue;
    }
    if (interaction.type === "click") {
      if (isSyntheticSubmitClick(interaction, recentEnter)) {
        recentEnter = undefined;
        continue;
      }
      recentEnter = undefined;
      flushInputs();
      appendStep("click", interaction);
      latestInputValues.clear();
      continue;
    }
    if (interaction.type === "keydown") {
      if (!isReplayableKey(interaction)) continue;
      flushInputs();
      appendStep("press", interaction, { key: createKeyChord(interaction) });
      recentEnter = isPlainEnter(interaction) ? interaction : undefined;
      latestInputValues.clear();
    }
  }
  flushInputs();
  return steps;
}

export function refreshWorkflowReviewStatus(workflow: RecordedWorkflow): RecordedWorkflow {
  const statuses = [
    workflow.requirements.authentication.status,
    ...workflow.steps.map((step) => step.status)
  ];
  const status = statuses.every((item) => item === "confirmed")
    ? "confirmed"
    : statuses.some((item) => item === "needs-confirmation")
      ? "needs-confirmation"
      : "draft";
  return {
    ...workflow,
    review: {
      status,
      updatedAt: new Date().toISOString()
    }
  };
}

export function alignWorkflowTranscript(
  workflow: RecordedWorkflow,
  transcript: TranscriptSegment[]
): RecordedWorkflow {
  return {
    ...workflow,
    review: {
      ...workflow.review,
      updatedAt: new Date().toISOString()
    },
    steps: workflow.steps.map((step) => ({
      ...step,
      evidence: {
        ...step.evidence,
        transcript: findRelatedTranscript(transcript, step.evidence.interactionTimeMs)
      }
    }))
  };
}

export function createNoAuthenticationRequirement(): RecordedAuthenticationRequirement {
  return {
    id: "setup-auth",
    mode: "none",
    required: false,
    status: "draft"
  };
}

function createStepTitle(
  action: RecordedWorkflowStep["action"],
  target: RecordedInteractionTarget
): string {
  const name = target.accessibleName ?? target.label ?? target.text ?? target.placeholder ??
    target.name ?? target.id ?? target.selector ?? "recorded element";
  if (action === "click") return `Click ${JSON.stringify(name)}`;
  if (action === "fill") return `Fill ${JSON.stringify(name)}`;
  if (action === "select") return `Select ${JSON.stringify(name)}`;
  return `Press key on ${JSON.stringify(name)}`;
}

function createReplayRisk(action: RecordedWorkflowStep["action"]): RecordedWorkflowStep["replayRisk"] {
  void action;
  return "potentially-mutating";
}

function findRelatedTranscript(
  segments: TranscriptSegment[],
  timeMs: number
): TranscriptSegment[] {
  return segments.filter((segment) =>
    segment.startMs <= timeMs + 2_000 && segment.endMs >= timeMs - 2_000
  );
}

function isClickControlledInput(target: RecordedInteractionTarget): boolean {
  return target.tagName === "input" && ["checkbox", "radio", "file"].includes(target.inputType ?? "");
}

function isReplayableKey(interaction: InteractionEvent): boolean {
  const key = typeof interaction.key === "string" ? interaction.key : undefined;
  if (key === undefined || NON_ACTION_KEYS.has(key)) return false;
  const hasModifier = interaction.altKey === true ||
    interaction.ctrlKey === true ||
    interaction.metaKey === true;
  if (hasModifier) return true;
  return key.length > 1;
}

function isPlainEnter(interaction: InteractionEvent): boolean {
  return interaction.key === "Enter" &&
    interaction.altKey !== true &&
    interaction.ctrlKey !== true &&
    interaction.metaKey !== true &&
    interaction.shiftKey !== true;
}

function isChangeCausedByEnter(
  interaction: InteractionEvent,
  recentEnter: InteractionEvent | undefined
): boolean {
  if (recentEnter === undefined) return false;
  return interaction.type === "change" &&
    isWithinEnterSubmissionWindow(interaction, recentEnter) &&
    createTargetIdentity(interaction) === createTargetIdentity(recentEnter) &&
    interaction.target?.value === recentEnter?.target?.value;
}

function isSyntheticSubmitClick(
  interaction: InteractionEvent,
  recentEnter: InteractionEvent | undefined
): boolean {
  if (!isWithinEnterSubmissionWindow(interaction, recentEnter)) return false;
  const target = interaction.target;
  const pointer = asRecord(interaction.pointer);
  const isSubmitControl = target?.tagName === "button" ||
    (target?.tagName === "input" && ["button", "submit"].includes(target.inputType ?? ""));
  return isSubmitControl && pointer?.x === 0 && pointer.y === 0;
}

function isWithinEnterSubmissionWindow(
  interaction: InteractionEvent,
  recentEnter: InteractionEvent | undefined
): boolean {
  if (recentEnter === undefined || !isPlainEnter(recentEnter)) return false;
  const elapsed = interaction.timeMs - recentEnter.timeMs;
  return elapsed >= 0 && elapsed <= ENTER_SUBMISSION_WINDOW_MS &&
    stripDivebellSession(interaction.url) === stripDivebellSession(recentEnter.url);
}

function createKeyChord(interaction: InteractionEvent): string {
  const parts: string[] = [];
  if (interaction.ctrlKey === true) parts.push("Control");
  if (interaction.metaKey === true) parts.push("Meta");
  if (interaction.altKey === true) parts.push("Alt");
  if (interaction.shiftKey === true && interaction.key !== "Shift") parts.push("Shift");
  parts.push(typeof interaction.key === "string" ? interaction.key : "");
  return parts.filter(Boolean).join("+");
}

function createTargetIdentity(interaction: InteractionEvent): string {
  const target = interaction.target;
  const locator = target?.locators?.[0];
  return JSON.stringify([
    stripDivebellSession(interaction.url),
    target?.selector,
    locator?.kind,
    locator?.value,
    target?.tagName,
    target?.name
  ]);
}

function findStartUrl(
  recording: RecordingData,
  steps: RecordedWorkflowStep[],
  finalUrl: string | undefined
): string {
  const requestedUrl = recording.manifest.url;
  if (requestedUrl !== undefined && requestedUrl !== DEFAULT_RECORD_START_URL) {
    return stripDivebellSession(requestedUrl) ?? requestedUrl;
  }
  const firstStepUrl = steps.find((step) =>
    step.page.url !== undefined && step.page.url !== DEFAULT_RECORD_START_URL
  )?.page.url;
  return firstStepUrl ?? finalUrl ?? requestedUrl ?? DEFAULT_RECORD_START_URL;
}

function findFinalState(
  domSnapshots: DomSnapshotSample[],
  interactions: InteractionEvent[]
): RecordedWorkflow["finalState"] {
  for (const sample of [...domSnapshots].reverse()) {
    const result = asRecord(sample.result);
    const url = getStringProperty(result, "url");
    const title = getStringProperty(result, "title");
    const signals = getFinalSignals(result?.signals);
    if (url !== undefined || title !== undefined || signals.length > 0) {
      return {
        ...(url === undefined ? {} : { url: stripDivebellSession(url) }),
        ...(title === undefined ? {} : { title }),
        ...(signals.length === 0 ? {} : { signals })
      };
    }
  }
  const interaction = interactions.at(-1);
  return {
    ...(interaction?.url === undefined ? {} : { url: stripDivebellSession(interaction.url) }),
    ...(interaction?.title === undefined ? {} : { title: interaction.title })
  };
}

function stripDivebellSession(value: string): string;
function stripDivebellSession(value: undefined): undefined;
function stripDivebellSession(value: string | undefined): string | undefined;
function stripDivebellSession(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    const url = new URL(value);
    url.searchParams.delete("divebellSessionId");
    return url.toString();
  } catch {
    return value;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function getStringProperty(
  record: Record<string, unknown> | undefined,
  name: string
): string | undefined {
  const value = record?.[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getFinalSignals(value: unknown): NonNullable<RecordedWorkflow["finalState"]["signals"]> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = asRecord(item);
      const text = getStringProperty(record, "text");
      if (text === undefined) return undefined;
      const selector = getStringProperty(record, "selector");
      return {
        ...(selector === undefined ? {} : { selector }),
        text
      };
    })
    .filter((item): item is { selector?: string; text: string } => item !== undefined);
}
