export interface MfCommandMetadata {
  path: readonly string[];
  usage: string;
  summaryUsage: string;
  description: string;
}

export function renderMfCommandUsage(
  usage: string,
  commandName: string
): string {
  return usage.replace(/^divebell mf(?=\s|$)/, `divebell ${commandName}`);
}

export function createMfCommandMetadata(
  commandName: string
): MfCommandMetadata[] {
  return implementedMfCommandMetadata.map((metadata) => ({
    ...metadata,
    usage: renderMfCommandUsage(metadata.usage, commandName),
    summaryUsage: renderMfCommandUsage(metadata.summaryUsage, commandName)
  }));
}

export const statusCommandMetadata = {
  path: ["status"],
  usage: "divebell mf status [name] [--role <consumer|producer>] [--instance <ref>] [--verbose]",
  summaryUsage: "divebell mf status",
  description: "Requires `divebell open <url> --mf`; lists Module Federation instances and loaded shared dependencies."
} as const satisfies MfCommandMetadata;

export const moduleInfoCommandMetadata = {
  path: ["module-info"],
  usage: "divebell mf module-info [remote] [--mf <name>] [--instance <ref>]",
  summaryUsage: "divebell mf module-info [remote]",
  description: "Inspect a declared or loaded remote in an unambiguous consumer context."
} as const satisfies MfCommandMetadata;

export const modulePerformanceCommandMetadata = {
  path: ["module-perf"],
  usage: "divebell mf module-perf [remote/expose] [--mf <name>] [--instance <ref>]",
  summaryUsage: "divebell mf module-perf [remote/expose]",
  description: "Measure observed producer module loading, expose resources, and page timing impact without reloading modules."
} as const satisfies MfCommandMetadata;

export const bridgeTraceCommandMetadata = {
  path: ["bridge", "trace"],
  usage: "divebell mf bridge trace [remote] [--mf <name>] [--instance <ref>] [--bridge-id <id>] [--operation <id>]",
  summaryUsage: "divebell mf bridge trace [remote]",
  description: "Explain observed Module Federation Bridge lifecycle operations without inferring application readiness."
} as const satisfies MfCommandMetadata;

export const remoteStatusCommandMetadata = {
  path: ["remote", "status"],
  usage: "divebell mf remote status <remote> [--mf <name>] [--instance <ref>]",
  summaryUsage: "divebell mf remote status <remote>",
  description: "Show whether a remote loaded successfully and which exposes were loaded."
} as const satisfies MfCommandMetadata;

export const remoteTraceCommandMetadata = {
  path: ["remote", "trace"],
  usage: "divebell mf remote trace [remote/expose] [--preload] [--mf <name>] [--instance <ref>] [--trace-id <id>]",
  summaryUsage: "divebell mf remote trace [remote/expose] [--preload]",
  description: "Inspect an observed remote load or preload lifecycle."
} as const satisfies MfCommandMetadata;

export const sharedTraceCommandMetadata = {
  path: ["shared", "trace"],
  usage: "divebell mf shared trace [package] [--mf <name>] [--instance <ref>] [--scope <scope>] [--operation <id>] [--trace-id <id>]",
  summaryUsage: "divebell mf shared trace [package]",
  description: "Explain observed shared dependency registration, selection, and loading operations."
} as const satisfies MfCommandMetadata;

export const sharedStatusCommandMetadata = {
  path: ["shared", "status"],
  usage: "divebell mf shared status [package] [--scope <scope>] [--version <version>] [--verbose]",
  summaryUsage: "divebell mf shared status [package]",
  description: "Inspect the merged global shared dependency registry; --verbose adds unloaded entries and function details."
} as const satisfies MfCommandMetadata;

export const implementedMfCommandMetadata = [
  statusCommandMetadata,
  moduleInfoCommandMetadata,
  modulePerformanceCommandMetadata,
  remoteStatusCommandMetadata,
  remoteTraceCommandMetadata,
  sharedStatusCommandMetadata,
  sharedTraceCommandMetadata,
  bridgeTraceCommandMetadata
] as const;
