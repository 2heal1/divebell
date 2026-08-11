import type {
  CliExtensionRunOptions,
  ParsedCliArgs
} from "@divebell/cli";
import { dirname, resolve } from "node:path";

import { DebugClient, type DebugEventsResult } from "./debug-client.js";
import { errorMessage, rstackError } from "./errors.js";
import {
  applyMfRuntimeOwners,
  collectMfEvidence,
  type MfEvidence
} from "./mf-evidence.js";
import { ObservationStore } from "./observation-store.js";
import { discoverRstackProfiles } from "./profiles.js";
import { appendDebugEvents } from "./reducer.js";
import { createHmrResult, resultShouldFinish } from "./report.js";
import { captureState, loadStateCheck } from "./state-check.js";
import type {
  HmrExpectations,
  HmrResult,
  InstalledProbe,
  MfRuntimeEvidence,
  ObservationManifest,
  ProbePlan,
  SharedProviderEvidence,
  StateCheckValue
} from "./types.js";

const DEFAULT_WAIT_TIMEOUT = 15_000;

export async function runHmrCommand(
  options: CliExtensionRunOptions,
  segments: readonly string[]
): Promise<unknown> {
  const operation = segments[0];
  if (operation === "inspect" && segments.length === 1) {
    return await inspectHmr(options);
  }
  if (operation === "start" && segments.length === 1) {
    return await startHmr(options);
  }
  if (operation === "status" && segments.length <= 2) {
    return await statusHmr(options, segments[1]);
  }
  if (operation === "wait" && segments.length <= 2) {
    return await waitHmr(options, segments[1]);
  }
  if (operation === "stop" && segments.length <= 2) {
    return await stopHmr(options, segments[1]);
  }
  throw rstackError({
    code: "RSTACK_HMR_COMMAND_INVALID",
    kind: "validation",
    message: "Invalid rstack hmr command.",
    hint: "Run `divebell rstack hmr <inspect|start|status|wait|stop>`."
  });
}

async function inspectHmr(options: CliExtensionRunOptions): Promise<unknown> {
  const debug = new DebugClient(options.divebell.browser);
  const before = await debug.status();
  const enabled = await debug.enable();
  const selected = requireSelectedSession(enabled.sessions);
  const wasEnabled = before.sessions.some((session) =>
    session.sessionId === selected.sessionId && session.enabled
  );
  try {
    const discovery = await discoverRstackProfiles(debug);
    const runtimes = discovery.runtimes.filter((runtime) =>
      runtime.sessionId === selected.sessionId
    );
    return {
      schemaVersion: 1,
      command: "rstack hmr inspect",
      supported: runtimes.some((runtime) => runtime.kind === "rspack-hmr"),
      runtimes,
      probes: discovery.probes.filter((probe) =>
        probe.sessionId === selected.sessionId
      ),
      warnings: discovery.warnings
    };
  } finally {
    if (!wasEnabled) {
      await disableDebuggerIfUnclaimed(debug, selected.sessionId);
    }
  }
}

async function startHmr(options: CliExtensionRunOptions): Promise<unknown> {
  const debug = new DebugClient(options.divebell.browser);
  const store = createObservationStore(options);
  const observationId = store.createId();
  const expectations = parseExpectations(options.args);
  const stateCheckPath = optionValue(options.args, "state-check");
  const stateCheck = stateCheckPath === undefined
    ? undefined
    : await loadStateCheck(stateCheckPath);
  const beforeStatus = await debug.status();
  const enabled = await debug.enable();
  const selected = requireSelectedSession(enabled.sessions);
  const enabledDebugger = !beforeStatus.sessions.some((session) =>
    session.sessionId === selected.sessionId && session.enabled
  );
  const installed: InstalledProbe[] = [];

  try {
    const baseline = await debug.events(0);
    const initialConsole = (await options.divebell.browser.console()).entries;
    const discovery = await discoverRstackProfiles(debug);
    const hmrRuntimes = discovery.runtimes.filter((runtime) =>
      runtime.kind === "rspack-hmr" && runtime.sessionId === selected.sessionId
    );
    const selectedProbes = discovery.probes.filter((probe) =>
      probe.sessionId === selected.sessionId
    );
    if (hmrRuntimes.length === 0) {
      throw rstackError({
        code: "RSTACK_HMR_PROFILE_UNSUPPORTED",
        kind: "runtime",
        message: "No supported Rspack HMR runtime was found in the compiled JavaScript loaded by the current page.",
        hint: "Run `divebell rstack hmr inspect` and confirm the page is a development build with HMR enabled.",
        details: { warnings: discovery.warnings }
      });
    }

    const liveRuntimeIds = await installRequiredProbes(
      debug,
      observationId,
      selectedProbes,
      installed
    );
    await installOptionalProbes(
      debug,
      observationId,
      selectedProbes.filter((probe) => liveRuntimeIds.has(probe.runtimeId)),
      installed,
      discovery.warnings
    );
    const runtimesWithProbes = discovery.runtimes.filter((runtime) =>
      runtime.sessionId === selected.sessionId
      && installed.some((probe) => probe.runtimeId === runtime.runtimeId)
    );
    if (!runtimesWithProbes.some((runtime) => runtime.kind === "rspack-hmr")) {
      throw rstackError({
        code: "RSTACK_HMR_PROBE_BIND_FAILED",
        kind: "browser",
        message: "Rspack HMR runtime candidates were found, but no status logpoint could be bound."
      });
    }

    const beforeState = stateCheck === undefined
      ? undefined
      : await captureState(options.divebell.browser, stateCheck);
    const mf = await collectMfEvidence(options.runExtension);
    const runtimes = applyMfRuntimeOwners(runtimesWithProbes, mf.runtime);
    const session = hmrRuntimes[0];
    if (session === undefined) throw new Error("Rspack runtime disappeared during arming.");
    const provisional: ObservationManifest = {
      schemaVersion: 1,
      observationId,
      status: "armed",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pageUrl: options.page?.url ?? "",
      connectionGeneration: enabled.connectionGeneration,
      sessionId: selected.sessionId,
      documentGeneration: session.documentGeneration,
      enabledDebugger,
      armedAtSequence: baseline.latestSequence,
      latestSequence: baseline.latestSequence,
      runtimes,
      probes: installed,
      events: [],
      expectations,
      consoleBaseline: initialConsole,
      ...(stateCheck === undefined ? {} : { stateCheck }),
      ...(beforeState === undefined ? {} : { beforeState })
    };
    const armBatch = await debug.events(baseline.latestSequence);
    const armCheck = appendDebugEvents(provisional, armBatch);
    const armedConsole = (await options.divebell.browser.console()).entries;
    const armCompileErrors = newCompileErrors(initialConsole, armedConsole);
    if (
      armCheck.events.length > 0
      || armBatchHasUpdateEvidence(armBatch)
      || armCompileErrors.length > 0
    ) {
      throw rstackError({
        code: "RSTACK_HMR_ARM_RACED_WITH_UPDATE",
        kind: "runtime",
        message: "A compile, HMR, reload, or debugger gap occurred while the observation was being armed.",
        hint: "Wait for the page to become idle, start a new observation, and only then edit the file.",
        details: { events: armCheck.events, compileErrors: armCompileErrors }
      });
    }
    const observation: ObservationManifest = {
      ...provisional,
      armedAtSequence: armBatch.latestSequence,
      latestSequence: armBatch.latestSequence,
      consoleBaseline: armedConsole
    };
    await store.write(observation);
    return {
      schemaVersion: 1,
      command: "rstack hmr start",
      observationId,
      status: "armed",
      armedAtSequence: observation.armedAtSequence,
      runtimeCount: observation.runtimes.filter((runtime) =>
        runtime.kind === "rspack-hmr"
      ).length,
      probeCount: observation.probes.length,
      expectations,
      nextCommand: `divebell rstack hmr wait ${observationId} --timeout ${DEFAULT_WAIT_TIMEOUT}`,
      warnings: discovery.warnings
    };
  } catch (error) {
    await removeProbes(debug, installed);
    if (enabledDebugger) {
      await disableDebuggerIfUnclaimed(debug, selected.sessionId);
    }
    throw error;
  }
}

async function statusHmr(
  options: CliExtensionRunOptions,
  observationId?: string
): Promise<unknown> {
  const store = createObservationStore(options);
  let observation = await store.read(observationId);
  if (observation.status === "completed" && observation.result !== undefined) {
    return verboseResult(observation.result, observation, options.args);
  }
  observation = await readAvailableEvents(options, observation);
  let result = await buildCurrentResult(options, observation, false);
  if (resultShouldFinish(result, observation)) {
    const stateAfter = observation.stateCheck === undefined
      ? undefined
      : await captureState(options.divebell.browser, observation.stateCheck);
    result = await buildCurrentResult(options, observation, false, stateAfter);
    observation = completeObservation(observation, result);
  }
  await store.write(observation);
  return verboseResult(result, observation, options.args);
}

async function waitHmr(
  options: CliExtensionRunOptions,
  observationId?: string
): Promise<unknown> {
  const store = createObservationStore(options);
  let observation = await store.read(observationId);
  if (observation.status === "completed" && observation.result !== undefined) {
    return verboseResult(observation.result, observation, options.args);
  }
  const timeout = positiveTimeout(options.args);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const wait = Math.max(1, Math.min(1000, deadline - Date.now()));
    observation = await readAvailableEvents(options, observation, wait);
    const quick = await buildCurrentResult(
      options,
      observation,
      false,
      undefined,
      emptyMfEvidence()
    );
    if (resultShouldFinish(quick, observation)) {
      const stateAfter = observation.stateCheck === undefined
        ? undefined
        : await captureState(options.divebell.browser, observation.stateCheck);
      const result = await buildCurrentResult(options, observation, false, stateAfter);
      observation = completeObservation(observation, result);
      await store.write(observation);
      return verboseResult(result, observation, options.args);
    }
    await store.write(observation);
  }

  const stateAfter = observation.stateCheck === undefined
    ? undefined
    : await captureState(options.divebell.browser, observation.stateCheck);
  const result = await buildCurrentResult(options, observation, true, stateAfter);
  observation = completeObservation(observation, result);
  await store.write(observation);
  return verboseResult(result, observation, options.args);
}

async function stopHmr(
  options: CliExtensionRunOptions,
  observationId?: string
): Promise<unknown> {
  const store = createObservationStore(options);
  let observation = await store.read(observationId);
  const debug = new DebugClient(options.divebell.browser);
  const cleanup = await removeProbes(debug, observation.probes);
  observation = {
    ...observation,
    status: observation.status === "completed" ? "completed" : "stale",
    updatedAt: new Date().toISOString()
  };
  await store.write(observation);

  let debuggerDisabled = false;
  if (observation.enabledDebugger) {
    const otherActive = (await store.list()).some((candidate) =>
      candidate.observationId !== observation.observationId
      && candidate.sessionId === observation.sessionId
      && (candidate.status === "armed" || candidate.status === "observing")
    );
    const [logpoints, breakpoints] = await Promise.all([
      debug.listLogpoints().catch(() => ({ probes: [{}] })),
      debug.listBreakpoints().catch(() => ({ probes: [{}] }))
    ]);
    if (!otherActive && logpoints.probes.length === 0 && breakpoints.probes.length === 0) {
      await debug.disable(observation.sessionId);
      debuggerDisabled = true;
    }
  }
  return {
    schemaVersion: 1,
    command: "rstack hmr stop",
    observationId: observation.observationId,
    status: observation.status,
    removedProbeCount: cleanup.removed,
    cleanupFailures: cleanup.failures,
    debuggerDisabled
  };
}

async function readAvailableEvents(
  options: CliExtensionRunOptions,
  observation: ObservationManifest,
  wait = 0
): Promise<ObservationManifest> {
  const debug = new DebugClient(options.divebell.browser);
  const batch = await debug.events(observation.latestSequence, wait);
  const next = appendDebugEvents(observation, batch);
  if (next.events.some((event) => event.type === "document.committed")) {
    return next;
  }
  const status = await debug.status();
  if (status.connectionGeneration !== observation.connectionGeneration) {
    throw staleObservation("The browser connection generation changed.");
  }
  const session = status.sessions.find((candidate) =>
    candidate.sessionId === observation.sessionId
  );
  if (session === undefined || session.documentGeneration !== observation.documentGeneration) {
    throw staleObservation("The observed document or CDP session changed.");
  }
  return next;
}

async function buildCurrentResult(
  options: CliExtensionRunOptions,
  observation: ObservationManifest,
  timedOut: boolean,
  stateAfter?: StateCheckValue[],
  providedMf?: MfEvidence
): Promise<HmrResult> {
  const [mf, consoleResult] = await Promise.all([
    providedMf === undefined
      ? collectMfEvidence(options.runExtension)
      : Promise.resolve(providedMf),
    options.divebell.browser.console()
  ]);
  return createHmrResult(observation, {
    mf,
    consoleEntries: consoleResult.entries,
    timedOut,
    ...(stateAfter === undefined ? {} : { stateAfter })
  });
}

async function installRequiredProbes(
  debug: DebugClient,
  observationId: string,
  plans: readonly ProbePlan[],
  installed: InstalledProbe[]
): Promise<Set<string>> {
  const live = new Set<string>();
  const failures: string[] = [];
  for (const plan of plans.filter((probe) => probe.required)) {
    try {
      installed.push(await installProbe(debug, observationId, plan));
      live.add(plan.runtimeId);
    } catch (error) {
      failures.push(`${plan.url || plan.scriptId}:${plan.location.line}:${plan.location.column}: ${errorMessage(error)}`);
    }
  }
  for (const runtimeId of new Set(plans.map((plan) => plan.runtimeId))) {
    if (!plans.some((plan) => plan.runtimeId === runtimeId && plan.required)) {
      live.add(runtimeId);
    }
  }
  const hmrRequired = plans.filter((plan) =>
    plan.required && plan.event === "hmr.status"
  );
  if (hmrRequired.length > 0 && !hmrRequired.some((plan) => live.has(plan.runtimeId))) {
    throw rstackError({
      code: "RSTACK_HMR_PROBE_BIND_FAILED",
      kind: "browser",
      message: "No Rspack HMR status logpoint could be bound.",
      details: { failures }
    });
  }
  return live;
}

async function installOptionalProbes(
  debug: DebugClient,
  observationId: string,
  plans: readonly ProbePlan[],
  installed: InstalledProbe[],
  warnings: string[]
): Promise<void> {
  for (const plan of plans.filter((probe) => !probe.required)) {
    try {
      installed.push(await installProbe(debug, observationId, plan));
    } catch (error) {
      warnings.push(
        `Optional ${plan.event} probe was not installed at ${plan.url || plan.scriptId}:${plan.location.line}:${plan.location.column}: ${errorMessage(error)}`
      );
    }
  }
}

async function installProbe(
  debug: DebugClient,
  observationId: string,
  plan: ProbePlan
): Promise<InstalledProbe> {
  const result = await debug.setLogpoint({
    sessionId: plan.sessionId,
    scriptId: plan.scriptId,
    line: plan.location.line,
    column: plan.location.column,
    expressions: plan.expressions,
    tags: [
      `observation=${observationId}`,
      `runtime=${plan.runtimeId}`,
      `event=${plan.event}`,
      `profile=${plan.profile}`
    ]
  });
  const actual = result.bindings?.[0]?.actualLocation;
  return {
    ...plan,
    probeId: result.probeId,
    ...(actual?.line === undefined || actual.column === undefined
      ? {}
      : { actualLocation: { line: actual.line, column: actual.column } })
  };
}

async function removeProbes(
  debug: DebugClient,
  probes: readonly Pick<InstalledProbe, "probeId">[]
): Promise<{ removed: number; failures: string[] }> {
  const settled = await Promise.all(probes.map(async (probe) => {
    try {
      await debug.removeLogpoint(probe.probeId);
      return { removed: true as const };
    } catch (error) {
      return {
        removed: false as const,
        failure: `${probe.probeId}: ${errorMessage(error)}`
      };
    }
  }));
  return {
    removed: settled.filter((item) => item.removed).length,
    failures: settled.flatMap((item) => item.removed ? [] : [item.failure])
  };
}

async function disableDebuggerIfUnclaimed(
  debug: DebugClient,
  sessionId: string
): Promise<boolean> {
  const [logpoints, breakpoints] = await Promise.all([
    debug.listLogpoints().catch(() => ({ probes: [{}] })),
    debug.listBreakpoints().catch(() => ({ probes: [{}] }))
  ]);
  if (logpoints.probes.length > 0 || breakpoints.probes.length > 0) {
    return false;
  }
  try {
    await debug.disable(sessionId);
    return true;
  } catch {
    return false;
  }
}

function completeObservation(
  observation: ObservationManifest,
  result: HmrResult
): ObservationManifest {
  return {
    ...observation,
    status: "completed",
    updatedAt: new Date().toISOString(),
    result: { ...result, status: "completed" }
  };
}

function parseExpectations(args: ParsedCliArgs): HmrExpectations {
  const expected = optionValue(args, "expect");
  if (expected !== undefined && expected !== "applied") {
    throw rstackError({
      code: "RSTACK_HMR_EXPECTATION_INVALID",
      kind: "validation",
      message: `Unsupported HMR expectation ${JSON.stringify(expected)}.`,
      hint: "Use `--expect applied`."
    });
  }
  return {
    ...(expected === undefined ? {} : { outcome: "applied" }),
    refresh: booleanOption(args, "expect-refresh"),
    noReload: booleanOption(args, "expect-no-reload")
  };
}

function booleanOption(args: ParsedCliArgs, name: string): boolean {
  const value = optionValue(args, name);
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw rstackError({
    code: "RSTACK_HMR_OPTION_INVALID",
    kind: "validation",
    message: `--${name} must be true or false.`
  });
}

function positiveTimeout(args: ParsedCliArgs): number {
  const timeout = numberOption(args, "timeout") ?? DEFAULT_WAIT_TIMEOUT;
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw rstackError({
      code: "RSTACK_HMR_TIMEOUT_INVALID",
      kind: "validation",
      message: "--timeout must be a positive number of milliseconds."
    });
  }
  return timeout;
}

function requireSelectedSession(
  sessions: Array<{ sessionId: string; tabId?: string }>
): { sessionId: string; tabId?: string } {
  const selected = sessions[0];
  if (selected === undefined) {
    throw rstackError({
      code: "RSTACK_HMR_PAGE_SESSION_UNAVAILABLE",
      kind: "browser",
      message: "agent-browser did not return a debuggable page session."
    });
  }
  return selected;
}

function staleObservation(message: string): Error {
  return rstackError({
    code: "RSTACK_HMR_OBSERVATION_STALE",
    kind: "runtime",
    message,
    hint: "Run `divebell rstack hmr start` again for the current document."
  });
}

function verboseResult(
  result: HmrResult,
  observation: ObservationManifest,
  args: ParsedCliArgs
): unknown {
  if (!booleanOption(args, "verbose")) return result;
  return {
    ...result,
    evidence: {
      armedAtSequence: observation.armedAtSequence,
      latestSequence: observation.latestSequence,
      probes: observation.probes,
      events: observation.events
    }
  };
}

function emptyMfEvidence(): MfEvidence {
  const runtime: MfRuntimeEvidence = {
    status: "not-observed",
    instances: [],
    remoteEntries: []
  };
  const shared = (packageName: "react" | "react-dom"): SharedProviderEvidence => ({
    status: "not-observed",
    package: packageName,
    operations: []
  });
  return { runtime, react: shared("react"), reactDom: shared("react-dom") };
}

function armBatchHasUpdateEvidence(batch: DebugEventsResult): boolean {
  return batch.events.some((event) => {
    if (event.type === "document-invalidated" || event.type === "document-committed") {
      return true;
    }
    if (event.type !== "script-parsed" || event.data === null || typeof event.data !== "object") {
      return false;
    }
    const url = "url" in event.data && typeof event.data.url === "string"
      ? event.data.url
      : "";
    return /(?:hot-update|\.hot-update\.)/iu.test(url);
  });
}

function newCompileErrors(baseline: unknown[], current: unknown[]): unknown[] {
  const counts = new Map<string, number>();
  for (const entry of baseline) {
    const key = JSON.stringify(entry);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return current.filter((entry) => {
    const key = JSON.stringify(entry);
    const existing = counts.get(key) ?? 0;
    if (existing > 0) {
      counts.set(key, existing - 1);
      return false;
    }
    if (entry === null || typeof entry !== "object" || !("args" in entry)) {
      return false;
    }
    return typeof entry.args === "string"
      && /Module (?:build|parse) failed|ERROR in|Failed to compile|Compilation failed|Build failed/iu.test(entry.args);
  });
}

function createObservationStore(options: CliExtensionRunOptions): ObservationStore {
  const explicitHome = process.env.DIVEBELL_HOME?.trim();
  const home = explicitHome === undefined || explicitHome.length === 0
    ? dirname(options.divebell.browser.profileDirectory())
    : resolve(explicitHome);
  return new ObservationStore(process.cwd(), home);
}

function optionValue(args: ParsedCliArgs, name: string): string | undefined {
  return args.options.get(name)?.at(-1);
}

function numberOption(args: ParsedCliArgs, name: string): number | undefined {
  const value = optionValue(args, name);
  if (value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
