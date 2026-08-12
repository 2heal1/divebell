import type { DivebellBrowserConsoleEntry } from "@divebell/cli";

import { currentOutcome, reduceCycles, refreshSummary } from "./reducer.js";
import { unavailableReactRefreshPreflight } from "./react-refresh-preflight.js";
import { compareState } from "./state-check.js";
import type {
  HmrOutcome,
  HmrResult,
  MfRuntimeEvidence,
  ObservationManifest,
  SharedProviderEvidence,
  StateCheckValue
} from "./types.js";

export const PAGE_RELOAD_SETTLE_MS = 1_000;

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
  const documentCommitted = observation.events.some((event) =>
    event.type === "document.committed"
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
    && (outcome !== "applied" || pageReloadSettled(observation, Date.now()))
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
  if (observation.runtimes.every((runtime) => runtime.kind !== "react-refresh")) {
    warnings.push("No supported compiled React Refresh runtime was observed.");
  }
  const reactRefreshPreflight = observation.reactRefreshPreflight
    ?? unavailableReactRefreshPreflight(
      "The observation was created before React Refresh preflight evidence was recorded."
    );

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
      reactRefreshRuntime: observation.runtimes.some((runtime) => runtime.kind === "react-refresh")
        ? "observed"
        : "not-observed",
      refreshRenderer: reactRefreshPreflight.refreshRenderer.status,
      compileErrors: "console-fallback",
      moduleFederation: options.mf.runtime.status
    },
    runtimes: observation.runtimes,
    cycles,
    pageReload: {
      status: gaps.length > 0
        ? "unknown"
        : documentCommitted
          ? "reloaded"
          : reloadRequested
            ? "requested"
            : outcome === "applied"
              && pageReloadSettled(observation, Date.now())
              ? "same-document"
              : "not-observed",
      requested: reloadRequested,
      documentCommitted,
      settleWindowMs: PAGE_RELOAD_SETTLE_MS
    },
    reactRefreshPreflight,
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
      refreshRenderer: reactRefreshPreflight.refreshRenderer.status,
      gaps: gaps.length > 0
    })
  };
}

export function resultShouldFinish(
  result: HmrResult,
  observation: ObservationManifest,
  now = Date.now()
): boolean {
  if (["unknown", "reloaded", "failed", "aborted", "no-update"].includes(result.outcome)) {
    return true;
  }
  if (result.outcome !== "applied") return false;
  const refreshWasQueued = observation.events.some((event) =>
    event.type === "refresh.boundary-refresh"
  );
  if (refreshWasQueued && !result.refresh.completed) return false;
  const refreshFinished = !observation.expectations.refresh
    || result.refresh.completed
    || result.refresh.boundary === "invalidated"
    || result.refresh.boundary === "non-boundary";
  if (!refreshFinished) return false;
  return pageReloadSettled(observation, now);
}

function pageReloadSettled(
  observation: ObservationManifest,
  now: number
): boolean {
  const lastTerminalAt = Math.max(0, ...observation.events
    .filter((event) =>
      (event.type === "hmr.status" && event.status === "idle")
      || event.type === "refresh.completed"
    )
    .map((event) => event.timestamp));
  return lastTerminalAt > 0 && now - lastTerminalAt >= PAGE_RELOAD_SETTLE_MS;
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
  refreshRenderer: HmrResult["capabilities"]["refreshRenderer"];
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
  if (input.refreshRenderer === "react-dom-production") {
    actions.push("Use a development ReactDOM build for the renderer that owns the mounted root; production ReactDOM does not expose React Refresh scheduling hooks.");
  } else if (input.refreshRenderer === "hook-missing") {
    actions.push("Install the React Refresh global hook before ReactDOM is evaluated.");
  } else if (input.refreshRenderer === "hook-incompatible") {
    actions.push("Use an enabled React DevTools global hook that supports Fiber before ReactDOM is evaluated.");
  } else if (input.refreshRenderer === "renderer-missing") {
    actions.push("Reload with the React Refresh global hook installed before ReactDOM so the renderer can register with it.");
  }
  return unique(actions);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
