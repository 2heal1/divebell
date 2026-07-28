export interface MfCommandMetadata {
  path: readonly string[];
  usage: string;
  summaryUsage: string;
  description: string;
}

export const statusCommandMetadata = {
  path: ["status"],
  usage: "divebell mf status [name] [--role <consumer|producer>] [--instance <ref>] [--verbose]",
  summaryUsage: "divebell mf status",
  description: "List Module Federation instances and loaded shared dependencies; --verbose adds unloaded entries and function details."
} as const satisfies MfCommandMetadata;

export const moduleInfoCommandMetadata = {
  path: ["module-info"],
  usage: "divebell mf module-info [remote] [--mf <name>] [--instance <ref>]",
  summaryUsage: "divebell mf module-info [remote]",
  description: "Inspect a declared or loaded remote in an unambiguous consumer context."
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
  remoteStatusCommandMetadata,
  remoteTraceCommandMetadata,
  sharedStatusCommandMetadata,
  sharedTraceCommandMetadata,
  bridgeTraceCommandMetadata
] as const;
