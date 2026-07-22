export interface MfCommandMetadata {
  path: readonly string[];
  usage: string;
  summaryUsage: string;
  description: string;
}

export const statusCommandMetadata = {
  path: ["status"],
  usage: "openruntime mf status [name] [--role <consumer|producer>] [--instance <ref>] [--json]",
  summaryUsage: "openruntime mf status",
  description: "List or select Module Federation instances from the current page."
} as const satisfies MfCommandMetadata;

export const moduleInfoCommandMetadata = {
  path: ["module-info"],
  usage: "openruntime mf module-info [remote] [--mf <name>] [--instance <ref>] [--json]",
  summaryUsage: "openruntime mf module-info [remote]",
  description: "Inspect a declared or loaded remote in an unambiguous consumer context."
} as const satisfies MfCommandMetadata;

export const bridgeTraceCommandMetadata = {
  path: ["bridge", "trace"],
  usage: "openruntime mf bridge trace [remote] [--mf <name>] [--instance <ref>] [--bridge <id>] [--operation <id>] [--json]",
  summaryUsage: "openruntime mf bridge trace [remote]",
  description: "Explain observed Module Federation Bridge lifecycle operations without inferring application readiness."
} as const satisfies MfCommandMetadata;

export const implementedMfCommandMetadata = [
  statusCommandMetadata,
  moduleInfoCommandMetadata,
  bridgeTraceCommandMetadata
] as const;
