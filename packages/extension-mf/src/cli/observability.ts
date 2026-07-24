import type { CliExtensionRunOptions } from "@openruntime/cli";

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
      options.openruntime.browser,
      readOptions
    );
  } catch (error) {
    if (isOpenContextError(error)) {
      throw new MfCommandError({
        code: "MF_PAGE_CONTEXT_REQUIRED",
        kind: "validation",
        message: "There is no page opened by OpenRuntime for this command.",
        hint: "Run `openruntime open <url>` and then run the MF command again."
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

export function writeCommandResult(
  options: CliExtensionRunOptions,
  result: unknown
): void {
  options.output.ok(presentCommandResult(result));
}

function presentCommandResult(result: unknown): unknown {
  if (!isRecord(result)) return result;
  const presented = { ...result };
  delete presented.compatibility;
  delete presented.capability;
  if (
    presented.command === "mf trace" ||
    presented.command === "mf preload trace"
  ) {
    presented.traces = Array.isArray(presented.traces)
      ? presented.traces.map(presentRemoteTraceTime)
      : presented.traces;
  }
  return presented;
}

function presentRemoteTraceTime(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return {
    ...value,
    ...readableTimeFields(value),
    ...(Array.isArray(value.stages)
      ? { stages: value.stages.map(presentRemoteStageTime) }
      : {})
  };
}

function presentRemoteStageTime(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return {
    ...value,
    ...readableTimeFields(value),
    ...(Array.isArray(value.resources)
      ? { resources: value.resources.map(presentRemoteResourceTime) }
      : {})
  };
}

function presentRemoteResourceTime(value: unknown): unknown {
  return isRecord(value)
    ? { ...value, ...readableTimeFields(value) }
    : value;
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
      hint: "Upgrade the MF Observability Plugin, then reopen the page with `openruntime open <url>`.",
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
    hint: "Reopen the page with `openruntime open <url>`. If the extension was installed after opening, close and reopen the page; alternatively configure the Observability Plugin in the application.",
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
