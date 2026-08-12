import { createHash } from "node:crypto";

import type { DebugClient, DebugScript } from "./debug-client.js";
import type {
  HmrRuntimeCandidate,
  ProbePlan,
  ReactRefreshRuntimeCandidate,
  RuntimeCandidate,
  RuntimeKind,
  RuntimeOwnerEvidence,
  SourceLocation
} from "./types.js";

const HMR_FINGERPRINT = "check() is only allowed in idle status";
const REFRESH_FINGERPRINT = "shouldInvalidateReactRefreshBoundary";

export interface ProfileDiscovery {
  hmrRuntimes: HmrRuntimeCandidate[];
  reactRefreshRuntimes: ReactRefreshRuntimeCandidate[];
  probePlans: ProbePlan[];
  warnings: string[];
}

export async function discoverRstackProfiles(debug: DebugClient): Promise<ProfileDiscovery> {
  const warnings: string[] = [];
  const sourceKeys = new Map<string, { scriptId: string; sessionId: string }>();
  for (const query of [HMR_FINGERPRINT, REFRESH_FINGERPRINT]) {
    try {
      const searched = await debug.sourceSearch(query);
      for (const match of searched.matches) {
        sourceKeys.set(`${match.sessionId}\u0000${match.scriptId}`, {
          sessionId: match.sessionId,
          scriptId: match.scriptId
        });
      }
    } catch (error) {
      warnings.push(`Compiled source search for ${query} failed: ${message(error)}`);
    }
  }

  const hmrRuntimes: HmrRuntimeCandidate[] = [];
  const reactRefreshRuntimes: ReactRefreshRuntimeCandidate[] = [];
  const probePlans: ProbePlan[] = [];
  for (const key of sourceKeys.values()) {
    try {
      const loaded = await debug.source(key.scriptId, key.sessionId);
      const discovered = discoverProfilesInSource(loaded.script, loaded.scriptSource);
      hmrRuntimes.push(...discovered.hmrRuntimes);
      reactRefreshRuntimes.push(...discovered.reactRefreshRuntimes);
      probePlans.push(...discovered.probePlans);
      warnings.push(...discovered.warnings);
    } catch (error) {
      warnings.push(
        `Could not inspect compiled script ${key.scriptId}: ${message(error)}`
      );
    }
  }

  return {
    hmrRuntimes: uniqueBy(hmrRuntimes, (runtime) => runtime.runtimeId),
    reactRefreshRuntimes: uniqueBy(
      reactRefreshRuntimes,
      (runtime) => runtime.runtimeId
    ),
    probePlans: uniqueBy(
      probePlans,
      (probe) => `${probe.runtimeId}\u0000${probe.event}\u0000${probe.location.line}:${probe.location.column}`
    ),
    warnings
  };
}

export function discoverProfilesInSource(
  script: DebugScript,
  source: string
): ProfileDiscovery {
  const hmrRuntimes: HmrRuntimeCandidate[] = [];
  const reactRefreshRuntimes: ReactRefreshRuntimeCandidate[] = [];
  const probePlans: ProbePlan[] = [];
  const warnings: string[] = [];

  if (source.includes(HMR_FINGERPRINT)) {
    const statuses = findHmrStatusAssignments(source);
    if (statuses.length === 0) {
      warnings.push(
        `Rspack HMR fingerprint matched ${script.url ?? script.scriptId}, but no bounded setStatus assignment was recognized.`
      );
    }
    for (const status of statuses) {
      const runtime = createRuntime(script, "rspack-hmr", "rspack-hmr-v1", status.location);
      hmrRuntimes.push(runtime);
      probePlans.push({
        runtimeId: runtime.runtimeId,
        runtimeKind: runtime.kind,
        event: "hmr.status",
        profile: runtime.profile,
        sessionId: runtime.sessionId,
        scriptId: runtime.scriptId,
        url: runtime.url,
        location: status.location,
        expressions: [status.expression],
        required: true
      });
      addNamedHmrProbes(source, runtime, probePlans);
    }
  }

  if (source.includes(REFRESH_FINGERPRINT)) {
    const refreshAnchor = findFunctionAnchor(source, "executeRuntime")
      ?? locationAt(source, source.indexOf(REFRESH_FINGERPRINT));
    const runtime = createRuntime(
      script,
      "react-refresh",
      "rspack-react-refresh-v1",
      refreshAnchor
    );
    const refreshProbes = createRefreshProbes(source, runtime);
    if (refreshProbes.length === 0) {
      warnings.push(
        `React Refresh fingerprint matched ${script.url ?? script.scriptId}, but no supported boundary branch was recognized.`
      );
    } else {
      reactRefreshRuntimes.push(runtime);
      probePlans.push(...refreshProbes);
    }
  }

  return { hmrRuntimes, reactRefreshRuntimes, probePlans, warnings };
}

function findHmrStatusAssignments(source: string): Array<{
  location: SourceLocation;
  expression: string;
}> {
  const found: Array<{ index: number; expression: string }> = [];
  for (const match of source.matchAll(/\bcurrentStatus\s*=\s*newStatus\s*;/gu)) {
    if (match.index !== undefined) {
      found.push({ index: match.index, expression: "newStatus" });
    }
  }

  const generic = /function(?:\s+[$\w]+)?\s*\(\s*([$\w]+)\s*\)\s*\{\s*([$\w]+)\s*=\s*\1\s*;[\s\S]{0,1800}?Promise\.all\s*\(/gu;
  for (const match of source.matchAll(generic)) {
    if (match.index === undefined || match[1] === undefined || match[2] === undefined) {
      continue;
    }
    const prefix = match[0];
    const assignment = new RegExp(
      `${escapeRegExp(match[2])}\\s*=\\s*${escapeRegExp(match[1])}\\s*;`,
      "u"
    ).exec(prefix);
    if (assignment?.index !== undefined) {
      found.push({
        index: match.index + assignment.index,
        expression: match[1]
      });
    }
  }

  return uniqueBy(found, (item) => `${item.index}`).map((item) => ({
    location: locationAt(source, item.index),
    expression: item.expression
  }));
}

function addNamedHmrProbes(
  source: string,
  runtime: RuntimeCandidate,
  probes: ProbePlan[]
): void {
  const invalidate = source.indexOf("this._selfInvalidated = true");
  if (invalidate >= 0) {
    probes.push(probe(runtime, "hmr.invalidate", source, invalidate, [
      "moduleId",
      "currentStatus"
    ]));
  }

  const abort = source.indexOf("throw errors[0]");
  if (abort >= 0) {
    probes.push(probe(runtime, "hmr.abort-error", source, abort, ["errors[0]"], false));
  }

  const failBlock = /setStatus\(["']fail["']\)[\s\S]{0,160}?throw\s+error\s*;/u.exec(source);
  if (failBlock?.index !== undefined) {
    const relative = failBlock[0].lastIndexOf("throw error");
    probes.push(probe(
      runtime,
      "hmr.apply-error",
      source,
      failBlock.index + relative,
      ["error"],
      false
    ));
  }
}

function createRefreshProbes(source: string, runtime: RuntimeCandidate): ProbePlan[] {
  const probes: ProbePlan[] = [];
  const invalidations = allIndices(source, "hot.invalidate();");
  if (invalidations[0] !== undefined) {
    probes.push(probe(
      runtime,
      "refresh.boundary-invalidate",
      source,
      invalidations[0],
      ["moduleId"]
    ));
  }
  if (invalidations[1] !== undefined) {
    probes.push(probe(
      runtime,
      "refresh.non-boundary-invalidate",
      source,
      invalidations[1],
      ["moduleId"]
    ));
  }

  const enqueue = source.indexOf("enqueueUpdate();");
  if (enqueue >= 0) {
    probes.push(probe(
      runtime,
      "refresh.boundary-refresh",
      source,
      enqueue,
      ["moduleId"]
    ));
  }

  const performed = source.indexOf("performReactRefresh();");
  if (performed >= 0) {
    const after = source.indexOf("if (callback)", performed);
    if (after >= 0 && after - performed < 400) {
      probes.push(probe(
        runtime,
        "refresh.completed",
        source,
        after,
        ["'completed'"]
      ));
    }
  }

  const reload = source.indexOf("location.reload();");
  if (reload >= 0) {
    probes.push(probe(
      runtime,
      "reload.requested",
      source,
      reload,
      ["moduleId", "error"],
      false
    ));
  }
  return probes;
}

function probe(
  runtime: RuntimeCandidate,
  event: ProbePlan["event"],
  source: string,
  index: number,
  expressions: string[],
  required = false
): ProbePlan {
  return {
    runtimeId: runtime.runtimeId,
    runtimeKind: runtime.kind,
    event,
    profile: runtime.profile,
    sessionId: runtime.sessionId,
    scriptId: runtime.scriptId,
    url: runtime.url,
    location: locationAt(source, index),
    expressions,
    required
  };
}

function createRuntime<Kind extends RuntimeKind>(
  script: DebugScript,
  kind: Kind,
  profile: string,
  anchor: SourceLocation
): RuntimeCandidate<Kind> {
  const identity = JSON.stringify({
    scriptInstanceKey: script.scriptInstanceKey ?? {
      connectionGeneration: script.connectionGeneration,
      sessionId: script.sessionId,
      documentGeneration: script.documentGeneration,
      scriptId: script.scriptId
    },
    kind,
    anchor
  });
  return {
    runtimeId: `${kind}-${createHash("sha256").update(identity).digest("hex").slice(0, 16)}`,
    kind,
    profile,
    connectionGeneration: script.connectionGeneration,
    sessionId: script.sessionId,
    documentGeneration: script.documentGeneration,
    ...(script.executionContextId === undefined
      ? {}
      : { executionContextId: script.executionContextId }),
    scriptId: script.scriptId,
    scriptInstanceKey: script.scriptInstanceKey ?? null,
    url: script.url ?? "",
    anchor,
    owner: unknownOwner()
  };
}

function unknownOwner(): RuntimeOwnerEvidence {
  return {
    status: "unknown",
    kind: "unknown",
    confidence: "low",
    evidence: [],
    candidates: []
  };
}

function findFunctionAnchor(source: string, name: string): SourceLocation | undefined {
  const match = new RegExp(`function\\s+${escapeRegExp(name)}\\s*\\(`, "u").exec(source);
  return match?.index === undefined ? undefined : locationAt(source, match.index);
}

export function locationAt(source: string, byteIndex: number): SourceLocation {
  const bounded = Math.max(0, Math.min(byteIndex, source.length));
  const prefix = source.slice(0, bounded);
  const lastNewline = prefix.lastIndexOf("\n");
  return {
    line: prefix.split("\n").length,
    column: prefix.slice(lastNewline + 1).length + 1
  };
}

function allIndices(source: string, needle: string): number[] {
  const indices: number[] = [];
  let start = 0;
  while (start < source.length) {
    const index = source.indexOf(needle, start);
    if (index < 0) break;
    indices.push(index);
    start = index + needle.length;
  }
  return indices;
}

function uniqueBy<Value>(values: Value[], key: (value: Value) => string): Value[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const current = key(value);
    if (seen.has(current)) return false;
    seen.add(current);
    return true;
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
