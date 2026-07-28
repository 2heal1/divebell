import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { GeneratedScriptResult, InteractionEvent, PageSnapshotSample, RecordingData, RuntimeSample, TranscriptData, TranscriptSegment, TranscriptWord } from "./types.js";

const DEFAULT_RECORD_START_URL = "about:blank";
export async function writeGeneratedScript(
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
  const manifestUrl = manifest.url ?? DEFAULT_RECORD_START_URL;
  const manifestOpenedUrl = manifest.openedUrl ?? manifestUrl;
  const scriptUrl = manifestUrl === DEFAULT_RECORD_START_URL
    ? recordedUrl ?? manifestOpenedUrl
    : manifestOpenedUrl;
  const waitTargetLiteral = waitTarget === undefined ? "undefined" : JSON.stringify(waitTarget, null, 2);
  const actionsComment = actionNames.length === 0
    ? "No runtime actions were discovered in the recording."
    : `Discovered runtime actions: ${actionNames.join(", ")}`;
  const pageComment = pageTitle === undefined ? "No page title was captured." : `Captured page title: ${pageTitle}`;
  const interactionSteps = createInteractionScriptSteps(recording.interactions);
  const interactionComment = interactionSteps.length === 0
    ? "No browser interaction events were captured."
    : `Captured browser interaction events: ${recording.interactions.length}`;
  const transcriptComment = createTranscriptScriptComment(recording.transcript);

  return `#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cli = process.env.DIVEBELL_CLI ?? "divebell";
const bridgeUrl = ${JSON.stringify(manifest.bridgeUrl ?? null)};
const bridgeArgs = bridgeUrl === null ? [] : ["--bridge", bridgeUrl];
const url = ${JSON.stringify(scriptUrl)};
const waitTarget = ${waitTargetLiteral};

// Generated from a Divebell recording.
// ${pageComment}
// ${actionsComment}
// ${interactionComment}
// ${transcriptComment}

async function run(args) {
  const { stdout, stderr } = await execFileAsync(cli, args, {
    env: process.env
  });
  if (stdout.trim().length > 0) process.stdout.write(stdout);
  if (stderr.trim().length > 0) process.stderr.write(stderr);
}

async function main() {
  await run(["open", url, ...bridgeArgs, "--ui"]);

${interactionSteps.length === 0 ? "  // TODO: no click/input events were captured for this recording." : interactionSteps.map((step) => `  ${step}`).join("\n")}

  if (waitTarget !== undefined) {
    await run([
      "wait-for",
      ...bridgeArgs,
      "--url",
      url,
      waitTarget.targetId,
      waitTarget.status,
      "--timeout",
      "10000"
    ]);
  }

  await run(["snapshot", ...bridgeArgs, "--url", url]);
  await run(["events", ...bridgeArgs, "--url", url, "--limit", "50"]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;
}

function createTranscriptScriptComment(transcript: TranscriptData): string {
  if (transcript.segments.length === 0) {
    return transcript.audio === undefined
      ? "No voice transcript was captured."
      : `Voice audio was saved to ${transcript.audio}, but no transcript text is available.`;
  }
  const summary = transcript.segments
    .slice(0, 4)
    .map((segment) => `[${segment.startMs}-${segment.endMs}ms] ${segment.text}`)
    .join(" | ");
  return `Voice transcript: ${summary}`;
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

export function normalizeTranscriptSegments(value: unknown, fallbackText: unknown): TranscriptSegment[] {
  if (!Array.isArray(value)) {
    return typeof fallbackText === "string" && fallbackText.length > 0
      ? [{ startMs: 0, endMs: 0, text: fallbackText }]
      : [];
  }
  return value
    .map((item) => {
      const record = asRecord(item);
      if (record === undefined) return undefined;
      const text = getStringProperty(record, "text");
      if (text === undefined) return undefined;
      const start = getNumberProperty(record, "start");
      const end = getNumberProperty(record, "end");
      return {
        startMs: secondsToMs(start),
        endMs: secondsToMs(end),
        text
      };
    })
    .filter((item): item is TranscriptSegment => item !== undefined);
}

export function normalizeTranscriptWords(value: unknown): TranscriptWord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = asRecord(item);
      if (record === undefined) return undefined;
      const text = getStringProperty(record, "word") ?? getStringProperty(record, "text");
      if (text === undefined) return undefined;
      return {
        startMs: secondsToMs(getNumberProperty(record, "start")),
        endMs: secondsToMs(getNumberProperty(record, "end")),
        text
      };
    })
    .filter((item): item is TranscriptWord => item !== undefined);
}

function secondsToMs(value: number | undefined): number {
  return value === undefined ? 0 : Math.max(0, Math.round(value * 1000));
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

export function createManifestPath(recordingDirectory: string, scriptPath: string): string {
  const relativePath = relative(recordingDirectory, scriptPath);
  if (relativePath.length > 0 && !relativePath.startsWith("..") && !isAbsolute(relativePath)) {
    return relativePath;
  }
  return scriptPath;
}


function asRecord(value: unknown): Record<string, unknown> | undefined { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function getStringProperty(record: Record<string, unknown> | undefined, name: string): string | undefined { const value = record?.[name]; return typeof value === "string" ? value : undefined; }
function getNumberProperty(record: Record<string, unknown> | undefined, name: string): number | undefined { const value = record?.[name]; return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
