import type { RuntimeError } from "../runtime/types.js";
import type { RuntimeObjectType, RuntimeStatus } from "../target/types.js";

export interface RuntimeSnapshot {
  targets: Record<string, RuntimeSnapshotTarget>;
  latestEventId: number;
  capturedAt: number;
}

export interface RuntimeSnapshotTarget {
  id: string;
  type: RuntimeObjectType;
  status: RuntimeStatus;
  source?: string;
  description?: string;
  data?: unknown;
  error?: RuntimeError;
  updatedAt: number;
  dependsOn?: string[];
}

export interface UpdateSnapshotInput {
  id: string;
  status: RuntimeStatus;
  type?: RuntimeObjectType;
  source?: string;
  description?: string;
  data?: unknown;
  error?: RuntimeError;
  dependsOn?: string[];
}

export interface GetSnapshotQuery {
  id?: string | string[];
  type?: RuntimeObjectType | RuntimeObjectType[];
  source?: string | string[];
  status?: RuntimeStatus | RuntimeStatus[];
  query?: string;
}

