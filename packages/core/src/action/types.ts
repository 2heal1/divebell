import type { RuntimeError } from "../runtime/types.js";
import type { RuntimeSnapshot, UpdateSnapshotInput } from "../snapshot/types.js";
import type { RuntimeCondition, RuntimeWaitOptions, RuntimeWaitResult } from "../wait/types.js";

export type RuntimeActionRisk = "safe" | "state-changing" | "destructive" | "sensitive";

export interface RuntimeJsonSchema {
  type: "object";
  properties?: Record<string, RuntimeJsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface RuntimeJsonSchemaProperty {
  type: "string" | "number" | "boolean" | "array" | "object";
  description?: string;
  enum?: Array<string | number | boolean>;
  items?: RuntimeJsonSchemaProperty;
  properties?: Record<string, RuntimeJsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export type RuntimeActionHandler = (
  payload: unknown,
  context: RuntimeActionContext
) => Promise<unknown> | unknown;

export interface RuntimeActionContext {
  actionName: string;
  getSnapshot: () => RuntimeSnapshot;
  updateSnapshot: (input: UpdateSnapshotInput) => void;
  waitFor: (
    condition: RuntimeCondition,
    options?: RuntimeWaitOptions
  ) => Promise<RuntimeWaitResult>;
}

export interface RegisterActionInput {
  name: string;
  description?: string;
  source?: string;
  risk?: RuntimeActionRisk;
  availableWhen?: RuntimeCondition | RuntimeCondition[];
  inputSchema?: RuntimeJsonSchema;
  handler: RuntimeActionHandler;
}

export interface RuntimeActionDescriptor {
  name: string;
  description?: string;
  source: string;
  risk: RuntimeActionRisk;
  availableWhen?: RuntimeCondition | RuntimeCondition[];
  inputSchema?: RuntimeJsonSchema;
  enabled: boolean;
  reason?: string;
  registeredAt: number;
  updatedAt: number;
}

export interface GetActionsQuery {
  name?: string | string[];
  source?: string | string[];
  risk?: RuntimeActionRisk | RuntimeActionRisk[];
  enabled?: boolean;
  query?: string;
}

export interface RuntimeActionResult {
  success: boolean;
  actionName: string;
  result?: unknown;
  error?: RuntimeError;
}
