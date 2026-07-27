import type { ModuleInfoResult } from "./types.js";

export function formatModuleInfo(result: ModuleInfoResult): string {
  const remote = result.remote;
  const lines = [
    "Module Federation module info",
    `Consumer: ${result.consumer.name} (${result.consumer.instanceRef})`,
    `Consumer version: ${result.consumer.version ?? "unknown"}`,
    `Remote: ${remote.name}${remote.alias ? ` (alias: ${remote.alias})` : ""}`,
    `Status: ${remote.status}`,
    `Producer: ${remote.producerInstanceRef ?? remote.candidateProducerInstanceRefs?.join(", ") ?? "unknown"}`,
    `Manifest: ${remote.manifestUrl ?? "unknown"}`,
    `Snapshot source: ${remote.snapshotSource}`,
    `Remote entry: ${remote.remoteEntryUrl ?? "unknown"}`,
    `Global name: ${remote.globalName ?? "unknown"}`,
    `Type: ${remote.type ?? "unknown"}`,
    `Public path: ${remote.publicPath ?? "unknown"}`,
    `getPublicPath: ${remote.getPublicPath ?? "unknown"}`,
    `Exposes: ${remote.exposes.join(", ") || "none observed"}`,
    `Shared scopes: ${remote.shared.map((scope) => `${scope.name}:${scope.sharedCount}`).join(", ") || "none observed"}`,
    `Dependency remotes: ${formatRemotes(remote.dependencyRemotes)}`,
    `Cached: ${String(remote.cached)}`,
    `First loaded at: ${remote.firstLoadedAt === undefined ? "unknown" : new Date(remote.firstLoadedAt).toISOString()}`,
    `Observability: ${result.compatibility.observabilityVersion} (${result.compatibility.observabilityMode})`,
    `History: ${result.compatibility.completeness.history}`,
    ""
  ];
  appendWarnings(
    lines,
    [...result.compatibility.warnings, ...result.warnings],
    [...result.compatibility.recommendedActions, ...result.recommendedActions]
  );
  return `${lines.join("\n").trimEnd()}\n`;
}

function appendWarnings(lines: string[], warnings: string[], actions: string[]): void {
  const uniqueWarnings = Array.from(new Set(warnings));
  const uniqueActions = Array.from(new Set(actions));
  if (uniqueWarnings.length > 0) {
    lines.push("Warnings", ...uniqueWarnings.map((warning) => `  - ${warning}`), "");
  }
  if (uniqueActions.length > 0) {
    lines.push("Recommended actions", ...uniqueActions.map((action) => `  - ${action}`), "");
  }
}

function formatRemotes(remotes: Array<{
  name: string;
  alias?: string;
  version?: string;
  entry?: string;
}>): string {
  return remotes.map((remote) => [
    remote.alias === undefined ? remote.name : `${remote.alias}=${remote.name}`,
    remote.version,
    remote.entry
  ].filter(Boolean).join(" @ ")).join(", ") || "none";
}
