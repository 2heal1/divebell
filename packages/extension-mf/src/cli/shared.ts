import { MfCoreError } from "../errors.js";
import type { InstanceCandidate } from "../types.js";
import { MfCommandError } from "./errors.js";

export interface SharedCommandPresenter {
  status(options?: {
    package?: string;
    mf?: string;
    instanceRef?: string;
    scope?: string;
    json?: boolean;
  }): string;
  trace(options?: {
    package?: string;
    mf?: string;
    instanceRef?: string;
    scope?: string;
    operationId?: string;
    traceId?: string;
    json?: boolean;
  }): string;
}

export function createSharedCommandPresenter(
  prefix: readonly string[]
): SharedCommandPresenter {
  const commandPrefix = prefix.join(" ");
  return {
    status(options = {}) {
      return [
        commandPrefix,
        "shared status",
        options.package === undefined ? undefined : quote(options.package),
        options.mf === undefined ? undefined : `--mf ${quote(options.mf)}`,
        options.instanceRef === undefined ? undefined : `--instance ${quote(options.instanceRef)}`,
        options.scope === undefined ? undefined : `--scope ${quote(options.scope)}`,
        options.json === true ? "--json" : undefined
      ].filter((value): value is string => value !== undefined).join(" ");
    },
    trace(options = {}) {
      return [
        commandPrefix,
        "shared trace",
        options.package === undefined ? undefined : quote(options.package),
        options.mf === undefined ? undefined : `--mf ${quote(options.mf)}`,
        options.instanceRef === undefined ? undefined : `--instance ${quote(options.instanceRef)}`,
        options.scope === undefined ? undefined : `--scope ${quote(options.scope)}`,
        options.operationId === undefined ? undefined : `--operation ${quote(options.operationId)}`,
        options.traceId === undefined ? undefined : `--trace-id ${quote(options.traceId)}`,
        options.json === true ? "--json" : undefined
      ].filter((value): value is string => value !== undefined).join(" ");
    }
  };
}

export function sharedCoreErrorToCommandError(error: unknown): never {
  if (!(error instanceof MfCoreError) || !error.code.startsWith("MF_SHARED_")) throw error;
  const presenter = createSharedCommandPresenter(["openruntime", "mf"]);
  const target = error.facts.command === "mf shared trace" ? "trace" : "status";
  throw new MfCommandError({
    code: error.code,
    kind: error.kind,
    message: error.message,
    hint: target === "trace"
      ? "Repeat `openruntime mf shared trace` with one of the current --instance values."
      : "Repeat `openruntime mf shared status` with one of the current --instance values.",
    data: {
      ...error.facts,
      ...(error.candidates.length === 0
        ? {}
        : {
            candidates: error.candidates.map((candidate) => ({
              ...candidate,
              command: presentInstanceCandidate(presenter, target, candidate)
            }))
          })
    }
  });
}

function presentInstanceCandidate(
  presenter: SharedCommandPresenter,
  target: "status" | "trace",
  candidate: InstanceCandidate
): string {
  return target === "trace"
    ? presenter.trace({ instanceRef: candidate.instanceRef })
    : presenter.status({ instanceRef: candidate.instanceRef });
}

function quote(value: string): string {
  return JSON.stringify(value);
}
