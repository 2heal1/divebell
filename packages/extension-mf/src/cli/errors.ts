import type { CommandErrorKind } from "@openruntime/cli";

import type { MfCoreError } from "../errors.js";
import type { InstanceCandidate } from "../types.js";
import { createCommandPresenter } from "./presenter.js";

export class MfCommandError extends Error {
  readonly code: string;
  readonly kind: CommandErrorKind;
  readonly retryable = false;
  readonly hint?: string;
  readonly details?: Record<string, unknown>;
  readonly data?: unknown;

  constructor(options: {
    code: string;
    kind: CommandErrorKind;
    message: string;
    hint?: string;
    details?: Record<string, unknown>;
    data?: unknown;
  }) {
    super(options.message);
    this.name = "CommandError";
    this.code = options.code;
    this.kind = options.kind;
    if (options.hint !== undefined) this.hint = options.hint;
    if (options.details !== undefined) this.details = options.details;
    if (options.data !== undefined) this.data = options.data;
  }
}

export function coreErrorToCommandError(error: MfCoreError): MfCommandError {
  const presenter = createCommandPresenter(["openruntime", "mf"]);
  return new MfCommandError({
    code: error.code,
    kind: error.kind,
    message: error.message,
    hint: coreErrorHint(error),
    data: {
      ...error.facts,
      ...(error.candidates.length === 0
        ? {}
        : { candidates: presentCandidates(error, presenter) })
    }
  });
}

function presentCandidates(
  error: MfCoreError,
  presenter: ReturnType<typeof createCommandPresenter>
): Array<InstanceCandidate & { command: string }> {
  return error.candidates.map((candidate) => ({
    ...candidate,
    command: error.code.startsWith("MF_REMOTE_")
      ? presenter.moduleInfo({
          remote: candidate.name,
          instanceRef: candidate.instanceRef
        })
      : isStatusSelectionError(error)
        ? presenter.status({ instanceRef: candidate.instanceRef })
        : presenter.moduleInfo({ instanceRef: candidate.instanceRef })
  }));
}

function isStatusSelectionError(error: MfCoreError): boolean {
  return error.code === "MF_INSTANCE_NAME_AMBIGUOUS" ||
    error.code === "MF_INSTANCE_NOT_FOUND" ||
    (error.code === "MF_INSTANCE_REF_NOT_FOUND" &&
      error.facts.requiredRole !== "consumer");
}

function coreErrorHint(error: MfCoreError): string {
  switch (error.code) {
    case "MF_PAGE_NOT_FEDERATED":
      return "Confirm that the opened page uses Module Federation. If it initializes later, wait and run the command again.";
    case "MF_INSTANCE_STATE_UNAVAILABLE":
      return "Upgrade or configure the MF Observability Plugin, then reopen the page with `openruntime open <url>`.";
    case "MF_INSTANCE_REF_NOT_FOUND":
      return error.facts.requiredRole === "consumer"
        ? "Run `openruntime mf status --role consumer --json` and choose a current instanceRef."
        : "Run `openruntime mf status --json` and choose a current instanceRef.";
    case "MF_INSTANCE_NOT_CONSUMER":
      return "Choose a consumer candidate. Unknown role evidence is not treated as consumer proof.";
    case "MF_INSTANCE_NAME_AMBIGUOUS":
    case "MF_CONSUMER_AMBIGUOUS":
      return "Repeat the command with one of the candidate --instance values.";
    case "MF_REMOTE_NOT_FOUND":
      return "Run `openruntime mf status --json` to inspect the consumer's declared and loaded remotes.";
    case "MF_REMOTE_AMBIGUOUS":
      return "Repeat the command with one of the candidate remote names and the same --instance value.";
    case "MF_CONSUMER_NOT_FOUND":
      return "Run `openruntime mf status --json` and inspect roles and role evidence.";
    default:
      return "Run `openruntime mf status --json` to inspect the current candidates.";
  }
}
