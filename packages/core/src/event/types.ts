import type { RuntimeError } from "../runtime/types.js";
import type { RuntimeStatus } from "../target/types.js";

export interface RuntimeEvent {
  id: number;
  type: string;
  source: string;
  timestamp: number;
  targetId?: string;
  actionName?: string;
  status?: RuntimeStatus;
  payload?: unknown;
  error?: RuntimeError;
}

export interface GetEventsQuery {
  since?: number;
  targetId?: string | string[];
  actionName?: string | string[];
  type?: string | string[];
  source?: string | string[];
  status?: RuntimeStatus | RuntimeStatus[];
  limit?: number;
  query?: string;
}

export interface GetEventsResult {
  events: RuntimeEvent[];
  latestEventId: number;
  truncated: boolean;
}
