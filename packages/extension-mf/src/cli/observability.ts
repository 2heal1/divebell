import type { CliExtensionRunOptions } from "@divebell/cli";

import { readMfObservability } from "../reader.js";
import type { BrowserObservabilitySnapshot } from "../types.js";
import { MfCommandError } from "./errors.js";

export async function readCommandSnapshot(
  options: CliExtensionRunOptions,
  readOptions: { verbose?: boolean } = {}
): Promise<BrowserObservabilitySnapshot> {
  let readResult;
  try {
    readResult = await readMfObservability(
      options.divebell.browser,
      readOptions
    );
  } catch (error) {
    if (isOpenContextError(error)) {
      throw new MfCommandError({
        code: "MF_PAGE_CONTEXT_REQUIRED",
        kind: "validation",
        message: "There is no page opened by Divebell for this command.",
        hint: "Run `divebell open <url>` and then run the MF command again."
      });
    }
    throw new MfCommandError({
      code: "MF_BROWSER_READ_FAILED",
      kind: "browser",
      message: error instanceof Error ? error.message : String(error),
      hint: "Confirm that the current page is still open, then retry."
    });
  }
  if (!readResult.ok) throw unavailableError(readResult);
  return readResult.snapshot;
}

export function presentCommandResult(result: unknown): unknown {
  if (!isRecord(result)) return result;
  const presented = { ...result };
  delete presented.compatibility;
  delete presented.capability;
  if (
    presented.command === "mf remote trace" &&
    Array.isArray(presented.traces)
  ) {
    return presentRemoteTraceResult(presented);
  }
  if (presented.command === "mf remote status") {
    return presentRemoteStatusResult(presented);
  }
  return presented;
}

function presentRemoteStatusResult(
  value: Record<string, unknown>
): Record<string, unknown> {
  const warnings = stringArray(value.warnings);
  const recommendedActions = stringArray(value.recommendedActions);
  return {
    consumer: value.consumer,
    remote: value.remote,
    ...(value.proxy === undefined ? {} : { proxy: value.proxy }),
    ...(warnings.length === 0 ? {} : { warnings }),
    ...(recommendedActions.length === 0
      ? {}
      : { recommendedActions })
  };
}

function presentRemoteTraceResult(
  value: Record<string, unknown>
): Record<string, unknown> {
  const warnings = stringArray(value.warnings);
  const recommendedActions = stringArray(value.recommendedActions);
  return {
    result: value.outcome,
    traces: Array.isArray(value.traces)
      ? value.traces.map(presentRemoteTrace)
      : [],
    ...(warnings.length === 0 ? {} : { warnings }),
    ...(recommendedActions.length === 0
      ? {}
      : { recommendedActions })
  };
}

function presentRemoteTrace(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return {
    traceId: value.traceId,
    ...(value.requestId === undefined ? {} : { requestId: value.requestId }),
    instance: {
      ref: value.instanceRef,
      name: value.instanceName
    },
    ...presentRemoteTarget(value),
    operation: value.kind === "preload"
      ? "preloadRemote"
      : "loadRemote",
    ...(value.kind === "load"
      ? { preload: presentPreload(value.preload) }
      : {}),
    result: presentTraceOutcome(value),
    ...(Array.isArray(value.stages)
      ? { lifecycle: value.stages.map(presentRemoteLifecycle) }
      : { lifecycle: [] })
  };
}

function presentRemoteTarget(
  value: Record<string, unknown>
): Record<string, unknown> {
  const remote = isRecord(value.remote) ? value.remote : undefined;
  if (remote === undefined && value.expose === undefined) return {};
  return {
    target: {
      ...(remote?.name === undefined ? {} : { remote: remote.name }),
      ...(remote?.alias === undefined ? {} : { alias: remote.alias }),
      ...(value.expose === undefined ? {} : { expose: value.expose })
    }
  };
}

function presentPreload(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return { status: "not-observed" };
  return {
    status: value.status,
    ...(value.traceId === undefined ? {} : { traceId: value.traceId }),
    ...(value.timing === undefined ? {} : { timing: value.timing }),
    ...readableTimeFields(value),
    ...(typeof value.duration === "number"
      ? { duration: value.duration }
      : {})
  };
}

function presentTraceOutcome(
  value: Record<string, unknown>
): Record<string, unknown> {
  return {
    status: value.outcome,
    ...readableTimeFields(value),
    ...(typeof value.duration === "number"
      ? { duration: value.duration }
      : {}),
    ...(value.cached === true ? { cached: true } : {}),
    ...(value.recovered === true ? { recovered: true } : {}),
    ...(value.timeout === true ? { timeout: true } : {}),
    ...(isRecord(value.error) ? { error: value.error } : {})
  };
}

function presentRemoteLifecycle(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const resources = Array.isArray(value.resources)
    ? value.resources.map(presentRemoteResource)
    : [];
  return {
    phase: value.name,
    result: value.status,
    ...readableTimeFields(value),
    ...(value.startedBy === undefined
      ? {}
      : { startedBy: value.startedBy }),
    ...(value.endedBy === undefined ? {} : { endedBy: value.endedBy }),
    ...(typeof value.duration === "number"
      ? { duration: value.duration }
      : {}),
    ...(value.cached === true ? { cached: true } : {}),
    ...(value.recovered === true ? { recovered: true } : {}),
    ...(value.timeout === true ? { timeout: true } : {}),
    ...(resources.length === 0 ? {} : { resources }),
    ...(isRecord(value.error) ? { error: value.error } : {})
  };
}

function presentRemoteResource(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const rawError = isRecord(value.error) ? value.error : undefined;
  const error = value.errorType === undefined && rawError === undefined
    ? undefined
    : {
        ...(value.errorType === undefined ? {} : { type: value.errorType }),
        ...(rawError ?? {})
      };
  return {
    type: value.type,
    loadedBy: value.initiator,
    result: value.outcome ?? "pending",
    ...(value.url === undefined ? {} : { url: value.url }),
    ...readableTimeFields(value),
    ...(typeof value.duration === "number"
      ? { duration: value.duration }
      : {}),
    ...(value.httpStatus === undefined
      ? {}
      : { httpStatus: value.httpStatus }),
    ...(value.mimeType === undefined ? {} : { mimeType: value.mimeType }),
    ...(value.redirected === undefined
      ? {}
      : { redirected: value.redirected }),
    ...(value.cacheSource === undefined
      ? {}
      : { cacheSource: value.cacheSource }),
    ...(error === undefined ? {} : { error })
  };
}

function readableTimeFields(
  value: Record<string, unknown>
): Record<string, string> {
  return {
    ...(typeof value.startedAt === "number"
      ? { startedAt: readableTimestamp(value.startedAt) }
      : {}),
    ...(typeof value.endedAt === "number"
      ? { endedAt: readableTimestamp(value.endedAt) }
      : {})
  };
}

function readableTimestamp(value: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString()
    .replace("T", " ")
    .replace("Z", " UTC");
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function unavailableError(
  result: Exclude<Awaited<ReturnType<typeof readMfObservability>>, { ok: true }>
): MfCommandError {
  const common = {
    details: {
      observabilityMode: "unavailable",
      availableScopes: result.availableScopes,
      compatibleScopes: result.compatibleScopes,
      ...(result.injection === undefined ? {} : { injection: result.injection })
    }
  };
  if (result.reason === "multiple-readers") {
    return new MfCommandError({
      code: "MF_OBSERVABILITY_READER_AMBIGUOUS",
      kind: "needs_input",
      message: "More than one application Observability reader is available, so no reader was chosen implicitly.",
      hint: "Keep one application reader scope for this page, or remove the duplicate controller and reopen the page.",
      ...common
    });
  }
  if (result.reason === "incompatible") {
    return new MfCommandError({
      code: "MF_OBSERVABILITY_INCOMPATIBLE",
      kind: "runtime",
      message: "An Observability reader exists, but it does not provide the MF-Obs-00 safe runtime-state interface.",
      hint: "Upgrade the MF Observability Plugin, then reopen the page with `divebell open <url>`.",
      ...common
    });
  }
  if (result.reason === "reader-error") {
    return new MfCommandError({
      code: "MF_OBSERVABILITY_READ_FAILED",
      kind: "runtime",
      message: `The public Observability reader failed: ${result.message}`,
      hint: "Inspect the application reader configuration, then reopen the page and retry.",
      ...common
    });
  }
  return new MfCommandError({
    code: "MF_OBSERVABILITY_UNAVAILABLE",
    kind: "not_found",
    message: "No public Module Federation Observability reader is available in the current page.",
    hint: "Reopen the page with `divebell open <url>`. If the extension was installed after opening, close and reopen the page; alternatively configure the Observability Plugin in the application.",
    ...common
  });
}

function isOpenContextError(error: unknown): boolean {
  return error instanceof Error &&
    ((error as Error & { code?: string }).code === "OPEN_CONTEXT_REQUIRED" ||
      /No opened page context/i.test(error.message));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
