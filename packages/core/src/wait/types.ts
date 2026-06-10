import type { RuntimeSnapshot, RuntimeSnapshotTarget } from "../snapshot/types.js";
import type { RuntimeStatus } from "../target/types.js";

export interface RuntimeCondition {
  id: string;
  status: RuntimeStatus;
  where?: RuntimeDataCondition[];
}

export interface RuntimeDataCondition {
  path: string;
  equals: unknown;
}

export interface RuntimeWaitOptions {
  timeout?: number;
}

export interface RuntimeWaitResult {
  success: boolean;
  condition: RuntimeCondition;
  snapshot: RuntimeSnapshot;
  target?: RuntimeSnapshotTarget;
  reason?: string;
}
