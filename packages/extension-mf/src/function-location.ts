import {
  SourceMap,
  type SourceMapPayload
} from "node:module";

import type {
  SharedFunctionLocation,
  SharedOriginalFunctionLocation
} from "./types.js";

const FUNCTION_LOCATOR_KEY = "__divebellFunctionLocator";
const LOCATION_TOKEN_SYMBOL = "divebell.mf.location-token";
const MAX_FUNCTIONS = 200;
const MAX_PAGE_TARGETS = 20;
const MAX_SOURCE_MAPS = 20;
const MAX_SOURCE_MAP_BYTES = 5 * 1024 * 1024;
const CDP_REQUEST_TIMEOUT_MS = 2500;

interface BrowserRawResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface BrowserWithRaw {
  raw?(
    args: string[],
    options?: { ui?: boolean }
  ): Promise<BrowserRawResult>;
}

interface FunctionEntry {
  descriptor: Record<string, unknown>;
  holder: Record<string, unknown>;
  key: "lib" | "get";
  locator: string[];
}

interface CdpMessage {
  id?: number;
  method?: string;
  params?: unknown;
  sessionId?: string;
  result?: unknown;
  error?: {
    message?: string;
  };
}

interface CdpTargetInfo {
  targetId: string;
  type: string;
}

interface CdpScript {
  scriptId: string;
  url: string;
  sourceMapURL?: string;
}

interface CdpFunctionLocation {
  scriptId: string;
  lineNumber: number;
  columnNumber: number;
}

interface SourceMapContext {
  client: CdpClient;
  sessionId: string;
  frameId?: string;
  cache: Map<string, Promise<SourceMap | undefined>>;
}

export async function enrichSharedFunctionLocations(
  value: unknown,
  browser: BrowserWithRaw,
  options: { verbose?: boolean } = {}
): Promise<void> {
  const entries = collectFunctionEntries(value);
  if (entries.length === 0) return;

  try {
    const pageToken = readPageToken(value);
    const cdpUrl = pageToken === undefined
      ? undefined
      : await readCdpUrl(browser);
    if (pageToken !== undefined && cdpUrl !== undefined) {
      const locations = await resolveFunctionLocations(
        cdpUrl,
        pageToken,
        entries.map((entry) => entry.locator),
        options.verbose === true
      );
      entries.forEach((entry, index) => {
        const location = locations[index];
        if (location !== undefined) {
          entry.descriptor.location = location;
        }
      });
    }
  } catch {
    // Function locations are best-effort diagnostics and must not break MF state.
  } finally {
    for (const entry of entries) {
      delete entry.descriptor[FUNCTION_LOCATOR_KEY];
      if (
        typeof entry.descriptor.source !== "string" &&
        entry.descriptor.location === undefined
      ) {
        delete entry.holder[entry.key];
      }
    }
  }
}

export function sourceMapOriginalLocation(
  sourceMapText: string,
  lineNumber: number,
  columnNumber: number
): SharedOriginalFunctionLocation | undefined {
  if (Buffer.byteLength(sourceMapText, "utf8") > MAX_SOURCE_MAP_BYTES) {
    return undefined;
  }

  try {
    const raw = JSON.parse(sourceMapText) as unknown;
    if (!isRecord(raw) || raw.version !== 3) return undefined;
    const sources = stringArray(raw.sources);
    const mappings = typeof raw.mappings === "string"
      ? raw.mappings
      : undefined;
    if (sources === undefined || mappings === undefined) return undefined;

    const payload: SourceMapPayload = {
      file: typeof raw.file === "string" ? raw.file : "",
      version: 3,
      sources,
      sourcesContent: stringArray(raw.sourcesContent) ?? [],
      names: stringArray(raw.names) ?? [],
      mappings,
      sourceRoot: typeof raw.sourceRoot === "string" ? raw.sourceRoot : ""
    };
    const mapping = new SourceMap(payload).findEntry(lineNumber, columnNumber);
    if (
      !("originalSource" in mapping) ||
      typeof mapping.originalSource !== "string" ||
      mapping.originalSource.length === 0 ||
      typeof mapping.originalLine !== "number" ||
      typeof mapping.originalColumn !== "number"
    ) {
      return undefined;
    }
    const source = safeSourceName(
      joinSourceRoot(payload.sourceRoot, mapping.originalSource)
    );
    if (source === undefined) return undefined;
    return {
      source,
      line: mapping.originalLine + 1,
      column: mapping.originalColumn + 1
    };
  } catch {
    return undefined;
  }
}

function collectFunctionEntries(value: unknown): FunctionEntry[] {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.globalShared)) {
    return [];
  }
  const entries: FunctionEntry[] = [];
  for (const packages of Object.values(value.globalShared)) {
    if (!isRecord(packages)) continue;
    for (const versions of Object.values(packages)) {
      if (!isRecord(versions)) continue;
      for (const shared of Object.values(versions)) {
        if (!isRecord(shared)) continue;
        for (const key of ["lib", "get"] as const) {
          const descriptor = shared[key];
          if (!isRecord(descriptor)) continue;
          const locator = stringArray(descriptor[FUNCTION_LOCATOR_KEY]);
          if (locator === undefined || locator.length !== 5) continue;
          entries.push({
            descriptor,
            holder: shared,
            key,
            locator
          });
          if (entries.length >= MAX_FUNCTIONS) return entries;
        }
      }
    }
  }
  return entries;
}

function readPageToken(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  return typeof value.pageToken === "string" && value.pageToken.length > 0
    ? value.pageToken
    : undefined;
}

async function readCdpUrl(
  browser: BrowserWithRaw
): Promise<string | undefined> {
  if (browser.raw === undefined) return undefined;
  const result = await browser.raw(["get", "cdp-url", "--json"]);
  if (result.exitCode !== 0 || result.stdout.trim().length === 0) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(result.stdout) as unknown;
    const direct = isRecord(parsed) ? parsed.cdpUrl : undefined;
    const nested = isRecord(parsed) && isRecord(parsed.data)
      ? parsed.data.cdpUrl
      : undefined;
    const value = typeof direct === "string"
      ? direct
      : typeof nested === "string"
        ? nested
        : undefined;
    return value !== undefined && /^wss?:\/\//i.test(value)
      ? value
      : undefined;
  } catch {
    const value = result.stdout.trim();
    return /^wss?:\/\//i.test(value) ? value : undefined;
  }
}

async function resolveFunctionLocations(
  cdpUrl: string,
  pageToken: string,
  locators: readonly string[][],
  verbose: boolean
): Promise<Array<SharedFunctionLocation | undefined>> {
  const client = await CdpClient.connect(cdpUrl);
  let sessionId: string | undefined;
  let removeScriptListener: (() => void) | undefined;
  try {
    sessionId = await findPageSession(client, pageToken);
    if (sessionId === undefined) return locators.map(() => undefined);

    const scripts = new Map<string, CdpScript>();
    removeScriptListener = client.onEvent((message) => {
      if (
        message.sessionId !== sessionId ||
        message.method !== "Debugger.scriptParsed" ||
        !isRecord(message.params)
      ) {
        return;
      }
      const scriptId = message.params.scriptId;
      const url = message.params.url;
      if (typeof scriptId !== "string" || typeof url !== "string") return;
      scripts.set(scriptId, {
        scriptId,
        url,
        ...(typeof message.params.sourceMapURL === "string"
          ? { sourceMapURL: message.params.sourceMapURL }
          : {})
      });
    });
    await client.send("Debugger.enable", {}, sessionId);
    removeScriptListener();
    removeScriptListener = undefined;

    const frameId = verbose
      ? await readMainFrameId(client, sessionId)
      : undefined;
    const sourceMaps: SourceMapContext = {
      client,
      sessionId,
      ...(frameId === undefined ? {} : { frameId }),
      cache: new Map()
    };
    const results = await Promise.all(
      locators.map((locator) =>
        resolveOneFunctionLocation(
          client,
          sessionId as string,
          locator,
          scripts,
          verbose,
          sourceMaps
        )
      )
    );
    return results;
  } finally {
    removeScriptListener?.();
    if (sessionId !== undefined) {
      await ignoreCdpError(
        client.send(
          "Runtime.releaseObjectGroup",
          { objectGroup: "divebell-mf-location" },
          sessionId
        )
      );
      await ignoreCdpError(
        client.send(
          "Runtime.evaluate",
          {
            expression:
              `delete globalThis[Symbol.for(${JSON.stringify(LOCATION_TOKEN_SYMBOL)})]`,
            returnByValue: true,
            silent: true
          },
          sessionId
        )
      );
      await ignoreCdpError(
        client.send("Target.detachFromTarget", { sessionId })
      );
    }
    client.close();
  }
}

async function findPageSession(
  client: CdpClient,
  pageToken: string
): Promise<string | undefined> {
  const targetsResult = await client.send("Target.getTargets");
  if (!isRecord(targetsResult) || !Array.isArray(targetsResult.targetInfos)) {
    return undefined;
  }
  const targets = targetsResult.targetInfos
    .map(parseTargetInfo)
    .filter((target): target is CdpTargetInfo => target?.type === "page")
    .slice(0, MAX_PAGE_TARGETS);

  for (const target of targets) {
    let candidateSessionId: string | undefined;
    try {
      const attached = await client.send(
        "Target.attachToTarget",
        { targetId: target.targetId, flatten: true }
      );
      candidateSessionId = isRecord(attached) &&
        typeof attached.sessionId === "string"
        ? attached.sessionId
        : undefined;
      if (candidateSessionId === undefined) continue;
      await client.send("Runtime.enable", {}, candidateSessionId);
      const evaluated = await client.send(
        "Runtime.evaluate",
        {
          expression:
            `globalThis[Symbol.for(${JSON.stringify(LOCATION_TOKEN_SYMBOL)})]`,
          returnByValue: true,
          silent: true
        },
        candidateSessionId
      );
      const remoteObject = isRecord(evaluated) && isRecord(evaluated.result)
        ? evaluated.result
        : undefined;
      if (remoteObject?.value === pageToken) {
        return candidateSessionId;
      }
    } catch {
      // Ignore inaccessible browser pages and continue to the marked page.
    }
    if (candidateSessionId !== undefined) {
      await ignoreCdpError(
        client.send(
          "Target.detachFromTarget",
          { sessionId: candidateSessionId }
        )
      );
    }
  }
  return undefined;
}

async function resolveOneFunctionLocation(
  client: CdpClient,
  sessionId: string,
  locator: readonly string[],
  scripts: ReadonlyMap<string, CdpScript>,
  verbose: boolean,
  sourceMaps: SourceMapContext
): Promise<SharedFunctionLocation | undefined> {
  try {
    const evaluated = await client.send(
      "Runtime.evaluate",
      {
        expression: createFunctionLookupExpression(locator),
        objectGroup: "divebell-mf-location",
        returnByValue: false,
        silent: true
      },
      sessionId
    );
    const remoteObject = isRecord(evaluated) && isRecord(evaluated.result)
      ? evaluated.result
      : undefined;
    if (
      remoteObject?.type !== "function" ||
      typeof remoteObject.objectId !== "string"
    ) {
      return undefined;
    }
    const properties = await client.send(
      "Runtime.getProperties",
      {
        objectId: remoteObject.objectId,
        ownProperties: true,
        accessorPropertiesOnly: false
      },
      sessionId
    );
    const functionLocation = readInternalFunctionLocation(properties);
    if (functionLocation === undefined) return undefined;
    const script = scripts.get(functionLocation.scriptId);
    const url = script === undefined
      ? undefined
      : safeGeneratedUrl(script.url);
    if (script === undefined || url === undefined) return undefined;

    const baseLocation: SharedFunctionLocation = verbose
      ? {
          url,
          line: functionLocation.lineNumber + 1,
          column: functionLocation.columnNumber + 1
        }
      : { url };
    if (!verbose || script.sourceMapURL === undefined) {
      return baseLocation;
    }
    const sourceMap = await readSourceMap(script, sourceMaps);
    if (sourceMap === undefined) return baseLocation;
    const mapping = sourceMap.findEntry(
      functionLocation.lineNumber,
      functionLocation.columnNumber
    );
    if (
      !("originalSource" in mapping) ||
      typeof mapping.originalSource !== "string" ||
      mapping.originalSource.length === 0 ||
      typeof mapping.originalLine !== "number" ||
      typeof mapping.originalColumn !== "number"
    ) {
      return baseLocation;
    }
    const source = safeSourceName(
      joinSourceRoot(
        sourceMap.payload.sourceRoot,
        mapping.originalSource
      )
    );
    return source === undefined
      ? baseLocation
      : {
          ...baseLocation,
          original: {
            source,
            line: mapping.originalLine + 1,
            column: mapping.originalColumn + 1
          }
        };
  } catch {
    return undefined;
  }
}

function createFunctionLookupExpression(locator: readonly string[]): string {
  return [
    "((path) => {",
    "  let value = globalThis.__FEDERATION__?.__SHARE__;",
    "  for (const key of path) {",
    "    if (value == null) return undefined;",
    "    value = value[key];",
    "  }",
    "  return value;",
    `})(${JSON.stringify(locator)})`
  ].join("\n");
}

function readInternalFunctionLocation(
  value: unknown
): CdpFunctionLocation | undefined {
  if (!isRecord(value) || !Array.isArray(value.internalProperties)) {
    return undefined;
  }
  const property = value.internalProperties.find(
    (item) => isRecord(item) && item.name === "[[FunctionLocation]]"
  );
  if (
    !isRecord(property) ||
    !isRecord(property.value) ||
    !isRecord(property.value.value)
  ) {
    return undefined;
  }
  const location = property.value.value;
  return typeof location.scriptId === "string" &&
    isFiniteNumber(location.lineNumber) &&
    isFiniteNumber(location.columnNumber)
    ? {
        scriptId: location.scriptId,
        lineNumber: location.lineNumber,
        columnNumber: location.columnNumber
      }
    : undefined;
}

async function readMainFrameId(
  client: CdpClient,
  sessionId: string
): Promise<string | undefined> {
  try {
    await client.send("Page.enable", {}, sessionId);
    const result = await client.send("Page.getFrameTree", {}, sessionId);
    return isRecord(result) &&
      isRecord(result.frameTree) &&
      isRecord(result.frameTree.frame) &&
      typeof result.frameTree.frame.id === "string"
      ? result.frameTree.frame.id
      : undefined;
  } catch {
    return undefined;
  }
}

async function readSourceMap(
  script: CdpScript,
  context: SourceMapContext
): Promise<SourceMap | undefined> {
  const sourceMapUrl = resolveSourceMapUrl(script);
  if (sourceMapUrl === undefined) return undefined;
  const existing = context.cache.get(sourceMapUrl);
  if (existing !== undefined) return await existing;
  if (context.cache.size >= MAX_SOURCE_MAPS) return undefined;
  const pending = loadSourceMap(sourceMapUrl, context);
  context.cache.set(sourceMapUrl, pending);
  return await pending;
}

async function loadSourceMap(
  url: string,
  context: SourceMapContext
): Promise<SourceMap | undefined> {
  const source = url.startsWith("data:")
    ? decodeDataUrl(url)
    : context.frameId === undefined
      ? undefined
      : await loadNetworkText(url, context);
  if (source === undefined) return undefined;
  try {
    const raw = JSON.parse(source) as unknown;
    if (!isRecord(raw) || raw.version !== 3) return undefined;
    const sources = stringArray(raw.sources);
    const mappings = typeof raw.mappings === "string"
      ? raw.mappings
      : undefined;
    if (sources === undefined || mappings === undefined) return undefined;
    return new SourceMap({
      file: typeof raw.file === "string" ? raw.file : "",
      version: 3,
      sources,
      sourcesContent: stringArray(raw.sourcesContent) ?? [],
      names: stringArray(raw.names) ?? [],
      mappings,
      sourceRoot: typeof raw.sourceRoot === "string" ? raw.sourceRoot : ""
    });
  } catch {
    return undefined;
  }
}

async function loadNetworkText(
  url: string,
  context: SourceMapContext
): Promise<string | undefined> {
  let handle: string | undefined;
  try {
    const result = await context.client.send(
      "Network.loadNetworkResource",
      {
        frameId: context.frameId,
        url,
        options: {
          disableCache: false,
          includeCredentials: true
        }
      },
      context.sessionId,
      5000
    );
    const resource = isRecord(result) && isRecord(result.resource)
      ? result.resource
      : undefined;
    if (
      resource?.success !== true ||
      typeof resource.stream !== "string"
    ) {
      return undefined;
    }
    handle = resource.stream;
    const chunks: Buffer[] = [];
    let byteLength = 0;
    let eof = false;
    while (!eof) {
      const read = await context.client.send(
        "IO.read",
        { handle, size: 64 * 1024 },
        context.sessionId,
        5000
      );
      if (!isRecord(read) || typeof read.data !== "string") return undefined;
      const chunk = Buffer.from(
        read.data,
        read.base64Encoded === true ? "base64" : "utf8"
      );
      byteLength += chunk.byteLength;
      if (byteLength > MAX_SOURCE_MAP_BYTES) return undefined;
      chunks.push(chunk);
      eof = read.eof === true;
    }
    return Buffer.concat(chunks).toString("utf8");
  } catch {
    return undefined;
  } finally {
    if (handle !== undefined) {
      await ignoreCdpError(
        context.client.send(
          "IO.close",
          { handle },
          context.sessionId
        )
      );
    }
  }
}

function resolveSourceMapUrl(script: CdpScript): string | undefined {
  const sourceMapURL = script.sourceMapURL;
  if (sourceMapURL === undefined || sourceMapURL.length === 0) return undefined;
  if (sourceMapURL.startsWith("data:")) {
    return Buffer.byteLength(sourceMapURL, "utf8") <=
      Math.ceil(MAX_SOURCE_MAP_BYTES * 1.5)
      ? sourceMapURL
      : undefined;
  }
  try {
    const url = new URL(sourceMapURL, script.url);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function decodeDataUrl(value: string): string | undefined {
  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) return undefined;
  try {
    const metadata = value.slice(5, commaIndex);
    const payload = value.slice(commaIndex + 1);
    const buffer = Buffer.from(
      metadata.split(";").includes("base64")
        ? payload
        : decodeURIComponent(payload),
      metadata.split(";").includes("base64") ? "base64" : "utf8"
    );
    return buffer.byteLength <= MAX_SOURCE_MAP_BYTES
      ? buffer.toString("utf8")
      : undefined;
  } catch {
    return undefined;
  }
}

function safeGeneratedUrl(value: string): string | undefined {
  if (value.length === 0 || value.length > 4096) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === "data:" || url.protocol === "blob:") return undefined;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().slice(0, 2048);
  } catch {
    return undefined;
  }
}

function safeSourceName(value: string): string | undefined {
  if (
    value.length === 0 ||
    value.length > 4096 ||
    value.startsWith("data:") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return undefined;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    try {
      const url = new URL(value);
      url.username = "";
      url.password = "";
      url.search = "";
      url.hash = "";
      return url.toString().slice(0, 2048);
    } catch {
      // Webpack-style source names are not required to be standard URLs.
    }
  }
  const queryIndex = value.indexOf("?");
  const hashIndex = value.indexOf("#");
  const end = [queryIndex, hashIndex]
    .filter((index) => index >= 0)
    .reduce((smallest, index) => Math.min(smallest, index), value.length);
  return value.slice(0, end).slice(0, 2048);
}

function joinSourceRoot(sourceRoot: string, source: string): string {
  if (sourceRoot.length === 0 || /^[a-z][a-z\d+.-]*:/i.test(source)) {
    return source;
  }
  const slash = sourceRoot.endsWith("/") || source.startsWith("/") ? "" : "/";
  return `${sourceRoot}${slash}${source}`;
}

function parseTargetInfo(value: unknown): CdpTargetInfo | undefined {
  if (
    !isRecord(value) ||
    typeof value.targetId !== "string" ||
    typeof value.type !== "string"
  ) {
    return undefined;
  }
  return {
    targetId: value.targetId,
    type: value.type
  };
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function ignoreCdpError(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch {
    // Cleanup is best effort.
  }
}

class CdpClient {
  readonly #socket: WebSocket;
  #nextId = 0;
  readonly #pending = new Map<
    number,
    {
      resolve(value: unknown): void;
      reject(error: Error): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  readonly #listeners = new Set<(message: CdpMessage) => void>();

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.addEventListener("message", (event) => {
      this.handleMessage(event.data);
    });
    socket.addEventListener("close", () => {
      this.rejectPending(new Error("The browser debugging connection closed."));
    });
    socket.addEventListener("error", () => {
      this.rejectPending(new Error("The browser debugging connection failed."));
    });
  }

  static async connect(url: string): Promise<CdpClient> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Timed out connecting to the browser debugger."));
      }, CDP_REQUEST_TIMEOUT_MS);
      const finish = (action: () => void) => {
        clearTimeout(timer);
        action();
      };
      socket.addEventListener(
        "open",
        () => finish(resolve),
        { once: true }
      );
      socket.addEventListener(
        "error",
        () => finish(() => reject(
          new Error("Could not connect to the browser debugger.")
        )),
        { once: true }
      );
    });
    return new CdpClient(socket);
  }

  onEvent(listener: (message: CdpMessage) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async send(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
    timeoutMs = CDP_REQUEST_TIMEOUT_MS
  ): Promise<unknown> {
    const id = ++this.#nextId;
    const response = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}.`));
      }, timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
    });
    this.#socket.send(JSON.stringify({
      id,
      method,
      params,
      ...(sessionId === undefined ? {} : { sessionId })
    }));
    return await response;
  }

  close(): void {
    this.#socket.close();
  }

  private handleMessage(data: string | ArrayBuffer | Blob): void {
    if (typeof data !== "string") return;
    let message: CdpMessage;
    try {
      message = JSON.parse(data) as CdpMessage;
    } catch {
      return;
    }
    if (message.id !== undefined) {
      const pending = this.#pending.get(message.id);
      if (pending === undefined) return;
      this.#pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error !== undefined) {
        pending.reject(
          new Error(message.error.message ?? "Browser debugger request failed.")
        );
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    for (const listener of this.#listeners) listener(message);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }
}
