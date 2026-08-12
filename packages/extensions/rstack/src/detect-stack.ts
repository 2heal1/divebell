import type {
  DivebellExtensionApi,
  DivebellStackDetection
} from "@divebell/cli";

const FETCH_TIMEOUT_MS = 1_200;

export type RstackEntryKind = "index" | "main" | "runtime";

export type RstackRuntimeMode = "webpack-compatible" | "rspack" | "unknown";

interface RstackRuntimeGlobalDetailBase {
  expression: string;
}

export type RstackRuntimeGlobalDetail =
  | (RstackRuntimeGlobalDetailBase & {
      kind: "value";
      value: string | number | boolean | null;
    })
  | (RstackRuntimeGlobalDetailBase & {
      kind: "function";
      value: string;
    })
  | (RstackRuntimeGlobalDetailBase & { kind: "function" })
  | (RstackRuntimeGlobalDetailBase & { kind: "dynamic" });

interface RstackRuntimeDetailsBase {
  globals: Record<string, RstackRuntimeGlobalDetail>;
}

export type RstackRuntimeDetails =
  | (RstackRuntimeDetailsBase & {
      mode: Exclude<RstackRuntimeMode, "unknown">;
      requireExpression: string;
    })
  | (RstackRuntimeDetailsBase & { mode: "unknown" });

export interface RstackFetchDetectionResult {
  schemaVersion: 1;
  status: "found" | "not-found" | "unavailable";
  checked: string[];
  failureCount: number;
  matched?: string;
  runtime?: RstackRuntimeDetails;
}

export interface RspackConfigSnapshot {
  experiments?: {
    rspackFuture?: {
      bundlerInfo?: RspackBundlerInfoSnapshot;
    };
  };
  output?: {
    publicPath?: string;
    bundlerInfo?: RspackBundlerInfoSnapshot;
  };
}

export interface RspackBundlerInfoSnapshot {
  bundler?: string;
  version?: string;
}

export type RstackStatusResult =
  | {
      schemaVersion: 1;
      status: "found";
      script: string;
      rspackConfig: RspackConfigSnapshot;
    }
  | {
      schemaVersion: 1;
      status: "not-found" | "unavailable";
      diagnostics: {
        checkedScripts: string[];
        failureCount: number;
      };
    };

export function classifyRstackEntryFilename(
  fileName: string
): RstackEntryKind | undefined {
  const normalized = fileName.toLowerCase();
  if (normalized.startsWith("index")) return "index";
  if (normalized.includes("main")) return "main";
  if (normalized.startsWith("runtime")) return "runtime";
  return undefined;
}

export function extractRspackRuntimeDetails(
  source: string
): RstackRuntimeDetails {
  const definitions = [
    ["publicPath", "p"],
    ["runtimeId", "j"],
    ["rspackVersion", "rv"],
    ["rspackUniqueId", "ruid"],
    ["getChunkScriptFilename", "u"],
    ["getChunkCssFilename", "k"],
    ["getChunkUpdateScriptFilename", "hu"],
    ["getChunkUpdateCssFilename", "hk"],
    ["getUpdateManifestFilename", "hmrF"],
    ["baseURI", "b"]
  ];
  const bases = [
    { expression: "__rspack_context", mode: "rspack" },
    { expression: "__webpack_require__", mode: "webpack-compatible" }
  ];
  const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const literal = (input: string): string | number | boolean | null | undefined => {
    const normalized = input.trimStart();
    const wrapped = /^\(\s*("(?:\\.|[^"\\])*")\s*\)/u.exec(normalized);
    const quoted = wrapped?.[1]
      ?? /^("(?:\\.|[^"\\])*")/u.exec(normalized)?.[1];
    if (quoted !== undefined) {
      try {
        return JSON.parse(quoted) as string;
      } catch {
        return undefined;
      }
    }
    const primitive = /^(null|true|false|-?(?:0|[1-9]\d*)(?:\.\d+)?)/u.exec(normalized)?.[1];
    if (primitive === "null") return null;
    if (primitive === "true") return true;
    if (primitive === "false") return false;
    if (primitive !== undefined) return Number(primitive);
    return undefined;
  };
  const staticStringReturn = (input: string): string | undefined => {
    const stringLiteral = '("(?:\\\\.|[^"\\\\])*")';
    const patterns = [
      new RegExp(`^\\s*function\\s*\\([^)]*\\)\\s*\\{\\s*return\\s+${stringLiteral}\\s*;?\\s*\\}`, "u"),
      new RegExp(`^\\s*(?:\\([^)]*\\)|[$\\w]+)\\s*=>\\s*\\{\\s*return\\s+${stringLiteral}\\s*;?\\s*\\}`, "u"),
      new RegExp(`^\\s*(?:\\([^)]*\\)|[$\\w]+)\\s*=>\\s*\\(\\s*${stringLiteral}\\s*\\)\\s*(?:;|,)`, "u"),
      new RegExp(`^\\s*(?:\\([^)]*\\)|[$\\w]+)\\s*=>\\s*${stringLiteral}\\s*(?:;|,)`, "u")
    ];
    for (const pattern of patterns) {
      const returned = pattern.exec(input)?.[1];
      if (returned !== undefined) {
        try {
          return JSON.parse(returned) as string;
        } catch {}
      }
    }
    return undefined;
  };
  const detailAt = (
    base: string,
    property: string,
    allowStaticReturn: boolean
  ): RstackRuntimeGlobalDetail | undefined => {
    const expression = `${base}.${property}`;
    const assignment = new RegExp(`${escapeRegExp(expression)}\\s*=\\s*`, "u").exec(source);
    if (assignment?.index === undefined) return undefined;
    const tail = source.slice(assignment.index + assignment[0].length, assignment.index + assignment[0].length + 800);
    const directValue = literal(tail);
    if (directValue !== undefined || /^\s*null\b/u.test(tail)) {
      return { expression, kind: "value", value: directValue ?? null };
    }
    const isFunction = /^\s*(?:function\b|(?:\([^)]*\)|[$\w]+)\s*=>)/u.test(tail);
    if (isFunction) {
      if (allowStaticReturn) {
        const returned = staticStringReturn(tail.slice(0, 400));
        if (returned !== undefined) {
          return { expression, kind: "function", value: returned };
        }
      }
      return { expression, kind: "function" };
    }
    return { expression, kind: "dynamic" };
  };

  for (const base of bases) {
    const globals: Record<string, RstackRuntimeGlobalDetail> = {};
    const staticReturnNames = new Set([
      "rspackVersion"
    ]);
    for (const [name, property] of definitions) {
      if (name === undefined || property === undefined) continue;
      const detail = detailAt(
        base.expression,
        property,
        staticReturnNames.has(name)
      );
      if (detail !== undefined) globals[name] = detail;
    }
    if (Object.keys(globals).length > 0) {
      return {
        mode: base.mode as Exclude<RstackRuntimeMode, "unknown">,
        requireExpression: base.expression,
        globals
      };
    }
  }
  return { mode: "unknown", globals: {} };
}

function staticStringValue(
  detail: RstackRuntimeGlobalDetail
): string | undefined {
  return "value" in detail && typeof detail.value === "string"
    ? detail.value
    : undefined;
}

export function runtimeDetailsToRspackConfig(
  runtime: RstackRuntimeDetails
): RspackConfigSnapshot {
  const config: RspackConfigSnapshot = {};
  const output: NonNullable<RspackConfigSnapshot["output"]> = {};
  const publicPath = runtime.globals.publicPath;
  if (publicPath !== undefined) {
    const value = staticStringValue(publicPath);
    if (value !== undefined) output.publicPath = value;
  }

  const bundlerInfo: RspackBundlerInfoSnapshot = {};
  const version = runtime.globals.rspackVersion;
  if (version !== undefined) {
    const value = staticStringValue(version);
    if (value !== undefined) bundlerInfo.version = value;
  }
  const uniqueId = runtime.globals.rspackUniqueId;
  if (uniqueId !== undefined) {
    const value = staticStringValue(uniqueId);
    const match = value === undefined
      ? undefined
      : /^bundler=(.+)@([^@]+)$/u.exec(value);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      bundlerInfo.bundler = match[1];
      bundlerInfo.version ??= match[2];
    }
  }
  const versionMajor = bundlerInfo.version === undefined
    ? undefined
    : /^(\d+)\./u.exec(bundlerInfo.version)?.[1];
  if (versionMajor === "1") {
    config.experiments = {
      rspackFuture: { bundlerInfo }
    };
  } else if (versionMajor !== undefined && Number(versionMajor) >= 2) {
    output.bundlerInfo = bundlerInfo;
  }
  if (Object.keys(output).length > 0) config.output = output;
  return config;
}

export function createRstackFetchDetectionScript(
  includeRuntime = false
): string {
  return `(async () => {
    try {
      const classifyFilename = ${classifyRstackEntryFilename.toString()};
      const extractRuntimeDetails = ${extractRspackRuntimeDetails.toString()};
      const selected = new Map();
      const addCandidate = (rawUrl) => {
        if (typeof rawUrl !== "string" || rawUrl.length === 0) return;
        try {
          const url = new URL(rawUrl, globalThis.location.href);
          if (url.protocol !== "http:" && url.protocol !== "https:") return;
          const name = (url.pathname.split("/").pop() || "").slice(0, 200);
          const kind = classifyFilename(name);
          if (kind === undefined || selected.has(url.href)) return;
          selected.set(url.href, { kind, name, url: url.href });
        } catch {}
      };

      for (const script of Array.from(document.scripts || [])) {
        addCandidate(script.src);
      }
      try {
        for (const entry of performance.getEntriesByType("resource")) {
          if (entry.initiatorType === "script") addCandidate(entry.name);
        }
      } catch {}

      const checked = [];
      let failureCount = 0;
      const candidates = Array.from(selected.values());
      for (const candidate of candidates) {
        checked.push(candidate.name);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), ${FETCH_TIMEOUT_MS});
        try {
          const response = await fetch(candidate.url, {
            cache: "force-cache",
            credentials: "same-origin",
            signal: controller.signal
          });
          if (!response.ok) {
            failureCount += 1;
            continue;
          }
          const source = await response.text();
          if (source.includes("data-rspack")) {
            return {
              schemaVersion: 1,
              status: "found",
              checked,
              failureCount,
              matched: candidate.name,
              ...(${includeRuntime} ? {
                runtime: extractRuntimeDetails(source)
              } : {})
            };
          }
        } catch {
          failureCount += 1;
        } finally {
          clearTimeout(timeout);
        }
      }
      return {
        schemaVersion: 1,
        status: candidates.length > 0 && failureCount === candidates.length
          ? "unavailable"
          : "not-found",
        checked,
        failureCount
      };
    } catch {
      return {
        schemaVersion: 1,
        status: "unavailable",
        checked: [],
        failureCount: 0
      };
    }
  })()`;
}

async function inspectRstackRuntimeSource(
  divebell: DivebellExtensionApi,
  includeRuntime = false
): Promise<RstackFetchDetectionResult> {
  try {
    return await divebell.browser.eval<RstackFetchDetectionResult>(
      createRstackFetchDetectionScript(includeRuntime)
    );
  } catch {
    return {
      schemaVersion: 1,
      status: "unavailable",
      checked: [],
      failureCount: 0
    };
  }
}

function safeScriptName(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/gu, "?").slice(0, 200)
    : "entry script";
}

export async function getRstackStatus(
  divebell: DivebellExtensionApi
): Promise<RstackStatusResult> {
  const result = await inspectRstackRuntimeSource(divebell, true);
  const found = result.schemaVersion === 1 && result.status === "found";
  if (found) {
    const runtime = result.runtime ?? { mode: "unknown", globals: {} };
    return {
      schemaVersion: 1,
      status: "found",
      script: safeScriptName(result.matched),
      rspackConfig: runtimeDetailsToRspackConfig(runtime)
    };
  }
  return {
    schemaVersion: 1,
    status: result.status === "not-found" ? "not-found" : "unavailable",
    diagnostics: {
      checkedScripts: Array.isArray(result.checked) ? result.checked : [],
      failureCount: Number.isInteger(result.failureCount)
        ? result.failureCount
        : 0
    }
  };
}

export async function detectRstackStack(
  divebell: DivebellExtensionApi,
  command: string
): Promise<DivebellStackDetection | undefined> {
  const result = await inspectRstackRuntimeSource(divebell);
  if (result?.schemaVersion !== 1 || result.status !== "found") {
    return undefined;
  }
  const matched = safeScriptName(result.matched);
  return {
    id: "rspack",
    name: "Rspack",
    evidence: [
      `data-rspack found in fetched ${matched}`
    ],
    command
  };
}
