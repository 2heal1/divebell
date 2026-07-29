import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type {
  GeneratedScriptResult,
  RecordedLocatorCandidate,
  RecordedWorkflow,
  RecordedWorkflowStep,
  RecordingData,
  TranscriptSegment,
  TranscriptWord
} from "./types.js";
import { createRecordedWorkflow } from "./workflow.js";

export async function writeGeneratedScript(
  recordingDirectory: string,
  recording: RecordingData,
  outputPath: string | undefined
): Promise<GeneratedScriptResult> {
  const scriptPath = resolve(outputPath ?? join(recordingDirectory, "generated-script.mjs"));
  const workflowPath = resolve(recordingDirectory, recording.manifest.files.workflow);
  const workflow = createRecordedWorkflow(recording);
  const content = createGeneratedScriptContent(workflow);
  await mkdir(dirname(scriptPath), { recursive: true });
  await writeFile(workflowPath, `${JSON.stringify(workflow, null, 2)}\n`, "utf8");
  await writeFile(scriptPath, content, "utf8");
  await chmod(scriptPath, 0o755);
  return {
    path: scriptPath,
    relativePath: createManifestPath(recordingDirectory, scriptPath),
    workflowPath,
    workflowRelativePath: createManifestPath(recordingDirectory, workflowPath)
  };
}

function createGeneratedScriptContent(workflow: RecordedWorkflow): string {
  const locatorSource = locateRecordedTargetInPage.toString();
  const pageStateSource = readPageStateInPage.toString();
  return `#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cli = process.env.DIVEBELL_CLI ?? "divebell";
const workflow = ${JSON.stringify(workflow, null, 2)};
const locateRecordedTargetSource = ${JSON.stringify(locatorSource)};
const readPageStateSource = ${JSON.stringify(pageStateSource)};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const timeoutMs = toPositiveInteger(args.timeout, 15000);
  const openArgs = ["open", workflow.startUrl];
  if (args.headless !== true) openArgs.push("--ui");
  await run(openArgs, timeoutMs);

  const completed = [];
  for (const step of workflow.steps) {
    const valueOverride = args[\`value-\${step.id}\`];
    const value = typeof valueOverride === "string" ? valueOverride : step.value;
    if ((step.action === "fill" || step.action === "select") &&
        (value === "[redacted]" || value === "[file-input]")) {
      writeJson({
        status: "needs_input",
        message: \`Recorded \${step.action} value for \${step.id} cannot be stored safely.\`,
        options: [{
          label: step.target.accessibleName ?? step.target.label ?? step.id,
          value: \`--value-\${step.id}\`
        }],
        data: { completed, pendingStep: step }
      });
      return;
    }

    const located = await waitForRecordedTarget(step, timeoutMs);
    await runRecordedStep(step, located.selector, value, timeoutMs);
    completed.push({
      id: step.id,
      action: step.action,
      matchedBy: located.matchedBy,
      page: located.page
    });
  }

  const page = await waitForFinalState(workflow.finalState, timeoutMs);
  writeJson({
    status: "ok",
    data: {
      startUrl: workflow.startUrl,
      completedSteps: completed.length,
      steps: completed,
      page
    }
  });
}

async function waitForRecordedTarget(step, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastResult;
  let lastError;
  while (Date.now() <= deadline) {
    try {
      const marker = \`divebell-\${step.id}\`;
      const script = \`(\${locateRecordedTargetSource})(\${JSON.stringify({ step, marker })})\`;
      const result = await runJson(["eval", script], timeoutMs);
      lastResult = result;
      if (result?.found === true && typeof result.selector === "string") return result;
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  const detail = lastResult === undefined ? undefined : lastResult;
  const reason = lastError instanceof Error ? lastError.message : undefined;
  throw new Error(\`Could not find the recorded element for \${step.id} (\${step.action}). \${reason ?? JSON.stringify(detail)}\`);
}

async function runRecordedStep(step, selector, value, timeoutMs) {
  debug(\`Running \${step.id}: \${step.action} via \${selector}\`);
  if (step.action === "click") {
    await run(["click", selector], timeoutMs);
    return;
  }
  if (step.action === "fill") {
    await run(["fill", selector, String(value ?? "")], timeoutMs);
    return;
  }
  if (step.action === "select") {
    await run(["select", selector, String(value ?? "")], timeoutMs);
    return;
  }
  if (step.action === "press") {
    await run(["focus", selector], timeoutMs);
    await run(["press", step.key], timeoutMs);
    return;
  }
  throw new Error(\`Unsupported recorded action: \${step.action}\`);
}

async function waitForFinalState(expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() <= deadline) {
    try {
      latest = await runJson(["eval", \`(\${readPageStateSource})()\`], timeoutMs);
      if (matchesFinalState(expected, latest)) return latest;
    } catch {
      // Navigation can briefly destroy the page context. Retry until the deadline.
    }
    await delay(250);
  }
  throw new Error(\`The replay finished its actions but did not reach the recorded final page: \${JSON.stringify({ expected, latest })}\`);
}

function matchesFinalState(expected, actual) {
  if (actual === undefined || actual === null) return false;
  if (typeof expected.url === "string" && !samePageUrl(expected.url, actual.url)) return false;
  if (typeof expected.title === "string" && expected.title.length > 0 && actual.title !== expected.title) return false;
  if (Array.isArray(expected.signals) && expected.signals.length > 0) {
    const actualSignals = Array.isArray(actual.signals) ? actual.signals : [];
    if (!expected.signals.every((expectedSignal) =>
      actualSignals.some((actualSignal) =>
        actualSignal?.text === expectedSignal.text &&
        (expectedSignal.selector === undefined || actualSignal?.selector === expectedSignal.selector)
      )
    )) return false;
  }
  return true;
}

function samePageUrl(expected, actual) {
  if (typeof actual !== "string") return false;
  try {
    const left = new URL(expected);
    const right = new URL(actual);
    left.searchParams.delete("divebellSessionId");
    right.searchParams.delete("divebellSessionId");
    return left.origin === right.origin &&
      left.pathname === right.pathname &&
      left.search === right.search &&
      left.hash === right.hash;
  } catch {
    return expected === actual;
  }
}

async function runJson(args, timeoutMs) {
  const stdout = await run(args, timeoutMs);
  const text = stdout.trim();
  return text.length === 0 ? undefined : JSON.parse(text);
}

async function run(args, timeoutMs) {
  const summary = args[0] === "eval" ? "eval <recorded page check>" : args.join(" ");
  debug(\`$ \${cli} \${summary}\`);
  try {
    const result = await execFileAsync(cli, args, {
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
      timeout: timeoutMs + 5000,
      killSignal: "SIGTERM"
    });
    if (result.stderr.trim().length > 0) debug(result.stderr.trim());
    return result.stdout;
  } catch (error) {
    const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
    const stdout = typeof error?.stdout === "string" ? error.stdout.trim() : "";
    throw new Error(stderr || stdout || (error instanceof Error ? error.message : String(error)));
  }
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function toPositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function writeJson(value) {
  process.stdout.write(\`\${JSON.stringify(value, null, 2)}\\n\`);
}

function debug(message) {
  process.stderr.write(\`\${message}\\n\`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  writeJson({
    status: "error",
    message: error instanceof Error ? error.message : String(error)
  });
  process.exitCode = 1;
});
`;
}

function locateRecordedTargetInPage(input: {
  step: RecordedWorkflowStep;
  marker: string;
}): {
  found: boolean;
  selector?: string;
  matchedBy?: string;
  reason?: string;
  page: { url: string; title: string; readyState: string };
} {
  const { step, marker } = input;
  const page = {
    url: location.href,
    title: document.title,
    readyState: document.readyState
  };
  const normalize = (value: unknown): string =>
    String(value ?? "").replace(/\s+/gu, " ").trim();
  const isVisible = (element: Element): boolean => {
    if (!(element instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.pointerEvents !== "none" &&
      Number(style.opacity) !== 0 &&
      rect.width > 0 &&
      rect.height > 0;
  };
  const roleOf = (element: Element): string | undefined => {
    const explicit = element.getAttribute("role");
    if (explicit) return explicit;
    if (element.matches("button,input[type=button],input[type=submit],input[type=reset]")) return "button";
    if (element.matches("a[href]")) return "link";
    if (element.matches("input[type=checkbox]")) return "checkbox";
    if (element.matches("input[type=radio]")) return "radio";
    if (element.matches("select")) return "combobox";
    if (element.matches("input:not([type]),input[type=text],input[type=email],input[type=search],textarea")) return "textbox";
    return undefined;
  };
  const labelTextOf = (label: HTMLLabelElement): string => {
    const clone = label.cloneNode(true) as HTMLLabelElement;
    clone.querySelectorAll("input,textarea,select,button").forEach((control) => control.remove());
    return normalize(clone.textContent);
  };
  const labelOf = (element: Element): string | undefined => {
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    ) {
      const label = Array.from(element.labels ?? [])
        .map(labelTextOf)
        .find(Boolean);
      if (label) return label;
    }
    const wrappingLabel = element.closest("label");
    return (wrappingLabel === null ? "" : labelTextOf(wrappingLabel)) || undefined;
  };
  const accessibleNameOf = (element: Element): string => normalize(
    element.getAttribute("aria-label") ??
    labelOf(element) ??
    element.getAttribute("alt") ??
    element.getAttribute("title") ??
    element.getAttribute("placeholder") ??
    (
      element instanceof HTMLInputElement &&
      ["button", "submit", "reset"].includes(element.type)
        ? element.value
        : undefined
    ) ??
    element.textContent
  );
  const querySelector = (selector: string): Element[] => {
    try {
      return Array.from(document.querySelectorAll(selector)).filter(isVisible);
    } catch {
      return [];
    }
  };
  const queryByLocator = (locator: RecordedLocatorCandidate): Element[] => {
    if (locator.selector) return querySelector(locator.selector);
    if (locator.kind === "label") {
      return Array.from(document.querySelectorAll("label"))
        .filter((label) => labelTextOf(label) === normalize(locator.value))
        .map((label) => label.control ?? label.querySelector("input,textarea,select,button"))
        .filter((element): element is Element => element !== null && isVisible(element));
    }
    const selector = step.target.tagName ?? [
      "button",
      "a[href]",
      "input",
      "textarea",
      "select",
      "[role=button]",
      "[role=link]",
      "[role=menuitem]",
      "[role=tab]",
      "[role=option]",
      "[role=checkbox]",
      "[role=radio]",
      "[role=switch]"
    ].join(",");
    return querySelector(selector).filter((element) => {
      if (locator.kind === "role") {
        return roleOf(element) === locator.role &&
          accessibleNameOf(element) === normalize(locator.value);
      }
      if (locator.kind === "text") {
        return accessibleNameOf(element) === normalize(locator.value) ||
          normalize(element.textContent) === normalize(locator.value);
      }
      return false;
    });
  };
  const score = (element: Element): number => {
    let value = 0;
    if (step.target.tagName && element.tagName.toLowerCase() === step.target.tagName) value += 4;
    if (step.target.role && roleOf(element) === step.target.role) value += 4;
    if (step.target.name && element.getAttribute("name") === step.target.name) value += 3;
    if (step.target.accessibleName &&
        accessibleNameOf(element) === normalize(step.target.accessibleName)) value += 6;
    if (step.target.text && normalize(element.textContent) === normalize(step.target.text)) value += 2;
    return value;
  };
  const choose = (elements: Element[]): Element | undefined => {
    const unique = [...new Set(elements)];
    if (unique.length === 1) return unique[0];
    if (unique.length === 0) return undefined;
    const ranked = unique.map((element) => ({ element, score: score(element) }))
      .sort((left, right) => right.score - left.score);
    if (ranked[0] !== undefined && ranked[0].score > (ranked[1]?.score ?? -1)) {
      return ranked[0].element;
    }
    return undefined;
  };

  document.querySelectorAll("[data-divebell-replay-target]").forEach((element) => {
    element.removeAttribute("data-divebell-replay-target");
  });
  const locators = step.target.locators ?? (
    step.target.selector === undefined
      ? []
      : [{ kind: "css", value: step.target.selector, selector: step.target.selector }]
  );
  for (const locator of locators) {
    const element = choose(queryByLocator(locator));
    if (element === undefined) continue;
    element.setAttribute("data-divebell-replay-target", marker);
    return {
      found: true,
      selector: `[data-divebell-replay-target=${JSON.stringify(marker)}]`,
      matchedBy: `${locator.kind}:${locator.value}`,
      page
    };
  }
  return {
    found: false,
    reason: `No unique visible element matched ${locators.length} recorded locator candidates.`,
    page
  };
}

function readPageStateInPage(): {
  url: string;
  title: string;
  readyState: string;
  signals: Array<{ selector: string; text: string }>;
} {
  const normalize = (value: unknown): string =>
    String(value ?? "").replace(/\s+/gu, " ").trim();
  return {
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    signals: Array.from(document.querySelectorAll("output,[role=alert],[role=status],[aria-live],dialog"))
      .map((element) => ({
        selector: element.id ? `#${CSS.escape(element.id)}` : element.tagName.toLowerCase(),
        text: normalize(element.textContent).slice(0, 500)
      }))
      .filter((item) => item.text.length > 0)
      .slice(0, 20)
  };
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
      return {
        startMs: secondsToMs(getNumberProperty(record, "start")),
        endMs: secondsToMs(getNumberProperty(record, "end")),
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

export function createManifestPath(recordingDirectory: string, scriptPath: string): string {
  const relativePath = relative(recordingDirectory, scriptPath);
  if (relativePath.length > 0 && !relativePath.startsWith("..") && !isAbsolute(relativePath)) {
    return relativePath;
  }
  return scriptPath;
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
  return typeof value === "string" ? value : undefined;
}

function getNumberProperty(
  record: Record<string, unknown> | undefined,
  name: string
): number | undefined {
  const value = record?.[name];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
