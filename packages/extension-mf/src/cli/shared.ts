import { MfCoreError } from "../errors.js";
import { MfCommandError } from "./errors.js";

export interface SharedCommandPresenter {
  status(options?: {
    package?: string;
    scope?: string;
    version?: string;
    verbose?: boolean;
  }): string;
  trace(options?: {
    package?: string;
    mf?: string;
    instanceRef?: string;
    scope?: string;
    operationId?: string;
    traceId?: string;
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
        options.scope === undefined ? undefined : `--scope ${quote(options.scope)}`,
        options.version === undefined ? undefined : `--version ${quote(options.version)}`,
        options.verbose === true ? "--verbose" : undefined
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
        options.traceId === undefined ? undefined : `--trace-id ${quote(options.traceId)}`
      ].filter((value): value is string => value !== undefined).join(" ");
    }
  };
}

export function sharedCoreErrorToCommandError(error: unknown): never {
  if (!(error instanceof MfCoreError) || !error.code.startsWith("MF_SHARED_")) throw error;
  const presenter = createSharedCommandPresenter(["openruntime", "mf"]);
  throw new MfCommandError({
    code: error.code,
    kind: error.kind,
    message: error.message,
    hint: "Repeat `openruntime mf shared trace` with one of the current --instance values.",
    data: {
      ...error.facts,
      ...(error.candidates.length === 0
        ? {}
        : {
            candidates: error.candidates.map((candidate) => ({
              ...candidate,
              command: presenter.trace({
                instanceRef: candidate.instanceRef
              })
            }))
          })
    }
  });
}

function quote(value: string): string {
  return JSON.stringify(value);
}
