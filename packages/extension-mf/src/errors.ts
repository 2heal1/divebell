import type {
  InstanceCandidate,
  MfIssueKind,
  MfRecommendedAction
} from "./types.js";

export interface MfCoreIssue {
  code: string;
  kind: MfIssueKind;
  message: string;
  facts: Record<string, unknown>;
  candidates: InstanceCandidate[];
  recommendedActions: MfRecommendedAction[];
}

export class MfCoreError extends Error {
  readonly code: string;
  readonly kind: MfIssueKind;
  readonly facts: Record<string, unknown>;
  readonly candidates: InstanceCandidate[];
  readonly recommendedActions: MfRecommendedAction[];

  constructor(readonly issue: MfCoreIssue) {
    super(issue.message);
    this.name = "MfCoreError";
    this.code = issue.code;
    this.kind = issue.kind;
    this.facts = issue.facts;
    this.candidates = issue.candidates;
    this.recommendedActions = issue.recommendedActions;
  }
}
