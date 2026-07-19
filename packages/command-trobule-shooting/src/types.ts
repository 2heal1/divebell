export type VerifyTargetClass = "business" | "modern" | "module-federation" | "garfish" | "vmok" | "openruntime" | "unknown";

export interface VerifyVisibilityResult {
  checked: boolean;
  status: "blank" | "visible" | "unavailable" | "unknown";
  blank: boolean | null;
  reason?: string;
  details?: Record<string, unknown>;
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
    wait: unknown;
    visibility: VerifyVisibilityResult;
  };
}
