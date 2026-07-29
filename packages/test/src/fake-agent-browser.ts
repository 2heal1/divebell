import { readFile, rm, writeFile } from "node:fs/promises";
import vm from "node:vm";

const browserStatePath = process.env.DIVEBELL_TEST_BROWSER_STATE ?? "";
const commands = new Set<BrowserCommand>(["open", "goto", "eval", "close"]);

type BrowserCommand = "open" | "goto" | "eval" | "close";

interface BrowserElement {
  id: string;
  textContent: string;
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

  const context = createBrowserContext(url);
  if (initScriptPath !== undefined) {
    await runScript(context, await readFile(initScriptPath, "utf8"), initScriptPath);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load ${url}: HTTP ${response.status}.`);
  }
  const html = await response.text();
  for (const script of readInlineScripts(html)) {
    await runScript(context, script, url);
  }

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
  const context = createBrowserContext(state.url);
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

function createBrowserContext(url: string): TestBrowserContext {
  const elements = new Map<string, BrowserElement>();
  const context = vm.createContext({
    console: {
      log() {},
      info() {},
      warn() {},
      error() {}
    },
    fetch,
    URL,
    URLSearchParams,
    Headers,
    Request,
    Response,
    TextDecoder,
    TextEncoder,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    performance,
    navigator: {
      userAgent: "divebell-test-agent-browser"
    },
    location: new URL(url),
    document: {
      getElementById(id: string) {
        if (!elements.has(id)) {
          elements.set(id, { id, textContent: "" });
        }
        return elements.get(id);
      }
    },
    postMessage() {}
  }) as TestBrowserContext;
  context.globalThis = context;
  context.window = context;
  context.self = context;
  context.top = context;
  context.eval = (source) => vm.runInContext(String(source), context, {
    timeout: 5_000
  });
  return context;
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

function readInlineScripts(html: string): string[] {
  return [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .flatMap((match) => match[1] === undefined ? [] : [match[1]])
    .filter((source) => source.trim().length > 0);
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
