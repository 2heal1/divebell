import { readFile, rm, writeFile } from "node:fs/promises";
import vm from "node:vm";

const browserStatePath = process.env.DIVEBELL_TEST_BROWSER_STATE ?? "";
const commands = new Set<BrowserCommand>(["open", "goto", "eval", "close"]);

type BrowserCommand = "open" | "goto" | "eval" | "close";

interface BrowserElement {
  id: string;
  textContent: string;
}

interface BrowserScriptEvent {
  type: "error" | "load";
  target: BrowserScriptElement;
}

interface BrowserScriptElement {
  parentNode: BrowserParentNode | null;
  timeout: number;
  onerror: ((event: BrowserScriptEvent) => unknown) | null;
  onload: ((event: BrowserScriptEvent) => unknown) | null;
  src: string;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
}

interface BrowserParentNode {
  appendChild(element: BrowserScriptElement): BrowserScriptElement;
  removeChild(element: BrowserScriptElement): BrowserScriptElement;
}

class TestHtmlScriptElement implements BrowserScriptElement {
  readonly #attributes = new Map<string, string>();
  readonly #pageUrl: string;
  #sourceUrl = "";
  parentNode: BrowserParentNode | null = null;
  timeout = 0;
  onerror: ((event: BrowserScriptEvent) => unknown) | null = null;
  onload: ((event: BrowserScriptEvent) => unknown) | null = null;

  constructor(pageUrl: string) {
    this.#pageUrl = pageUrl;
  }

  get src(): string {
    return this.#sourceUrl;
  }

  set src(value: string) {
    this.#sourceUrl = new URL(value, this.#pageUrl).href;
    this.#attributes.set("src", this.#sourceUrl);
  }

  getAttribute(name: string): string | null {
    return this.#attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.#attributes.set(name, value);
    if (name === "src") this.#sourceUrl = new URL(value, this.#pageUrl).href;
  }
}

interface ObservabilityReader {
  getRuntimeState(): unknown;
  getReports(options?: { limit?: number }): unknown[];
}

interface FederationGlobal {
  __SHARE__?: Record<string, unknown>;
  __OBSERVABILITY__?: Record<string, ObservabilityReader>;
}

interface TestBrowserContext extends vm.Context {
  __DIVEBELL_MF_E2E_ERROR__?: unknown;
  __MF_OBSERVABILITY_INJECTION__?: unknown;
  __DIVEBELL_MF_PROXY_INJECTION__?: unknown;
  __DIVEBELL_MF_E2E_RENDERED__?: unknown;
  __FEDERATION__?: FederationGlobal;
  globalThis: TestBrowserContext;
  window: TestBrowserContext;
  self: TestBrowserContext;
  top: TestBrowserContext;
  eval(source: unknown): unknown;
}

interface TestBrowserHarness {
  context: TestBrowserContext;
  loadScript(sourceUrl: string): Promise<void>;
}

interface BrowserState {
  url: string;
  selectedScope?: string;
  marker?: unknown;
  proxyMarker?: unknown;
  runtimeState: unknown;
  reports: unknown[];
  share: Record<string, unknown>;
  rendered: unknown;
}

try {
  if (browserStatePath.length === 0) {
    throw new Error("DIVEBELL_TEST_BROWSER_STATE is required.");
  }
  await run(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

async function run(argv: string[]): Promise<void> {
  const commandIndex = argv.findIndex(isBrowserCommand);
  const command = commandIndex < 0 ? undefined : argv[commandIndex];
  if (!isBrowserCommand(command)) {
    throw new Error(`Unsupported test agent-browser command: ${argv.join(" ")}`);
  }
  const args = argv.slice(commandIndex);

  if (command === "open" || command === "goto") {
    await open(args);
    return;
  }

  if (command === "eval") {
    await evaluate(args);
    return;
  }

  if (command === "close") {
    await rm(browserStatePath, { force: true });
  }
}

async function open(args: string[]): Promise<void> {
  const { url, initScriptPath } = parseOpenArgs(args);
  if (url === undefined) {
    throw new Error("The test agent-browser open command requires a URL.");
  }

  const browser = createBrowserContext(url);
  const { context } = browser;
  if (initScriptPath !== undefined) {
    await runScript(context, await readFile(initScriptPath, "utf8"), initScriptPath);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load ${url}: HTTP ${response.status}.`);
  }
  const html = await response.text();
  for (const script of readHtmlScripts(html)) {
    if (script.src === undefined) {
      await runScript(context, script.source, url);
    } else {
      await browser.loadScript(new URL(script.src, url).href);
    }
  }

  await waitForMfFixture(context);
  const state = readSerializableBrowserState(context);
  await writeFile(browserStatePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function evaluate(args: string[]): Promise<void> {
  const script = args[1];
  if (script === undefined) {
    throw new Error("The test agent-browser eval command requires a script.");
  }
  const parsedState = JSON.parse(
    await readFile(browserStatePath, "utf8")
  ) as unknown;
  if (!isBrowserState(parsedState)) {
    throw new Error("The test agent-browser state file is invalid.");
  }
  const state = parsedState;
  const { context } = createBrowserContext(state.url);
  context.__MF_OBSERVABILITY_INJECTION__ = state.marker;
  context.__DIVEBELL_MF_PROXY_INJECTION__ = state.proxyMarker;
  context.__FEDERATION__ = {
    ...(context.__FEDERATION__ ?? {}),
    __SHARE__: state.share ?? {},
    __OBSERVABILITY__: {
      [state.selectedScope ?? "divebell_e2e_host"]: {
        getRuntimeState() {
          return cloneJson(state.runtimeState);
        },
        getReports(options = {}) {
          const reports = cloneJson(state.reports ?? []);
          return typeof options.limit === "number"
            ? reports.slice(-options.limit)
            : reports;
        }
      }
    }
  };

  const result = await runScript(context, script, "eval");
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function parseOpenArgs(args: string[]): {
  url: string | undefined;
  initScriptPath: string | undefined;
} {
  let url: string | undefined;
  let initScriptPath: string | undefined;
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--init-script") {
      initScriptPath = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--headers") {
      index += 1;
      continue;
    }
    if (arg !== undefined && !arg.startsWith("--") && url === undefined) {
      url = arg;
    }
  }
  return { url, initScriptPath };
}

function createBrowserContext(url: string): TestBrowserHarness {
  const elements = new Map<string, BrowserElement>();
  const eventListeners = new Map<string, Set<(event: unknown) => void>>();
  const scripts: BrowserScriptElement[] = [];
  let context: TestBrowserContext;
  const pageFetch = (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    if (typeof input === "string" || input instanceof URL) {
      return fetch(new URL(String(input), url), init);
    }
    return fetch(input, init);
  };
  const loadScript = async (
    sourceUrl: string,
    element?: BrowserScriptElement
  ): Promise<void> => {
    const resolvedUrl = new URL(sourceUrl, url).href;
    const response = await pageFetch(resolvedUrl);
    if (!response.ok) {
      throw new Error(`Could not load ${resolvedUrl}: HTTP ${response.status}.`);
    }
    await runScript(context, await response.text(), resolvedUrl);
    element?.onload?.({ type: "load", target: element });
  };
  const head: BrowserParentNode = {
    appendChild(element) {
      element.parentNode = head;
      if (!scripts.includes(element)) scripts.push(element);
      void loadScript(element.src, element).catch((error: unknown) => {
        if (element.onerror !== null) {
          element.onerror({ type: "error", target: element });
          return;
        }
        context.__DIVEBELL_MF_E2E_ERROR__ =
          error instanceof Error ? error.message : String(error);
      });
      return element;
    },
    removeChild(element) {
      const index = scripts.indexOf(element);
      if (index >= 0) scripts.splice(index, 1);
      element.parentNode = null;
      return element;
    }
  };
  const document = {
    defaultView: undefined as TestBrowserContext | undefined,
    head,
    body: head,
    createElement(tagName: string) {
      if (tagName.toLowerCase() !== "script") {
        return createScriptElement(url);
      }
      return createScriptElement(url);
    },
    getElementsByTagName(tagName: string) {
      return tagName.toLowerCase() === "script" ? scripts : [];
    },
    querySelector(selector: string) {
      const match = selector.match(/^script\[src="([^"]+)"\]$/);
      if (match?.[1] === undefined) return null;
      const expected = new URL(match[1], url).href;
      return scripts.find((script) => script.src === expected) ?? null;
    },
    getElementById(id: string) {
      if (!elements.has(id)) {
        elements.set(id, { id, textContent: "" });
      }
      return elements.get(id);
    }
  };
  context = vm.createContext({
    console: {
      log() {},
      info() {},
      warn() {},
      error() {}
    },
    fetch: pageFetch,
    URL,
    URLSearchParams,
    Headers,
    Request,
    Response,
    TextDecoder,
    TextEncoder,
    HTMLScriptElement: TestHtmlScriptElement,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    performance,
    addEventListener(type: string, listener: (event: unknown) => void) {
      const listeners = eventListeners.get(type) ?? new Set();
      listeners.add(listener);
      eventListeners.set(type, listeners);
    },
    removeEventListener(type: string, listener: (event: unknown) => void) {
      eventListeners.get(type)?.delete(listener);
    },
    dispatchEvent(event: { type?: unknown }) {
      if (typeof event.type !== "string") return false;
      for (const listener of eventListeners.get(event.type) ?? []) {
        listener(event);
      }
      return true;
    },
    navigator: {
      userAgent: "divebell-test-agent-browser"
    },
    location: new URL(url),
    document,
    postMessage() {}
  }) as TestBrowserContext;
  document.defaultView = context;
  context.globalThis = context;
  context.window = context;
  context.self = context;
  context.top = context;
  context.eval = (source) => vm.runInContext(String(source), context, {
    timeout: 5_000
  });
  return {
    context,
    async loadScript(sourceUrl) {
      const script = createScriptElement(url);
      script.src = sourceUrl;
      scripts.push(script);
      await loadScript(sourceUrl, script);
    }
  };
}

async function runScript(
  context: TestBrowserContext,
  source: string,
  label: string
): Promise<unknown> {
  try {
    const result = vm.runInContext(source, context, {
      filename: label,
      timeout: 5_000
    });
    return isThenable(result) ? await result : result;
  } catch (error) {
    throw new Error(`Test agent-browser failed while running ${label}: ${
      error instanceof Error ? error.message : String(error)
    }`);
  }
}

function createScriptElement(pageUrl: string): BrowserScriptElement {
  return new TestHtmlScriptElement(pageUrl);
}

function readHtmlScripts(html: string): Array<{
  source: string;
  src?: string;
}> {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .map((match) => {
      const attributes = match[1] ?? "";
      const source = match[2] ?? "";
      const src = attributes.match(/\bsrc=(["'])(.*?)\1/i)?.[2];
      return src === undefined ? { source } : { source, src };
    })
    .filter((script) => script.src !== undefined || script.source.trim().length > 0);
}

async function waitForMfFixture(context: TestBrowserContext): Promise<void> {
  const timeoutAt = Date.now() + 10_000;
  while (Date.now() < timeoutAt) {
    if (typeof context.__DIVEBELL_MF_E2E_ERROR__ === "string") {
      throw new Error(`The MF fixture failed: ${context.__DIVEBELL_MF_E2E_ERROR__}`);
    }
    if (context.__DIVEBELL_MF_E2E_RENDERED__ === "provider widget rendered") {
      return;
    }
    await new Promise<void>((resolvePromise) => {
      setTimeout(resolvePromise, 10);
    });
  }
  throw new Error("The MF fixture did not render the provider module within 10000ms.");
}

function readSerializableBrowserState(context: TestBrowserContext): BrowserState {
  const value = vm.runInContext(`(() => {
    const readers = globalThis.__FEDERATION__?.__OBSERVABILITY__ ?? {};
    const scopes = Object.keys(readers);
    const selectedScope = scopes.find((scope) => scope !== "chrome_extension") ?? scopes[0];
    const reader = selectedScope === undefined ? undefined : readers[selectedScope];
    return {
      url: globalThis.location.href,
      selectedScope,
      marker: globalThis.__MF_OBSERVABILITY_INJECTION__,
      proxyMarker: globalThis.__DIVEBELL_MF_PROXY_INJECTION__,
      runtimeState: reader?.getRuntimeState?.(),
      reports: reader?.getReports?.({ limit: 200 }) ?? [],
      share: globalThis.__FEDERATION__?.__SHARE__ ?? {},
      rendered: globalThis.__DIVEBELL_MF_E2E_RENDERED__
    };
  })()`, context, {
    timeout: 5_000
  });

  if (!isBrowserState(value)) {
    throw new Error("The opened test page did not expose an MF observability reader.");
  }
  if (value.rendered !== "provider widget rendered") {
    throw new Error("The host page did not render the provider module.");
  }
  return cloneJson(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    "then" in value &&
    typeof value.then === "function";
}

function isBrowserCommand(value: string | undefined): value is BrowserCommand {
  return value !== undefined && commands.has(value as BrowserCommand);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBrowserState(value: unknown): value is BrowserState {
  return isRecord(value)
    && typeof value.url === "string"
    && value.runtimeState !== undefined
    && Array.isArray(value.reports)
    && isRecord(value.share)
    && "rendered" in value;
}
