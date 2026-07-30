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
    "  const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();",
    "  const signals = Array.from(document.querySelectorAll('output,[role=alert],[role=status],[aria-live],dialog'))",
    "    .map((element) => ({",
    "      selector: element.id ? `#${CSS.escape(element.id)}` : element.tagName.toLowerCase(),",
    "      text: normalize(element.textContent).slice(0, 500)",
    "    }))",
    "    .filter((item) => item.text.length > 0)",
    "    .slice(0, 20);",
    "  return {",
    "    url: location.href,",
    "    title: document.title,",
    "    capturedAt: Date.now(),",
    "    htmlLength: html.length,",
    "    html: html.slice(0, 200000),",
    "    signals",
    "  };",
    "})()"
  ].join("\n");
}

export function createInteractionRecorderScript(
  recordingStartedAtMs: number,
  options: {
    companionUrl?: string;
  } = {}
): string {
  const companionPath = getUrlPathname(options.companionUrl);
  return [
    "(() => {",
    `  const companionPath = ${JSON.stringify(companionPath)};`,
    "  if (companionPath !== undefined && globalThis.location?.pathname === companionPath) return;",
    `  (${installInteractionRecorder.toString()})(${JSON.stringify(recordingStartedAtMs)}, ${JSON.stringify(RECORD_EVENT_CONSOLE_MARKER)});`,
    "})()"
  ].join("\n");
}

function getUrlPathname(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    return new URL(value).pathname;
  } catch {
    return undefined;
  }
}

function installInteractionRecorder(startedAt: number, marker: string): void {
  const recorderWindow = window as Window & {
    __DIVEBELL_INTERACTION_RECORDER_INSTALLED__?: boolean;
  };
  if (recorderWindow.__DIVEBELL_INTERACTION_RECORDER_INSTALLED__) return;
  recorderWindow.__DIVEBELL_INTERACTION_RECORDER_INSTALLED__ = true;
  let sequence = 0;

  const textOf = (value: unknown, max = 160): string =>
    String(value ?? "").replace(/\s+/gu, " ").trim().slice(0, max);
  const cssEscape = (value: string): string => {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
    return value.replace(/[^a-zA-Z0-9_-]/gu, "\\$&");
  };
  const isUnique = (selector: string): boolean => {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  };
  const attrSelector = (element: Element, name: string, value: string): string =>
    `${element.tagName.toLowerCase()}[${name}=${JSON.stringify(value)}]`;
  const labelTextOf = (label: HTMLLabelElement): string => {
    const clone = label.cloneNode(true) as HTMLLabelElement;
    clone.querySelectorAll("input,textarea,select,button").forEach((control) => control.remove());
    return textOf(clone.textContent);
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
    const text = wrappingLabel === null ? "" : labelTextOf(wrappingLabel);
    return text || undefined;
  };
  const accessibleNameOf = (element: Element, label: string | undefined): string | undefined => {
    const name = textOf(
      element.getAttribute("aria-label") ??
      label ??
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
    return name || undefined;
  };
  const cssPathFor = (element: Element): string | undefined => {
    const parts: string[] = [];
    let current: Element | null = element;
    while (current && current !== document.documentElement) {
      let part = current.tagName.toLowerCase();
      const parent: Element | null = current.parentElement;
      if (!parent) break;
      const siblings = Array.from(parent.children).filter((item) => item.tagName === current?.tagName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      parts.unshift(part);
      const selector = parts.join(" > ");
      if (isUnique(selector)) return selector;
      current = parent;
    }
    return parts.join(" > ") || undefined;
  };
  const actionElementOf = (event: Event, type: string): Element | undefined => {
    const path = event.composedPath().filter((item): item is Element => item instanceof Element);
    const first = path[0];
    if (type !== "click") return first;
    return path.find((element) => element.matches([
      "button",
      "a[href]",
      "input",
      "select",
      "textarea",
      "[role=button]",
      "[role=link]",
      "[role=menuitem]",
      "[role=tab]",
      "[role=option]",
      "[role=checkbox]",
      "[role=radio]",
      "[role=switch]",
      "[onclick]"
    ].join(","))) ?? first;
  };
  const targetOf = (event: Event, type: string): Record<string, unknown> | undefined => {
    const element = actionElementOf(event, type);
    if (!element) return undefined;
    const tagName = element.tagName.toLowerCase();
    const id = element.getAttribute("id") ?? undefined;
    const testId = element.getAttribute("data-testid") ?? element.getAttribute("data-test-id") ?? undefined;
    const ariaLabel = element.getAttribute("aria-label") ?? undefined;
    const role = element.getAttribute("role") ?? undefined;
    const name = element.getAttribute("name") ?? undefined;
    const placeholder = element.getAttribute("placeholder") ?? undefined;
    const title = element.getAttribute("title") ?? undefined;
    const href = element.getAttribute("href") ?? undefined;
    const label = labelOf(element);
    const accessibleName = accessibleNameOf(element, label);
    const text = textOf(element.textContent) || undefined;
    const locators: Array<Record<string, string>> = [];
    const seen = new Set<string>();
    const addLocator = (locator: Record<string, string>): void => {
      const key = JSON.stringify(locator);
      if (seen.has(key)) return;
      seen.add(key);
      locators.push(locator);
    };
    const addCssLocator = (kind: string, value: string | undefined, selector: string | undefined): void => {
      if (!value || !selector || !isUnique(selector)) return;
      addLocator({ kind, value, selector });
    };

    addCssLocator(
      "test-id",
      testId,
      testId === undefined
        ? undefined
        : attrSelector(element, element.hasAttribute("data-testid") ? "data-testid" : "data-test-id", testId)
    );
    addCssLocator("id", id, id === undefined ? undefined : `#${cssEscape(id)}`);
    addCssLocator("aria-label", ariaLabel, ariaLabel === undefined ? undefined : attrSelector(element, "aria-label", ariaLabel));
    if (label) addLocator({ kind: "label", value: label });
    if (role && accessibleName) addLocator({ kind: "role", value: accessibleName, role });
    addCssLocator("name", name, name === undefined ? undefined : attrSelector(element, "name", name));
    addCssLocator(
      "placeholder",
      placeholder,
      placeholder === undefined ? undefined : attrSelector(element, "placeholder", placeholder)
    );
    addCssLocator("href", href, href === undefined ? undefined : attrSelector(element, "href", href));
    if (accessibleName && ["button", "a", "input", "select", "textarea"].includes(tagName)) {
      addLocator({ kind: "text", value: accessibleName });
    }
    const cssPath = cssPathFor(element);
    if (cssPath) addLocator({ kind: "css", value: cssPath, selector: cssPath });

    const input = element instanceof HTMLInputElement ? element : undefined;
    const textarea = element instanceof HTMLTextAreaElement ? element : undefined;
    const select = element instanceof HTMLSelectElement ? element : undefined;
    const contentEditable = element instanceof HTMLElement && element.isContentEditable;
    const value = input !== undefined
      ? (input.type === "password" ? "[redacted]" : input.type === "file" ? "[file-input]" : input.value)
      : textarea?.value ?? select?.value ?? (contentEditable ? textOf(element.textContent, 10_000) : undefined);
    const selector = locators.find((locator) => typeof locator.selector === "string")?.selector;

    return {
      ...(selector === undefined ? {} : { selector }),
      locators,
      tagName,
      ...(text === undefined ? {} : { text }),
      ...(value === undefined ? {} : { value }),
      ...(role === undefined ? {} : { role }),
      ...(name === undefined ? {} : { name }),
      ...(input === undefined ? {} : { inputType: input.type }),
      ...(id === undefined ? {} : { id }),
      ...(testId === undefined ? {} : { testId }),
      ...(ariaLabel === undefined ? {} : { ariaLabel }),
      ...(accessibleName === undefined ? {} : { accessibleName }),
      ...(label === undefined ? {} : { label }),
      ...(placeholder === undefined ? {} : { placeholder }),
      ...(title === undefined ? {} : { title }),
      ...(href === undefined ? {} : { href }),
      ...(input === undefined || !["checkbox", "radio"].includes(input.type) ? {} : { checked: input.checked }),
      ...(select === undefined ? {} : {
        selectedValues: Array.from(select.selectedOptions).map((option) => option.value)
      }),
      ...(contentEditable ? { contentEditable: true } : {}),
      disabled: element.matches(":disabled") || element.getAttribute("aria-disabled") === "true"
    };
  };
  const emit = (type: string, event: Event, extra: Record<string, unknown> = {}): void => {
    try {
      sequence += 1;
      const timeMs = Math.max(0, Date.now() - startedAt);
      const entry = {
        eventId: `${timeMs}-${sequence}`,
        sequence,
        type,
        timeMs,
        url: location.href,
        title: document.title,
        frame: {
          url: location.href,
          name: window.name || undefined,
          top: window === window.top
        },
        target: targetOf(event, type),
        ...extra
      };
      console.info(marker + JSON.stringify(entry));
    } catch (error) {
      console.info(marker + JSON.stringify({
        type: "recorder-error",
        timeMs: Math.max(0, Date.now() - startedAt),
        message: String(error)
      }));
    }
  };

  document.addEventListener("click", (event) => emit("click", event, {
    pointer: { x: event.clientX, y: event.clientY, button: event.button }
  }), true);
  document.addEventListener("input", (event) => emit("input", event), true);
  document.addEventListener("change", (event) => emit("change", event), true);
  document.addEventListener("keydown", (event) => emit("keydown", event, {
    key: event.key,
    code: event.code,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey
  }), true);
  document.addEventListener("submit", (event) => emit("submit", event), true);
  console.info(marker + JSON.stringify({
    type: "recorder-ready",
    timeMs: Math.max(0, Date.now() - startedAt),
    url: location.href,
    title: document.title,
    frame: {
      url: location.href,
      name: window.name || undefined,
      top: window === window.top
    }
  }));
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
