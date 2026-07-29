export type VerifyTargetClass = "business" | "modern" | "module-federation" | "garfish" | "divebell" | "unknown";

export interface VerifyVisibilityResult {
  checked: boolean;
  status: "blank" | "visible" | "unavailable" | "unknown";
  blank: boolean | null;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface VerifyWaitTarget {
  id: string;
  type: string;
  status: string;
  source?: string;
  data?: unknown;
}

export interface VerifyWaitResult {
  success: boolean;
  condition: {
    id: string;
    status: string;
    where?: Array<{ path: string; equals: unknown }>;
  };
  snapshot?: unknown;
  target?: VerifyWaitTarget;
  reason?: string;
}

export interface VerifyCommandResult {
  runtime?: unknown;
  result: {
    success: boolean;
    condition: {
      id: string;
      status: string;
      where?: Array<{ path: string; equals: unknown }>;
    };
    evidence: {
      level: "business" | "runtime" | "insufficient";
      scope: "business-result" | "runtime-layer" | "none";
      targetClass: VerifyTargetClass;
      businessVerified: boolean;
      message: string;
      nextStep?: string;
      businessTargetHints?: string[];
    };
    wait: VerifyWaitResult;
    visibility: VerifyVisibilityResult;
  };
}
