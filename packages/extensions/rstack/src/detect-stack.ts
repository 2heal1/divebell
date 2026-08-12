import type { DivebellExtensionApi } from "@divebell/cli";

const FETCH_TIMEOUT_MS = 1_200;

export type RstackEntryKind = "index" | "main" | "runtime";

export interface RstackFetchDetectionResult {
  schemaVersion: 1;
  status: "found" | "not-found" | "unavailable";
  checked: string[];
  failureCount: number;
  matched?: string;
}

export function classifyRstackEntryFilename(
  fileName: string
): RstackEntryKind | undefined {
  const normalized = fileName.toLowerCase();
  if (normalized.startsWith("index")) return "index";
  if (normalized.includes("main")) return "main";
  if (normalized.startsWith("runtime")) return "runtime";
  return undefined;
}

export function createRstackFetchDetectionScript(): string {
  return `(async () => {
    try {
      const classifyFilename = ${classifyRstackEntryFilename.toString()};
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
              matched: candidate.name
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

export async function detectRstackStack(
  divebell: DivebellExtensionApi,
  command: string
): Promise<{
  id: string;
  name: string;
  evidence: string[];
  command: string;
} | undefined> {
  let result: RstackFetchDetectionResult;
  try {
    result = await divebell.browser.eval<RstackFetchDetectionResult>(
      createRstackFetchDetectionScript()
    );
  } catch {
    return undefined;
  }
  if (result?.schemaVersion !== 1 || result.status !== "found") {
    return undefined;
  }
  const matched = typeof result.matched === "string"
    ? result.matched.replace(/[\u0000-\u001f\u007f]/gu, "?").slice(0, 200)
    : "entry script";
  return {
    id: "rspack",
    name: "Rspack",
    evidence: [
      `data-rspack found in fetched ${matched}`
    ],
    command
  };
}
