export interface MfCommandMetadata {
  path: readonly string[];
  usage: string;
  summaryUsage: string;
  description: string;
}

export const statusCommandMetadata = {
  path: ["status"],
  usage: "openruntime mf status [name] [--role <consumer|producer>] [--instance <ref>] [--verbose]",
  summaryUsage: "openruntime mf status",
  description: "List or select Module Federation instances from the current page."
} as const satisfies MfCommandMetadata;

export const moduleInfoCommandMetadata = {
  path: ["module-info"],
  usage: "openruntime mf module-info [remote] [--mf <name>] [--instance <ref>]",
  summaryUsage: "openruntime mf module-info [remote]",
  description: "Inspect a declared or loaded remote in an unambiguous consumer context."
} as const satisfies MfCommandMetadata;

export const bridgeTraceCommandMetadata = {
  path: ["bridge", "trace"],
  usage: "openruntime mf bridge trace [remote] [--mf <name>] [--instance <ref>] [--bridge <id>] [--operation <id>]",
  summaryUsage: "openruntime mf bridge trace [remote]",
  description: "Explain observed Module Federation Bridge lifecycle operations without inferring application readiness."
} as const satisfies MfCommandMetadata;

export const traceCommandMetadata = {
  path: ["trace"],
  usage: "openruntime mf trace [remote/expose] [--mf <name>] [--instance <ref>] [--trace-id <id>]",
  summaryUsage: "openruntime mf trace [remote/expose]",
  description: "Inspect one captured remote loading chain or list captured chains."
} as const satisfies MfCommandMetadata;

export const remoteCheckCommandMetadata = {
  path: ["remote", "check"],
  usage: "openruntime mf remote check <remote> [--mf <name>] [--instance <ref>]",
  summaryUsage: "openruntime mf remote check <remote>",
  description: "Check a remote using only evidence already observed in the current page."
} as const satisfies MfCommandMetadata;

export const preloadTraceCommandMetadata = {
  path: ["preload", "trace"],
  usage: "openruntime mf preload trace [remote] [--mf <name>] [--instance <ref>] [--trace-id <id>]",
  summaryUsage: "openruntime mf preload trace [remote]",
  description: "Inspect captured preloadRemote chains without mixing ordinary remote loads."
} as const satisfies MfCommandMetadata;

export const sharedStatusCommandMetadata = {
  path: ["shared", "status"],
  usage: "openruntime mf shared status [package] [--mf <name>] [--instance <ref>] [--scope <scope>]",
  summaryUsage: "openruntime mf shared status [package]",
  description: "Inspect current shared dependency state across every matching MF instance and share scope."
} as const satisfies MfCommandMetadata;

export const sharedTraceCommandMetadata = {
  path: ["shared", "trace"],
  usage: "openruntime mf shared trace [package] [--mf <name>] [--instance <ref>] [--scope <scope>] [--operation <id>] [--trace-id <id>]",
  summaryUsage: "openruntime mf shared trace [package]",
  description: "Explain an observed shared registration, selection, or loading operation."
} as const satisfies MfCommandMetadata;

export const implementedMfCommandMetadata = [
  statusCommandMetadata,
  moduleInfoCommandMetadata,
  traceCommandMetadata,
  remoteCheckCommandMetadata,
  preloadTraceCommandMetadata,
  sharedStatusCommandMetadata,
  sharedTraceCommandMetadata,
  bridgeTraceCommandMetadata
] as const;
