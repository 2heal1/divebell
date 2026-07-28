import { join } from "node:path";
import type { DivebellBrowserApi, DivebellExtensionApi } from "@divebell/cli";
import { readJsonLinesIfExists } from "./storage.js";
import type { DomSnapshotSample, InteractionEvent, OperationEntry, PageSnapshotSample, RuntimeSample } from "./types.js";

const RECORD_EVENT_CONSOLE_MARKER = "__DIVEBELL_RECORD_EVENT__";
export async function collectInteractionEvents(outputDirectory: string, browser: DivebellBrowserApi): Promise<{
  operation: OperationEntry;
  interactions: InteractionEvent[];
}> {
  const started = new Date();
  const persistedInteractions = await readJsonLinesIfExists<InteractionEvent>(join(outputDirectory, "interaction-events.raw.jsonl"));
  let consoleInteractions: InteractionEvent[] = [];
  let consoleError: string | undefined;
  try {
    const result = await browser.console({ query: RECORD_EVENT_CONSOLE_MARKER });
    consoleInteractions = parseInteractionEventsFromConsole(result.entries.map((entry) => entry.args));
  } catch (error) {
    consoleError = error instanceof Error ? error.message : String(error);
  }
  const interactions = mergeInteractionEvents(persistedInteractions, consoleInteractions);
  return {
    operation: {
      type: "interactions.collect",
      startedAt: started.toISOString(),
      endedAt: new Date().toISOString(),
      count: interactions.length,
      persistedCount: persistedInteractions.length,
      consoleCount: consoleInteractions.length,
      ...(consoleError === undefined ? {} : { consoleError })
    },
    interactions
  };
}

export async function sampleRuntime(
  divebell: DivebellExtensionApi,
  selector: { runtimeId?: string; sessionId?: string; url?: string },
  sampledAt: Date
): Promise<RuntimeSample> {
  try {
    const [targets, snapshot, actions, events] = await Promise.all([
      divebell.targets({}, selector),
      divebell.snapshot({}, selector),
      divebell.actions({}, selector),
      divebell.events({ limit: 50 }, selector)
    ]);
    const runtime = targets.runtime;
    return {
      sampledAt: sampledAt.toISOString(),
      ok: true,
      runtimes: [runtime],
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

export async function samplePageSnapshot(
  browser: DivebellBrowserApi,
  sampledAt: Date
): Promise<PageSnapshotSample> {
  const result = await browser.raw(["snapshot"]);
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

export async function sampleDomSnapshot(
  browser: DivebellBrowserApi,
  sampledAt: Date
): Promise<DomSnapshotSample> {
  const result = await browser.raw(["eval", createDomSnapshotScript()]);
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

export function createInteractionRecorderScript(recordingStartedAtMs: number): string {
  return [
    "(() => {",
    "  const marker = " + JSON.stringify(RECORD_EVENT_CONSOLE_MARKER) + ";",
    "  const startedAt = " + JSON.stringify(recordingStartedAtMs) + ";",
    "  if (window.__DIVEBELL_INTERACTION_RECORDER_INSTALLED__) return;",
    "  window.__DIVEBELL_INTERACTION_RECORDER_INSTALLED__ = true;",
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

function parseInteractionEventsFromConsole(entries: string[]): InteractionEvent[] {
  const events: InteractionEvent[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const markerIndex = entry.indexOf(RECORD_EVENT_CONSOLE_MARKER);
    if (markerIndex < 0) continue;
    const payload = entry.slice(markerIndex + RECORD_EVENT_CONSOLE_MARKER.length).trim();
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

export function mergeInteractionEvents(...sources: InteractionEvent[][]): InteractionEvent[] {
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

function parseBrowserJsonOutput(stdout: string): unknown {
  const trimmed = stdout.trim();
  return trimmed.length === 0 ? undefined : JSON.parse(trimmed);
}
