export type RuntimeObjectType = string;
export type RuntimeStatus = string;

export interface RuntimeTargetParam {
  name: string;
  type: "string" | "number" | "boolean";
  required?: boolean;
  description?: string;
}

export interface RuntimeTargetMatcher {
  type: "exact" | "path-pattern" | "custom";
  pattern?: string;
}

export interface RegisterTargetInput {
  id: string;
  type: RuntimeObjectType;
  source: string;
  label?: string;
  description?: string;
  statuses: RuntimeStatus[];
  params?: RuntimeTargetParam[];
  matcher?: RuntimeTargetMatcher;
  data?: unknown;
}

export interface RuntimeTargetDescriptor extends RegisterTargetInput {
  registeredAt: number;
  updatedAt: number;
}

export interface GetTargetsQuery {
  type?: RuntimeObjectType | RuntimeObjectType[];
  source?: string | string[];
  id?: string | string[];
  status?: RuntimeStatus | RuntimeStatus[];
  query?: string;
}

