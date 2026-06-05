export const OPEN_RUNTIME_PHASE = "phase-0" as const;

export type OpenRuntimePackageName =
  | "@openruntime/core"
  | "@openruntime/bridge"
  | "@openruntime/cli"
  | "@openruntime/modern-plugin"
  | "@openruntime/mf-runtime-plugin";

export interface OpenRuntimePackageInfo {
  name: OpenRuntimePackageName;
  phase: typeof OPEN_RUNTIME_PHASE;
  role: string;
}

export function createPackageInfo(
  name: OpenRuntimePackageName,
  role: string
): OpenRuntimePackageInfo {
  return {
    name,
    phase: OPEN_RUNTIME_PHASE,
    role
  };
}

