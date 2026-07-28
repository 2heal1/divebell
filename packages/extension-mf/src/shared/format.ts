import type {
  PresentedSharedTraceResult,
  SharedStatusResult,
  SharedTraceOperation
} from "./types.js";

export function formatSharedStatus(result: SharedStatusResult): string {
  return `${JSON.stringify(result.shared, null, 2)}\n`;
}

export function formatSharedTrace(result: PresentedSharedTraceResult): string {
  const lines = [
    "Module Federation shared trace",
    `Capability: ${formatCapability(result)}`,
    `Runtime: ${result.capability.runtimeVersions.join(", ") || "unknown"}`,
    `Selection: ${result.selection.kind} (${result.selection.matchCount})`,
    ""
  ];
  if (!result.supported) {
    lines.push("Shared trace is not supported by the current reader.", "");
  } else if (result.operations.length === 0) {
    lines.push("No matching shared operations.", "");
  } else if (result.selection.kind !== "ambiguous") {
    for (const operation of result.operations) {
      appendOperation(lines, operation);
    }
  }
  if (result.candidates.length > 0) {
    lines.push("Candidates");
    for (const candidate of result.candidates) {
      lines.push(
        `  ${candidate.instanceRef}  ${candidate.package}  scope=${candidate.scope} operation=${candidate.operationId}`,
        `    ${candidate.command}`
      );
    }
    lines.push("");
  }
  appendWarnings(lines, result.warnings, result.recommendedActions);
  return `${lines.join("\n").trimEnd()}\n`;
}

function appendOperation(lines: string[], operation: SharedTraceOperation): void {
  lines.push(
    `${operation.instanceRef}  ${operation.mfName}  ${operation.package}`,
    `  scope: ${operation.scopes.join(", ")}`,
    `  operation: ${operation.operationId ?? "unknown"}`,
    `  trace: ${operation.traceIds.join(", ")}`,
    `  triggered by: ${operation.trigger ?? "unknown"}`,
    `  remote/expose: ${operation.remote ?? "unknown"} / ${operation.expose ?? "unknown"}`,
    `  request: ${operation.requestIds.join(", ") || "unknown"}`,
    `  required version: ${operation.requiredVersion === undefined ? "unknown" : String(operation.requiredVersion)}`,
    `  requested version: ${operation.requestedVersion ?? "unknown"}`,
    `  available versions: ${operation.availableVersions.join(", ") || "none observed"}`,
    `  selected: ${operation.selectedVersion ?? "none"} from ${operation.provider ?? "unknown"}`,
    `  selection reason: ${operation.selectionReason ?? "unknown"}`,
    `  failure reason: ${operation.failureReason ?? "none observed"}`,
    `  singleton/strict/eager: ${formatBoolean(operation.singleton)} / ${formatBoolean(operation.strictVersion)} / ${formatBoolean(operation.eager)}`,
    `  strategy: ${operation.strategy ?? "unknown"}`
  );
  if (operation.candidates.length === 0) {
    lines.push("  candidates: none observed");
  } else {
    lines.push("  candidates:");
    for (const candidate of operation.candidates) {
      lines.push(
        `    ${candidate.version} from ${candidate.provider ?? "unknown"}: compatible=${formatBoolean(candidate.compatible)} rejection=${candidate.rejectionReason ?? "none"} loaded=${candidate.loaded} singleton=${candidate.singleton} eager=${candidate.eager}`
      );
    }
  }
  if (operation.registrations.length === 0) {
    lines.push("  registrations: none observed");
  } else {
    lines.push("  registrations:");
    for (const registration of operation.registrations) {
      lines.push(
        `    ${registration.action}: ${registration.candidate.version} (${registration.reason}; trigger=${registration.trigger})`
      );
    }
  }
  lines.push(
    `  fallback/recovered: ${operation.fallback} / ${operation.recovered}`,
    `  final result: ${operation.finalResult.status}${operation.finalResult.outcome ? ` / ${operation.finalResult.outcome}` : ""}${operation.finalResult.reason ? ` / ${operation.finalResult.reason}` : ""}`,
    ""
  );
}

function formatCapability(result: {
  supported: boolean;
  capability: { completeness: string; reason?: string };
}): string {
  return `${result.supported ? "available" : "unavailable"} / ${result.capability.completeness}${result.capability.reason ? ` (${result.capability.reason})` : ""}`;
}

function appendWarnings(lines: string[], warnings: string[], actions: string[]): void {
  if (warnings.length > 0) {
    lines.push("Warnings", ...warnings.map((warning) => `  - ${warning}`), "");
  }
  if (actions.length > 0) {
    lines.push("Recommended actions", ...actions.map((action) => `  - ${action}`), "");
  }
}

function formatBoolean(value: boolean | undefined): string {
  return value === undefined ? "unknown" : String(value);
}
