import type { DivebellBrowserConsoleEntry } from "@divebell/cli";

import { currentOutcome, reduceCycles, refreshSummary } from "./reducer.js";
import { compareState } from "./state-check.js";
import type {
  HmrOutcome,
  HmrResult,
  MfRuntimeEvidence,
  ObservationManifest,
  SharedProviderEvidence,
  StateCheckValue
} from "./types.js";

export interface CreateHmrResultOptions {
  mf: {
    runtime: MfRuntimeEvidence;
    react: SharedProviderEvidence;
    reactDom: SharedProviderEvidence;
  };
  stateAfter?: StateCheckValue[];
  consoleEntries?: DivebellBrowserConsoleEntry[];
  timedOut?: boolean;
}

export function createHmrResult(
  observation: ObservationManifest,
  options: CreateHmrResultOptions
): HmrResult {
  const cycles = reduceCycles(observation.events);
  const refresh = refreshSummary(observation.events);
  const compileError = findNewCompileError(
    observation.consoleBaseline,
    options.consoleEntries ?? []
  );
  const observedOutcome = currentOutcome(observation.events, cycles);
  const outcome: HmrOutcome = observedOutcome === "incomplete" && compileError !== undefined
    ? "failed"
    : observedOutcome;
  const stateStatus = compareState(observation.beforeState, options.stateAfter);
  const reloadRequested = observation.events.some((event) =>
    event.type === "reload.requested"
  );
  const gaps = observation.events
    .filter((event) => event.type === "evidence.gap")
    .map((event) => ({
      kind: event.error === "transport" ? "transport" as const : "buffer" as const,
      sequence: event.sequence
    }));
  const explicitExpectation = observation.expectations.outcome !== undefined
    || observation.expectations.refresh
    || observation.expectations.noReload
    || observation.stateCheck !== undefined;
  const terminal = (outcome !== "incomplete" || options.timedOut === true)
    && (observation.stateCheck === undefined || options.stateAfter !== undefined);
  const failures = expectationFailures(observation, {
    outcome,
    refresh,
    stateStatus,
    reloadRequested,
    timedOut: options.timedOut === true
  });
  const verdict = !explicitExpectation || !terminal
    ? "observed"
    : failures.length === 0
      ? "passed"
      : "failed";
  const warnings = [...failures];
  if (compileError !== undefined) warnings.push(compileError.args);
  if (reloadRequested && outcome !== "reloaded") {
    warnings.push("A page reload was requested, but a new document commit was not observed yet.");
  }
  if (options.mf.runtime.status === "unavailable") {
    warnings.push(
      options.mf.runtime.reason
      ?? "Module Federation runtime ownership evidence is unavailable."
    );
  }
  if (observation.runtimes.every((runtime) => runtime.kind !== "react-refresh")) {
    warnings.push("No supported compiled React Refresh runtime was observed.");
  }

  return {
    schemaVersion: 1,
    observationId: observation.observationId,
    status: terminal ? "completed" : observation.status,
    verdict,
    outcome,
    ...createErrorCode({
      outcome,
      refresh,
      expectations: observation.expectations,
      stateExpected: observation.stateCheck !== undefined,
      stateStatus,
      compileError: compileError !== undefined,
      timedOut: options.timedOut === true
    }),
    capabilities: {
      rspackHmr: observation.runtimes.some((runtime) => runtime.kind === "rspack-hmr")
        ? "observed"
        : "unsupported",
      reactRefresh: observation.runtimes.some((runtime) => runtime.kind === "react-refresh")
        ? "observed"
        : "not-observed",
      compileErrors: "console-fallback",
      moduleFederation: options.mf.runtime.status
    },
    runtimes: observation.runtimes,
    cycles,
    refresh,
    statePreservation: {
      status: stateStatus,
      ...(observation.beforeState === undefined ? {} : { before: observation.beforeState }),
      ...(options.stateAfter === undefined ? {} : { after: options.stateAfter })
    },
    shared: options.mf,
    gaps,
    warnings: unique(warnings),
    recommendedActions: recommendedActions({
      outcome,
      refresh,
      mf: options.mf.runtime,
      gaps: gaps.length > 0
    })
  };
}

export function resultShouldFinish(
  result: HmrResult,
  observation: ObservationManifest
): boolean {
  if (["unknown", "reloaded", "failed", "aborted", "no-update"].includes(result.outcome)) {
    return true;
  }
  if (result.outcome !== "applied") return false;
  const refreshWasQueued = observation.events.some((event) =>
    event.type === "refresh.boundary-refresh"
  );
  if (refreshWasQueued && !result.refresh.completed) return false;
  if (!observation.expectations.refresh) return true;
  return result.refresh.completed
    || result.refresh.boundary === "invalidated"
    || result.refresh.boundary === "non-boundary";
}

function expectationFailures(
  observation: ObservationManifest,
  input: {
    outcome: HmrOutcome;
    refresh: HmrResult["refresh"];
    stateStatus: HmrResult["statePreservation"]["status"];
    reloadRequested: boolean;
    timedOut: boolean;
  }
): string[] {
  const failures: string[] = [];
  if (observation.expectations.outcome === "applied" && input.outcome !== "applied") {
    failures.push(`Expected an applied HMR cycle, but observed ${input.outcome}.`);
  }
  if (
    observation.expectations.refresh
    && (input.refresh.boundary !== "refreshed" || !input.refresh.completed)
  ) {
    failures.push(
      input.refresh.boundary === "invalidated" || input.refresh.boundary === "non-boundary"
        ? `React Refresh boundary was ${input.refresh.boundary}.`
        : "React Refresh did not complete."
    );
  }
  if (
    observation.expectations.noReload
    && (input.outcome === "reloaded" || input.reloadRequested)
  ) {
    failures.push("The page reloaded or requested a reload during the observation.");
  }
  if (observation.stateCheck !== undefined && input.stateStatus !== "verified-preserved") {
    failures.push(
      input.stateStatus === "verified-reset"
        ? "The configured page state changed across the HMR update."
        : "The configured page state could not be verified before and after the HMR update."
    );
  }
  if (input.timedOut && input.outcome === "incomplete") {
    failures.push("No complete HMR cycle was observed before the timeout.");
  }
  return failures;
}

function createErrorCode(input: {
  outcome: HmrOutcome;
  refresh: HmrResult["refresh"];
  expectations: ObservationManifest["expectations"];
  stateExpected: boolean;
  stateStatus: HmrResult["statePreservation"]["status"];
  compileError: boolean;
  timedOut: boolean;
}): { errorCode?: string } {
  if (input.outcome === "unknown") return { errorCode: "RSTACK_HMR_EVIDENCE_GAP" };
  if (input.outcome === "reloaded") return { errorCode: "RSTACK_HMR_RELOADED" };
  if (input.compileError) return { errorCode: "RSTACK_HMR_COMPILE_FAILED" };
  if (input.outcome === "failed") return { errorCode: "RSTACK_HMR_APPLY_FAILED" };
  if (input.outcome === "aborted") return { errorCode: "RSTACK_HMR_ABORTED" };
  if (input.expectations.refresh && input.refresh.boundary === "invalidated") {
    return { errorCode: "RSTACK_REFRESH_BOUNDARY_INVALIDATED" };
  }
  if (input.expectations.refresh && !input.refresh.completed && input.outcome === "applied") {
    return { errorCode: "RSTACK_REFRESH_NOT_COMPLETED" };
  }
  if (input.expectations.outcome === "applied" && input.outcome === "no-update") {
    return { errorCode: "RSTACK_HMR_NO_UPDATE" };
  }
  if (input.stateStatus === "verified-reset") {
    return { errorCode: "RSTACK_HMR_STATE_RESET" };
  }
  if (input.stateExpected && input.stateStatus === "not-verified") {
    return { errorCode: "RSTACK_HMR_STATE_NOT_VERIFIED" };
  }
  if (input.timedOut && input.outcome === "incomplete") {
    return { errorCode: "RSTACK_HMR_INCOMPLETE" };
  }
  return {};
}

function findNewCompileError(
  baseline: unknown[],
  current: DivebellBrowserConsoleEntry[]
): DivebellBrowserConsoleEntry | undefined {
  const counts = new Map<string, number>();
  for (const entry of baseline) {
    const key = JSON.stringify(entry);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const newEntries = current.filter((entry) => {
    const key = JSON.stringify(entry);
    const count = counts.get(key) ?? 0;
    if (count <= 0) return true;
    counts.set(key, count - 1);
    return false;
  });
  return newEntries.find((entry) =>
    entry.level === "error"
    && /Module (?:build|parse) failed|ERROR in|Failed to compile|Compilation failed|Build failed/iu.test(entry.args)
  );
}

function recommendedActions(input: {
  outcome: HmrOutcome;
  refresh: HmrResult["refresh"];
  mf: MfRuntimeEvidence;
  gaps: boolean;
}): string[] {
  const actions: string[] = [];
  if (input.gaps) {
    actions.push("Start a new HMR observation and reproduce the edit again; the debugger event stream had a gap.");
  }
  if (input.outcome === "failed" || input.outcome === "aborted") {
    actions.push("Run `divebell rstack hmr status <observation-id> --verbose` and inspect the compiled error location and status path.");
  }
  if (input.refresh.boundary === "invalidated" || input.refresh.boundary === "non-boundary") {
    actions.push("Inspect the changed module exports; React Refresh invalidated the previous boundary.");
  }
  if (input.mf.status === "unavailable") {
    actions.push("Reopen the page with `divebell open <url> --mf` to capture MF runtime and shared React evidence.");
  }
  return unique(actions);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
