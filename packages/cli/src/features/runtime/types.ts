import type { BridgeRuntimeInfo } from "@openruntime/bridge";
import type { RuntimeDataCondition } from "@openruntime/core";

export type Fetcher = typeof fetch;

export interface RuntimeSelector {
  runtimeId?: string;
  sessionId?: string;
  url?: string;
}

export interface RuntimeResourceResult<T> {
  runtime: BridgeRuntimeInfo;
  result: T;
}

export type VerifyTargetClass = "business" | "modern" | "module-federation" | "garfish" | "vmok" | "openruntime" | "unknown";
export type VerifyEvidenceLevel = "business" | "runtime" | "insufficient";
export type VerifyProofScope = "business-result" | "runtime-layer" | "none";
export type VerifyVisibilityStatus = "visible" | "blank" | "unknown" | "unavailable";

export interface VerifyVisibilityResult {
  checked: boolean;
  status: VerifyVisibilityStatus;
  blank: boolean | null;
  reason?: string;
  details?: {
    url?: string;
    title?: string;
    textLength?: number;
    visibleElementCount?: number;
    bodyChildElementCount?: number;
    rootChildElementCount?: number;
  };
}

export interface VerifyCommandResult {
  runtime?: BridgeRuntimeInfo;
  result: {
    success: boolean;
    condition: {
      id: string;
      status: string;
      where?: RuntimeDataCondition[];
    };
    evidence: {
      level: VerifyEvidenceLevel;
      scope: VerifyProofScope;
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
