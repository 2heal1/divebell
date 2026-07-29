import type { RemoteSelectionIssue } from "./types.js";

export class RemoteCoreError extends Error {
  readonly code: string;
  readonly kind: RemoteSelectionIssue["kind"];

  constructor(readonly issue: RemoteSelectionIssue) {
    super(issue.message);
    this.name = "RemoteCoreError";
    this.code = issue.code;
    this.kind = issue.kind;
  }
}
