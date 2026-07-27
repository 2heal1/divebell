import type { RemoteCoreError } from "../remote/errors.js";
import type { RemoteSelectionCandidate } from "../remote/types.js";
import { MfCommandError } from "./errors.js";
import { createCommandPresenter } from "./presenter.js";

export function remoteCoreErrorToCommandError(error: RemoteCoreError): MfCommandError {
  const presenter = createCommandPresenter(["openruntime", "mf"]);
  return new MfCommandError({
    code: error.code,
    kind: error.kind,
    message: error.message,
    hint: error.issue.hint,
    data: {
      ...(error.issue.target === undefined ? {} : { target: error.issue.target }),
      candidates: error.issue.candidates.map((candidate) => ({
        ...candidate,
        command: candidateCommand(error.issue.operation, candidate, presenter)
      }))
    }
  });
}

function candidateCommand(
  operation: RemoteCoreError["issue"]["operation"],
  candidate: RemoteSelectionCandidate,
  presenter: ReturnType<typeof createCommandPresenter>
): string {
  const target = remoteTarget(candidate);
  if (operation === "remote-status") {
    return presenter.remoteStatus({
      remote: target ?? candidate.remote ?? "unknown",
      instanceRef: candidate.instanceRef
    });
  }
  return presenter.remoteTrace({
    ...(target === undefined ? {} : { target }),
    instanceRef: candidate.instanceRef,
    ...(candidate.traceId === undefined ? {} : { traceId: candidate.traceId }),
    ...(operation === "remote-preload-trace" ? { preload: true } : {})
  });
}

function remoteTarget(candidate: RemoteSelectionCandidate): string | undefined {
  if (candidate.remote === undefined) return undefined;
  return candidate.expose === undefined
    ? candidate.remote
    : `${candidate.remote}/${candidate.expose.replace(/^\.\//, "")}`;
}
