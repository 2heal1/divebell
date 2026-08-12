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

interface RstackBundlerRuntimeDetailsBase {
  globals: Record<string, RstackRuntimeGlobalDetail>;
}

export type RstackBundlerRuntimeDetails =
  | (RstackBundlerRuntimeDetailsBase & {
      mode: Exclude<RstackRuntimeMode, "unknown">;
      requireExpression: string;
    })
  | (RstackBundlerRuntimeDetailsBase & { mode: "unknown" });

export interface RstackFetchDetectionResult {
  schemaVersion: 1;
  status: "found" | "not-found" | "unavailable";
  checked: string[];
  failureCount: number;
  matched?: string;
  runtime?: RstackBundlerRuntimeDetails;
}

export type RstackStatusResult =
  | {
      schemaVersion: 1;
      status: "found";
      bundlerRuntime: RstackBundlerRuntimeDetails & { script: string };
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
): RstackBundlerRuntimeDetails {
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
        const returned = /(?:=>\s*\(\s*|\breturn\s+)("(?:\\.|[^"\\])*")/u.exec(tail.slice(0, 400))?.[1];
        if (returned !== undefined) {
          try {
            return {
              expression,
              kind: "function",
              value: JSON.parse(returned) as string
            };
          } catch {}
        }
      }
      return { expression, kind: "function" };
    }
    return { expression, kind: "dynamic" };
  };

  for (const base of bases) {
    const globals: Record<string, RstackRuntimeGlobalDetail> = {};
    for (const [name, property] of definitions) {
      if (name === undefined || property === undefined) continue;
      const detail = detailAt(base.expression, property, name === "rspackVersion");
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

async function inspectRstackBundlerRuntime(
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
  const result = await inspectRstackBundlerRuntime(divebell, true);
  const found = result.schemaVersion === 1 && result.status === "found";
  if (found) {
    return {
      schemaVersion: 1,
      status: "found",
      bundlerRuntime: {
        script: safeScriptName(result.matched),
        ...(result.runtime ?? { mode: "unknown", globals: {} })
      }
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
  const result = await inspectRstackBundlerRuntime(divebell);
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
