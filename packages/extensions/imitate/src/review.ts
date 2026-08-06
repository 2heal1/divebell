import { appendJsonLine, readJsonFile, readRecordingCounts, readRecordingData, writeJsonFile } from "./storage.js";
import { collectInteractionEvents } from "./capture.js";
import { locateRecordedTargetInPage, writeGeneratedScript, writeWorkflowDraft } from "./script.js";
import {
  clearRecordingControlFile,
  readRecordingControlFile,
  updateRecordingControlFile,
  writeAmendmentControlFile
} from "./session.js";
import { createWorkflowSteps, refreshWorkflowReviewStatus } from "./workflow.js";
import type {
  GeneratedScriptResult,
  RecordCommandOptions,
  RecordedWorkflow,
  RecordedWorkflowStep,
  RecordingManifest
} from "./types.js";
import { join, resolve } from "node:path";

const DEFAULT_REPLAY_TIMEOUT_MS = 15_000;

export async function runRecordReviewCommand(options: RecordCommandOptions): Promise<unknown> {
  const inputDirectory = resolve(requireOption(options, "input"));
  const workflow = await readWorkflowOrCreateDraft(inputDirectory);
  return createReviewResult(inputDirectory, workflow);
}

export async function runRecordConfirmCommand(options: RecordCommandOptions): Promise<unknown> {
  const inputDirectory = resolve(requireOption(options, "input"));
  let workflow = await readWorkflowOrCreateDraft(inputDirectory);
  const stepId = getOptionValue(options, "step");
  const throughStepId = getOptionValue(options, "through");
  const all = hasOption(options, "all");
  if ([stepId !== undefined, throughStepId !== undefined, all].filter(Boolean).length !== 1) {
    throw new Error("Confirm exactly one scope with --step <id>, --through <id>, or --all.");
  }

  const confirmedIds: string[] = [];
  if (all) {
    workflow = {
      ...workflow,
      requirements: {
        authentication: {
          ...workflow.requirements.authentication,
          status: "confirmed"
        }
      },
      steps: workflow.steps.map((step) => ({ ...step, status: "confirmed" }))
    };
    confirmedIds.push("setup-auth", ...workflow.steps.map((step) => step.id));
  } else if (throughStepId !== undefined) {
    const endIndex = throughStepId === "setup-auth" ? -1 : findStepIndex(workflow, throughStepId);
    workflow = {
      ...workflow,
      requirements: {
        authentication: {
          ...workflow.requirements.authentication,
          status: "confirmed"
        }
      },
      steps: workflow.steps.map((step, index) =>
        index <= endIndex ? { ...step, status: "confirmed" } : step
      )
    };
    confirmedIds.push("setup-auth", ...workflow.steps.slice(0, endIndex + 1).map((step) => step.id));
  } else if (stepId === "setup-auth") {
    workflow = {
      ...workflow,
      requirements: {
        authentication: {
          ...workflow.requirements.authentication,
          status: "confirmed"
        }
      }
    };
    confirmedIds.push("setup-auth");
  } else if (stepId !== undefined) {
    findStepIndex(workflow, stepId);
    workflow = {
      ...workflow,
      steps: workflow.steps.map((step) =>
        step.id === stepId ? { ...step, status: "confirmed" } : step
      )
    };
    confirmedIds.push(stepId);
  }

  const now = new Date().toISOString();
  workflow = refreshWorkflowReviewStatus({
    ...workflow,
    revisions: [
      ...workflow.revisions.map((revision) =>
        revision.status === "proposed" && revision.stepIds.every((id) =>
          confirmedIds.includes(id) || workflow.steps.find((step) => step.id === id)?.status === "confirmed"
        )
          ? { ...revision, status: "applied" as const }
          : revision
      ),
      {
        id: `revision-${Date.now()}`,
        type: "confirm",
        createdAt: now,
        stepIds: confirmedIds,
        status: "applied",
        source: "user-confirmation"
      }
    ]
  });
  await writeWorkflow(inputDirectory, workflow);
  await appendWorkflowOperation(inputDirectory, {
    type: "workflow.confirm",
    startedAt: now,
    stepIds: confirmedIds,
    reviewStatus: workflow.review.status
  });

  let generatedScript: GeneratedScriptResult | undefined;
  if (workflow.review.status === "confirmed" && !hasOption(options, "no-script")) {
    generatedScript = await generateConfirmedScript(
      inputDirectory,
      workflow,
      getOptionValue(options, "script-out")
    );
  } else {
    await invalidateGeneratedScript(inputDirectory);
  }

  return {
    ...createReviewResult(inputDirectory, workflow),
    confirmed: confirmedIds,
    ...(generatedScript === undefined ? {} : { script: generatedScript.path })
  };
}

export async function runRecordRemoveStepCommand(options: RecordCommandOptions): Promise<unknown> {
  const inputDirectory = resolve(requireOption(options, "input"));
  const stepId = requireOption(options, "step");
  let workflow = await readWorkflowOrCreateDraft(inputDirectory);
  findStepIndex(workflow, stepId);
  const now = new Date().toISOString();
  workflow = refreshWorkflowReviewStatus({
    ...workflow,
    steps: workflow.steps.filter((step) => step.id !== stepId),
    revisions: [
      ...workflow.revisions,
      {
        id: `revision-${Date.now()}`,
        type: "remove",
        createdAt: now,
        stepIds: [stepId],
        status: "applied",
        source: "user-confirmation"
      }
    ]
  });
  await writeWorkflow(inputDirectory, workflow);
  await invalidateGeneratedScript(inputDirectory);
  await appendWorkflowOperation(inputDirectory, {
    type: "workflow.step.remove",
    startedAt: now,
    stepId
  });
  return createReviewResult(inputDirectory, workflow);
}

export async function runRecordAmendCommand(options: RecordCommandOptions): Promise<unknown> {
  const action = options.args.command[2];
  if (action === "start") return await startAmendment(options);
  if (action === "replay") return await replayAmendmentPrefix(options);
  if (action === "stop") return await stopAmendment(options);
  if (action === "cancel") return await cancelAmendment(options);
  throw new Error("Use `record amend <start|replay|stop|cancel>`.");
}

async function startAmendment(options: RecordCommandOptions): Promise<unknown> {
  if (options.page !== undefined) {
    throw new Error("Close the current Divebell page before preparing a supplemental recording.");
  }
  const inputDirectory = resolve(requireOption(options, "input"));
  const afterStepId = requireOption(options, "after");
  const workflow = await readWorkflowOrCreateDraft(inputDirectory);
  const endIndex = afterStepId === "setup-auth" ? -1 : findStepIndex(workflow, afterStepId);
  const unconfirmed = workflow.steps.slice(0, endIndex + 1).filter((step) => step.status !== "confirmed");
  if (workflow.requirements.authentication.status !== "confirmed" || unconfirmed.length > 0) {
    throw new Error(
      `Confirm setup and the replay prefix first with \`divebell record confirm --input ${inputDirectory} --through ${afterStepId}\`.`
    );
  }

  const startedAt = new Date();
  await writeAmendmentControlFile(inputDirectory, afterStepId, startedAt);
  await appendWorkflowOperation(inputDirectory, {
    type: "amend.prepare",
    startedAt: startedAt.toISOString(),
    afterStepId
  });
  const auth = workflow.requirements.authentication;
  return {
    status: "prepared",
    input: inputDirectory,
    afterStepId,
    next: `divebell open ${JSON.stringify(workflow.startUrl)}${
      auth.mode === "none" ? "" : ` ${auth.parameter} <value>`
    } --ui`,
    authentication: auth
  };
}

async function replayAmendmentPrefix(options: RecordCommandOptions): Promise<unknown> {
  requireCurrentPage(options);
  const inputDirectory = resolve(requireOption(options, "input"));
  const control = await requireAmendmentControl(inputDirectory);
  if (control.amendment?.status !== "opened") {
    throw new Error("Open the workflow start URL after `record amend start`, then replay the prefix.");
  }
  const workflow = await readWorkflowOrCreateDraft(inputDirectory);
  const endIndex = control.amendment.afterStepId === "setup-auth"
    ? -1
    : findStepIndex(workflow, control.amendment.afterStepId);
  const prefix = workflow.steps.slice(0, endIndex + 1);
  const riskySteps = prefix.filter((step) => step.replayRisk === "potentially-mutating");
  if (riskySteps.length > 0 && !hasOption(options, "allow-risky-replay")) {
    return {
      status: "needs_confirmation",
      message: "The replay prefix contains browser actions that may change application data.",
      riskySteps: riskySteps.map(createStepReview),
      next: `divebell record amend replay --input ${JSON.stringify(inputDirectory)} --allow-risky-replay`
    };
  }

  const timeoutMs = getPositiveNumberOption(options, "timeout") ?? DEFAULT_REPLAY_TIMEOUT_MS;
  const completed: unknown[] = [];
  for (const step of prefix) {
    completed.push(await replayStep(options, step, timeoutMs));
  }
  const armedAtMs = Math.max(0, Date.now() - Date.parse(control.startedAt));
  await updateRecordingControlFile({
    ...control,
    amendment: {
      ...control.amendment,
      status: "capturing",
      armedAtMs
    }
  });
  await appendWorkflowOperation(inputDirectory, {
    type: "amend.prefix.replay",
    startedAt: new Date().toISOString(),
    afterStepId: control.amendment.afterStepId,
    completedSteps: prefix.map((step) => step.id),
    armedAtMs
  });
  return {
    status: "capturing",
    input: inputDirectory,
    afterStepId: control.amendment.afterStepId,
    completed,
    next: "Perform only the missing browser action, then run `divebell record amend stop --input <path>`."
  };
}

async function stopAmendment(options: RecordCommandOptions): Promise<unknown> {
  requireCurrentPage(options);
  const inputDirectory = resolve(requireOption(options, "input"));
  const control = await requireAmendmentControl(inputDirectory);
  const amendment = control.amendment;
  if (amendment?.status !== "capturing" || amendment.armedAtMs === undefined) {
    throw new Error("Replay the confirmed prefix before stopping the supplemental recording.");
  }
  const collection = await collectInteractionEvents(inputDirectory, options.divebell.browser, {
    eventsFile: amendment.eventsFile,
    sinceTimeMs: amendment.armedAtMs,
    includeConsole: false
  });
  const proposedSteps = createWorkflowSteps(collection.interactions, [], {
    source: "supplemental-recording",
    status: "needs-confirmation",
    idPrefix: `supplement-${Date.now()}`
  });
  if (proposedSteps.length === 0) {
    throw new Error("No supplemental browser action was captured after the replay prefix.");
  }

  let workflow = await readWorkflowOrCreateDraft(inputDirectory);
  const insertIndex = amendment.afterStepId === "setup-auth"
    ? 0
    : findStepIndex(workflow, amendment.afterStepId) + 1;
  const now = new Date().toISOString();
  workflow = refreshWorkflowReviewStatus({
    ...workflow,
    steps: [
      ...workflow.steps.slice(0, insertIndex),
      ...proposedSteps,
      ...workflow.steps.slice(insertIndex)
    ],
    revisions: [
      ...workflow.revisions,
      {
        id: `revision-${Date.now()}`,
        type: "insert-after",
        createdAt: now,
        afterStepId: amendment.afterStepId,
        stepIds: proposedSteps.map((step) => step.id),
        status: "proposed",
        source: "supplemental-recording"
      }
    ]
  });
  await writeWorkflow(inputDirectory, workflow);
  await invalidateGeneratedScript(inputDirectory);
  await appendWorkflowOperation(inputDirectory, {
    ...collection.operation,
    type: "amend.interactions.collect",
    afterStepId: amendment.afterStepId,
    proposedStepIds: proposedSteps.map((step) => step.id)
  });
  const elementConfirmations: Record<string, unknown>[] = [];
  for (const step of proposedSteps) {
    try {
      const located = await locateStep(options, step, 2_000);
      await options.divebell.browser.run("highlight", { args: [located.selector] });
      elementConfirmations.push({
        stepId: step.id,
        highlighted: true,
        matchedBy: located.matchedBy,
        selector: located.selector,
        page: located.page
      });
    } catch (error) {
      elementConfirmations.push({
        stepId: step.id,
        highlighted: false,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }
  await clearRecordingControlFile();
  return {
    status: "needs_confirmation",
    message: "Confirm that the supplemental steps target the intended elements.",
    proposedSteps: proposedSteps.map(createStepReview),
    elementConfirmations,
    next: proposedSteps.length === 1
      ? `divebell record confirm --input ${JSON.stringify(inputDirectory)} --step ${proposedSteps[0]?.id}`
      : `divebell record review --input ${JSON.stringify(inputDirectory)}`
  };
}

async function cancelAmendment(options: RecordCommandOptions): Promise<unknown> {
  const inputDirectory = resolve(requireOption(options, "input"));
  await requireAmendmentControl(inputDirectory);
  await clearRecordingControlFile();
  await appendWorkflowOperation(inputDirectory, {
    type: "amend.cancel",
    startedAt: new Date().toISOString()
  });
  return { status: "cancelled", input: inputDirectory };
}

async function replayStep(
  options: RecordCommandOptions,
  step: RecordedWorkflowStep,
  timeoutMs: number
): Promise<unknown> {
  const valueOverride = getOptionValue(options, `value-${step.id}`);
  const value = valueOverride ?? step.value;
  if ((step.action === "fill" || step.action === "select") &&
      (value === "[redacted]" || value === "[file-input]")) {
    throw new Error(`Replay needs --value-${step.id} for the protected recorded value.`);
  }
  const deadline = Date.now() + timeoutMs;
  const located = await locateStep(options, step, Math.max(1, deadline - Date.now()));
  if (step.action === "click") await options.divebell.browser.click(located.selector);
  else if (step.action === "fill") await options.divebell.browser.fill(located.selector, String(value ?? ""));
  else if (step.action === "select") await options.divebell.browser.select(located.selector, String(value ?? ""));
  else {
    await options.divebell.browser.focus(located.selector);
    await options.divebell.browser.press(step.key ?? "");
  }
  return {
    id: step.id,
    action: step.action,
    matchedBy: located.matchedBy,
    page: located.page
  };
}

async function locateStep(
  options: RecordCommandOptions,
  step: RecordedWorkflowStep,
  timeoutMs: number
): Promise<ReturnType<typeof locateRecordedTargetInPage> & { found: true; selector: string }> {
  const deadline = Date.now() + timeoutMs;
  let located: ReturnType<typeof locateRecordedTargetInPage> | undefined;
  do {
    located = await options.divebell.browser.eval<ReturnType<typeof locateRecordedTargetInPage>>(
      `(${locateRecordedTargetInPage.toString()})(${JSON.stringify({
        step,
        marker: `divebell-amend-${step.id}`
      })})`
    );
    if (located.found && located.selector !== undefined) {
      return { ...located, found: true, selector: located.selector };
    }
    await delay(250);
  } while (Date.now() <= deadline);
  throw new Error(
    `Could not uniquely locate ${step.id}: ${located?.reason ?? "no recorded locator matched"}.`
  );
}

async function readWorkflowOrCreateDraft(inputDirectory: string): Promise<RecordedWorkflow> {
  const recording = await readRecordingData(inputDirectory);
  if (recording.manifest.status !== "completed") {
    throw new Error("Stop the recording before reviewing or changing its workflow draft.");
  }
  const path = join(inputDirectory, recording.manifest.files.workflow);
  try {
    const workflow = await readJsonFile<RecordedWorkflow>(path);
    if (workflow.schemaVersion === 2) return workflow;
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") throw error;
  }
  return (await writeWorkflowDraft(inputDirectory, recording)).workflow;
}

async function writeWorkflow(inputDirectory: string, workflow: RecordedWorkflow): Promise<void> {
  const recording = await readRecordingData(inputDirectory);
  await writeJsonFile(join(inputDirectory, recording.manifest.files.workflow), workflow);
}

async function generateConfirmedScript(
  inputDirectory: string,
  workflow: RecordedWorkflow,
  outputPath: string | undefined
): Promise<GeneratedScriptResult> {
  const recording = await readRecordingData(inputDirectory);
  const result = await writeGeneratedScript(inputDirectory, workflow, outputPath);
  const generatedAt = new Date().toISOString();
  await appendJsonLine(join(inputDirectory, recording.manifest.files.operations), {
    type: "script.generated",
    startedAt: generatedAt,
    path: result.path,
    workflowReviewStatus: workflow.review.status
  });
  const counts = await readRecordingCounts(inputDirectory, recording.manifest.files);
  await writeJsonFile(join(inputDirectory, recording.manifest.files.manifest), {
    ...recording.manifest,
    counts,
    generated: {
      ...(recording.manifest.generated ?? {}),
      script: result.relativePath,
      workflow: result.workflowRelativePath,
      generatedAt
    }
  } satisfies RecordingManifest);
  return result;
}

async function invalidateGeneratedScript(inputDirectory: string): Promise<void> {
  const recording = await readRecordingData(inputDirectory);
  if (recording.manifest.generated?.script === undefined) return;
  await writeJsonFile(join(inputDirectory, recording.manifest.files.manifest), {
    ...recording.manifest,
    generated: {
      workflow: recording.manifest.generated.workflow ?? recording.manifest.files.workflow,
      generatedAt: new Date().toISOString()
    }
  } satisfies RecordingManifest);
}

async function appendWorkflowOperation(
  inputDirectory: string,
  operation: Record<string, unknown>
): Promise<void> {
  const recording = await readRecordingData(inputDirectory);
  await appendJsonLine(join(inputDirectory, recording.manifest.files.operations), operation);
  const counts = await readRecordingCounts(inputDirectory, recording.manifest.files);
  const current = await readRecordingData(inputDirectory);
  await writeJsonFile(join(inputDirectory, current.manifest.files.manifest), {
    ...current.manifest,
    counts
  } satisfies RecordingManifest);
}

function createReviewResult(
  inputDirectory: string,
  workflow: RecordedWorkflow
): Record<string, unknown> {
  const auth = workflow.requirements.authentication;
  return {
    status: workflow.review.status,
    input: inputDirectory,
    setup: [{
      number: 0,
      id: auth.id,
      status: auth.status,
      title: auth.mode === "none"
        ? "Open without an explicit authentication dependency"
        : `Import ${auth.mode} ${JSON.stringify(auth.displayName)}`,
      command: auth.mode === "none"
        ? `divebell open ${JSON.stringify(workflow.startUrl)}`
        : `divebell open ${JSON.stringify(workflow.startUrl)} ${auth.parameter} <value>`
    }],
    steps: workflow.steps.map((step, index) => ({
      number: index + 1,
      ...createStepReview(step)
    })),
    revisions: workflow.revisions
  };
}

function createStepReview(step: RecordedWorkflowStep): Record<string, unknown> {
  const target = step.target;
  const preferredLocator = target.locators?.[0];
  return {
    id: step.id,
    title: step.title,
    status: step.status,
    source: step.source,
    replayRisk: step.replayRisk,
    command: createStepCommand(step),
    element: {
      tagName: target.tagName,
      role: target.role,
      accessibleName: target.accessibleName,
      label: target.label,
      text: target.text,
      selector: target.selector,
      preferredLocator,
      checked: target.checked
    },
    transcript: step.evidence.transcript
  };
}

function createStepCommand(step: RecordedWorkflowStep): string {
  const locator = step.target.locators?.find((candidate) => candidate.selector !== undefined)?.selector ??
    step.target.selector ??
    step.target.locators?.map((candidate) => `${candidate.kind}:${candidate.value}`).join(" | ") ??
    "<recorded-element>";
  if (step.action === "click") return `divebell click ${JSON.stringify(locator)}`;
  if (step.action === "fill") return `divebell fill ${JSON.stringify(locator)} ${JSON.stringify(step.value ?? "")}`;
  if (step.action === "select") return `divebell select ${JSON.stringify(locator)} ${JSON.stringify(step.value ?? "")}`;
  return `divebell focus ${JSON.stringify(locator)} && divebell press ${JSON.stringify(step.key ?? "")}`;
}

function findStepIndex(workflow: RecordedWorkflow, stepId: string): number {
  const index = workflow.steps.findIndex((step) => step.id === stepId);
  if (index < 0) throw new Error(`Workflow step ${JSON.stringify(stepId)} does not exist.`);
  return index;
}

async function requireAmendmentControl(inputDirectory: string) {
  const control = await readRecordingControlFile();
  if (
    control?.mode !== "amendment" ||
    control.amendment === undefined ||
    resolve(control.outputDirectory) !== inputDirectory
  ) {
    throw new Error("No supplemental recording is active for this workflow.");
  }
  return control;
}

function requireCurrentPage(options: RecordCommandOptions): void {
  if (options.page === undefined) {
    throw new Error("No current Divebell page is available. Open the workflow start URL first.");
  }
}

function requireOption(options: RecordCommandOptions, name: string): string {
  const value = getOptionValue(options, name);
  if (value === undefined || value.length === 0 || value === "true") {
    throw new Error(`Missing required option "--${name}".`);
  }
  return value;
}

function getOptionValue(options: RecordCommandOptions, name: string): string | undefined {
  return options.args.options.get(name)?.at(-1);
}

function hasOption(options: RecordCommandOptions, name: string): boolean {
  return options.args.options.has(name);
}

function getPositiveNumberOption(options: RecordCommandOptions, name: string): number | undefined {
  const value = getOptionValue(options, name);
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`--${name} must be a positive number.`);
  return number;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
