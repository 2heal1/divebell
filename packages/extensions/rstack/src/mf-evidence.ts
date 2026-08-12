import type { CliExtensionRunFunction } from "@divebell/cli";

import { errorMessage } from "./errors.js";
import type {
  MfRuntimeEvidence,
  RuntimeCandidate,
  SharedProviderEvidence
} from "./types.js";

interface MfStatus {
  instances?: Array<{
    instanceRef?: string;
    name?: string;
    role?: string;
    remotes?: Array<{
      name?: string;
      alias?: string;
    }>;
  }>;
  relationships?: Array<{
    consumerInstanceRef?: string;
    producerInstanceRef?: string;
    candidateProducerInstanceRefs?: string[];
    remote?: { name?: string; alias?: string };
    status?: string;
  }>;
}

interface ModuleInfo {
  consumer?: { instanceRef?: string };
  remote?: {
    name?: string;
    producerInstanceRef?: string;
    remoteEntryUrl?: string;
    publicPath?: string;
  };
}

interface SharedTrace {
  selection?: { kind?: string };
  operations?: Array<{
    instanceRef?: string;
    mfName?: string;
    scopes?: string[];
    selectedVersion?: string;
    provider?: string;
    operationId?: string;
  }>;
}

export interface MfEvidence {
  runtime: MfRuntimeEvidence;
  react: SharedProviderEvidence;
  reactDom: SharedProviderEvidence;
}

export async function collectMfEvidence(
  runExtension: CliExtensionRunFunction
): Promise<MfEvidence> {
  const runtime = await collectRuntimeEvidence(runExtension);
  const consumerInstanceRefs = runtime.instances
    .filter((instance) => instance.role === "consumer" || instance.role === "mixed")
    .map((instance) => instance.instanceRef);
  const [react, reactDom] = await Promise.all([
    collectSharedEvidence(runExtension, "react", consumerInstanceRefs),
    collectSharedEvidence(runExtension, "react-dom", consumerInstanceRefs)
  ]);
  return { runtime, react, reactDom };
}

async function collectRuntimeEvidence(
  runExtension: CliExtensionRunFunction
): Promise<MfRuntimeEvidence> {
  let status: MfStatus;
  try {
    status = await runExtension<MfStatus>("mf", {
      command: "mf",
      args: ["status"],
      options: { verbose: true }
    });
  } catch (error) {
    return {
      status: errorCode(error) === "MF_PAGE_NOT_FEDERATED"
        ? "not-observed"
        : "unavailable",
      instances: [],
      remoteEntries: [],
      reason: errorMessage(error)
    };
  }

  const instances = (status.instances ?? []).flatMap((instance) =>
    typeof instance.instanceRef === "string"
    && typeof instance.name === "string"
    && typeof instance.role === "string"
      ? [{
          instanceRef: instance.instanceRef,
          name: instance.name,
          role: instance.role
        }]
      : []
  );
  const entries: MfRuntimeEvidence["remoteEntries"] = [];
  for (const instance of status.instances ?? []) {
    if (typeof instance.instanceRef !== "string") continue;
    for (const remote of instance.remotes ?? []) {
      const remoteName = remote.alias ?? remote.name;
      if (remoteName === undefined) continue;
      try {
        const info = await runExtension<ModuleInfo>("mf", {
          command: "mf",
          args: ["module-info", remoteName],
          options: { instance: instance.instanceRef }
        });
        const selected = info.remote;
        if (selected?.name === undefined) continue;
        entries.push({
          consumerInstanceRef: instance.instanceRef,
          remote: selected.name,
          ...(selected.producerInstanceRef === undefined
            ? {}
            : { producerInstanceRef: selected.producerInstanceRef }),
          ...(selected.remoteEntryUrl === undefined
            ? {}
            : { remoteEntryUrl: selected.remoteEntryUrl }),
          ...(selected.publicPath === undefined
            ? {}
            : { publicPath: selected.publicPath })
        });
      } catch {
        // A declared but unloaded remote has no exact runtime entry evidence.
      }
    }
  }

  return {
    status: instances.length === 0 ? "not-observed" : "observed",
    instances,
    remoteEntries: uniqueBy(
      entries,
      (entry) => `${entry.consumerInstanceRef}\u0000${entry.remote}\u0000${entry.remoteEntryUrl ?? ""}`
    )
  };
}

async function collectSharedEvidence(
  runExtension: CliExtensionRunFunction,
  packageName: "react" | "react-dom",
  consumerInstanceRefs: readonly string[]
): Promise<SharedProviderEvidence> {
  if (consumerInstanceRefs.length === 0) {
    return {
      status: "not-observed",
      package: packageName,
      operations: [],
      reason: "No current Module Federation consumer runtime was observed."
    };
  }

  const settled = await Promise.all(consumerInstanceRefs.map(async (instanceRef) => {
    try {
      return {
        instanceRef,
        trace: await runExtension<SharedTrace>("mf", {
          command: "mf",
          args: ["shared", "trace", packageName],
          options: { instance: instanceRef }
        })
      };
    } catch (error) {
      return { instanceRef, error };
    }
  }));
  const traces = settled.flatMap((item) => "trace" in item ? [item.trace] : []);
  const errors = settled.flatMap((item) => "error" in item
    ? [`${item.instanceRef}: ${errorMessage(item.error)}`]
    : []
  );
  const operations = traces.flatMap((trace) =>
    (trace.operations ?? []).flatMap((operation) =>
      typeof operation.instanceRef === "string"
      && typeof operation.mfName === "string"
        ? [{
            instanceRef: operation.instanceRef,
            mfName: operation.mfName,
            scopes: operation.scopes ?? [],
            ...(operation.selectedVersion === undefined
              ? {}
              : { selectedVersion: operation.selectedVersion }),
            ...(operation.provider === undefined
              ? {}
              : { provider: operation.provider }),
            ...(operation.operationId === undefined
              ? {}
              : { operationId: operation.operationId })
          }]
        : []
    )
  );
  const uniqueOperations = uniqueBy(
    operations,
    (operation) => [
      operation.instanceRef,
      operation.mfName,
      operation.scopes.join(","),
      operation.operationId ?? "",
      operation.selectedVersion ?? "",
      operation.provider ?? ""
    ].join("\u0000")
  );
  return {
    status: traces.some((trace) => trace.selection?.kind === "ambiguous")
      ? "ambiguous"
      : uniqueOperations.length > 0
        ? "observed"
        : errors.length > 0
          ? "unavailable"
          : "not-observed",
    package: packageName,
    operations: uniqueOperations,
    ...(errors.length === 0 ? {} : { reason: errors.join("; ") })
  };
}

export function applyMfRuntimeOwners<Runtime extends RuntimeCandidate>(
  runtimes: Runtime[],
  evidence: MfRuntimeEvidence
): Runtime[] {
  return runtimes.map((runtime) => {
    if (runtime.url.length === 0 || evidence.status !== "observed") return runtime;
    const exact = evidence.remoteEntries.filter((entry) =>
      entry.remoteEntryUrl !== undefined
      && normalizeUrl(entry.remoteEntryUrl) === normalizeUrl(runtime.url)
    );
    const prefix = exact.length > 0 ? [] : evidence.remoteEntries.filter((entry) =>
      entry.publicPath !== undefined
      && normalizeUrl(runtime.url).startsWith(normalizeUrl(entry.publicPath))
    );
    const matches = exact.length > 0 ? exact : prefix;
    const ownerIds = Array.from(new Set(matches.map((entry) =>
      entry.producerInstanceRef ?? `remote:${entry.remote}`
    )));
    if (ownerIds.length === 1) {
      return {
        ...runtime,
        owner: {
          status: "resolved",
          kind: "remote",
          ownerId: ownerIds[0] as string,
          confidence: exact.length > 0 ? "high" : "medium",
          evidence: [exact.length > 0 ? "mf.remote-entry-url" : "mf.remote-public-path"],
          candidates: ownerIds
        }
      } as Runtime;
    }
    if (ownerIds.length > 1) {
      return {
        ...runtime,
        owner: {
          status: "ambiguous",
          kind: "unknown",
          confidence: "low",
          evidence: [exact.length > 0 ? "mf.remote-entry-url" : "mf.remote-public-path"],
          candidates: ownerIds
        }
      } as Runtime;
    }
    const hostCandidates = evidence.instances
      .filter((instance) => instance.role === "consumer" || instance.role === "mixed")
      .map((instance) => instance.instanceRef);
    return {
      ...runtime,
      owner: {
        ...runtime.owner,
        candidates: hostCandidates,
        ...(hostCandidates.length === 0
          ? {}
          : { evidence: ["mf.consumer-candidate-only"] })
      }
    } as Runtime;
  });
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return value.replace(/#.*$/u, "");
  }
}

function errorCode(error: unknown): string | undefined {
  return error !== null
    && typeof error === "object"
    && "code" in error
    && typeof error.code === "string"
      ? error.code
      : undefined;
}

function uniqueBy<Value>(values: Value[], key: (value: Value) => string): Value[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const current = key(value);
    if (seen.has(current)) return false;
    seen.add(current);
    return true;
  });
}
