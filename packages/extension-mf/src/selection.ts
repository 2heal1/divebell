import type {
  InstanceCandidate,
  RoleFilter,
  RuntimeInstance,
  RuntimeRemote,
  RuntimeState,
  SelectionIssue
} from "./types.js";

export type SelectionResult<T> =
  | { ok: true; value: T }
  | { ok: false; issue: SelectionIssue };

export interface StatusSelection {
  kind: "list" | "detail";
  instances: RuntimeInstance[];
}

export interface StatusSelectors {
  name?: string;
  role?: RoleFilter;
  instanceRef?: string;
}

export interface ConsumerSelectors {
  name?: string;
  instanceRef?: string;
}

export interface RemoteCandidate {
  remote: RuntimeRemote;
  status: "declared" | "loaded";
}

export function selectStatusInstances(
  state: RuntimeState,
  selectors: StatusSelectors
): SelectionResult<StatusSelection> {
  if (selectors.instanceRef !== undefined) {
    const selected = state.instances.find(
      (instance) => instance.instanceRef === selectors.instanceRef
    );
    if (selected === undefined) {
      return {
        ok: false,
        issue: {
          code: "MF_INSTANCE_REF_NOT_FOUND",
          kind: "not_found",
          message: `Instance reference ${selectors.instanceRef} is not present in the current page session.`,
          facts: { instanceRef: selectors.instanceRef },
          candidates: state.instances.map(statusCandidate),
          recommendedActions: [{ type: "inspect-status" }]
        }
      };
    }
    if (selectors.name !== undefined && !matchesInstanceName(selected, selectors.name)) {
      return noMatchingStatus(state, selectors);
    }
    if (selectors.role !== undefined && !hasRole(selected, selectors.role)) {
      return noMatchingStatus(state, selectors);
    }
    return { ok: true, value: { kind: "detail", instances: [selected] } };
  }

  const matched = state.instances.filter((instance) =>
    (selectors.name === undefined || matchesInstanceName(instance, selectors.name)) &&
    (selectors.role === undefined || hasRole(instance, selectors.role))
  );
  if (matched.length === 0) return noMatchingStatus(state, selectors);

  if (selectors.name !== undefined && matched.length > 1) {
    return {
      ok: false,
      issue: {
        code: "MF_INSTANCE_NAME_AMBIGUOUS",
        kind: "needs_input",
        message: `More than one current instance uses the name ${selectors.name}.`,
        facts: { name: selectors.name, matchCount: matched.length },
        candidates: matched.map(statusCandidate),
        recommendedActions: matched.map((instance) => ({
          type: "select-instance" as const,
          target: "status" as const,
          instanceRef: instance.instanceRef
        }))
      }
    };
  }

  return {
    ok: true,
    value: {
      kind: selectors.name === undefined ? "list" : "detail",
      instances: matched
    }
  };
}

export function selectConsumer(
  state: RuntimeState,
  selectors: ConsumerSelectors
): SelectionResult<RuntimeInstance> {
  const consumers = state.instances.filter((instance) => hasRole(instance, "consumer"));
  if (selectors.instanceRef !== undefined) {
    const selected = state.instances.find(
      (instance) => instance.instanceRef === selectors.instanceRef
    );
    if (selected === undefined) {
      return {
        ok: false,
        issue: {
          code: "MF_INSTANCE_REF_NOT_FOUND",
          kind: "not_found",
          message: `Instance reference ${selectors.instanceRef} is not present in the current page session.`,
          facts: { instanceRef: selectors.instanceRef, requiredRole: "consumer" },
          candidates: consumers.map(moduleInfoCandidate),
          recommendedActions: [{ type: "inspect-status", role: "consumer" }]
        }
      };
    }
    if (!hasRole(selected, "consumer")) {
      return {
        ok: false,
        issue: {
          code: "MF_INSTANCE_NOT_CONSUMER",
          kind: "not_found",
          message: `Instance ${selectors.instanceRef} is not known to be a consumer.`,
          facts: {
            instanceRef: selectors.instanceRef,
            observedRole: selected.role,
            requiredRole: "consumer"
          },
          candidates: consumers.map(moduleInfoCandidate),
          recommendedActions: consumers.map((instance) => ({
            type: "select-instance" as const,
            target: "module-info" as const,
            instanceRef: instance.instanceRef
          }))
        }
      };
    }
    if (selectors.name !== undefined && !matchesInstanceName(selected, selectors.name)) {
      return noMatchingConsumer(consumers, selectors.name);
    }
    return { ok: true, value: selected };
  }

  const matched = selectors.name === undefined
    ? consumers
    : consumers.filter((instance) => matchesInstanceName(instance, selectors.name as string));
  if (matched.length === 1) return { ok: true, value: matched[0] as RuntimeInstance };
  if (matched.length === 0) return noMatchingConsumer(consumers, selectors.name);
  return {
    ok: false,
    issue: {
      code: "MF_CONSUMER_AMBIGUOUS",
      kind: "needs_input",
      message: selectors.name === undefined
        ? "More than one consumer is present in the current page."
        : `More than one consumer uses the name ${selectors.name}.`,
      facts: {
        ...(selectors.name === undefined ? {} : { name: selectors.name }),
        matchCount: matched.length
      },
      candidates: matched.map(moduleInfoCandidate),
      recommendedActions: matched.map((instance) => ({
        type: "select-instance" as const,
        target: "module-info" as const,
        instanceRef: instance.instanceRef
      }))
    }
  };
}

export function listRemoteCandidates(
  consumer: RuntimeInstance,
  remoteName?: string
): RemoteCandidate[] {
  const byKey = new Map<string, RemoteCandidate>();
  for (const remote of consumer.remotes) {
    const candidate = createRemoteCandidate(remote, "declared");
    byKey.set(remoteKey(remote), candidate);
  }
  for (const remote of consumer.loadedProducers) {
    const loaded = createRemoteCandidate(remote, "loaded");
    const matchingDeclared = Array.from(byKey.entries()).find(([, candidate]) =>
      remotesMatch(candidate.remote, remote)
    );
    if (matchingDeclared === undefined) {
      byKey.set(remoteKey(remote), loaded);
    } else {
      const [key, declared] = matchingDeclared;
      byKey.set(key, {
        ...loaded,
        remote: mergeRemote(declared.remote, remote)
      });
    }
  }
  const candidates = Array.from(byKey.values());
  return remoteName === undefined
    ? candidates
    : candidates.filter((candidate) => remoteMatchesName(candidate.remote, remoteName));
}

export function selectRemote(
  consumer: RuntimeInstance,
  remoteName?: string
): SelectionResult<RemoteCandidate> {
  const candidates = listRemoteCandidates(consumer, remoteName);
  if (candidates.length === 1) return { ok: true, value: candidates[0] as RemoteCandidate };
  const allCandidates = listRemoteCandidates(consumer);
  if (candidates.length === 0) {
    return {
      ok: false,
      issue: {
        code: "MF_REMOTE_NOT_FOUND",
        kind: "not_found",
        message: remoteName === undefined
          ? `Consumer ${consumer.instanceRef} has no observable remotes.`
          : `Remote ${remoteName} is not declared or loaded by consumer ${consumer.instanceRef}.`,
        facts: {
          consumerInstanceRef: consumer.instanceRef,
          ...(remoteName === undefined ? {} : { remoteName })
        },
        candidates: allCandidates.map((candidate) => remoteAsInstanceCandidate(consumer, candidate)),
        recommendedActions: [{ type: "inspect-status" }]
      }
    };
  }
  return {
    ok: false,
    issue: {
      code: "MF_REMOTE_AMBIGUOUS",
      kind: "needs_input",
      message: remoteName === undefined
        ? `Consumer ${consumer.instanceRef} has more than one remote.`
        : `Remote selector ${remoteName} matches more than one remote.`,
      facts: {
        consumerInstanceRef: consumer.instanceRef,
        ...(remoteName === undefined ? {} : { remoteName }),
        matchCount: candidates.length
      },
      candidates: candidates.map((candidate) => remoteAsInstanceCandidate(consumer, candidate)),
      recommendedActions: candidates.map((candidate) => ({
        type: "select-remote" as const,
        remote: candidate.remote.name,
        instanceRef: consumer.instanceRef
      }))
    }
  };
}

export function hasRole(instance: RuntimeInstance, role: RoleFilter): boolean {
  return instance.role === role || instance.role === "mixed";
}

export function visibleInstanceName(instance: RuntimeInstance): string {
  return instance.optionsName ?? instance.name ?? "unknown";
}

export function remotesMatch(left: RuntimeRemote, right: RuntimeRemote): boolean {
  const leftNames = new Set([left.name, left.alias].filter(Boolean));
  const rightNames = new Set([right.name, right.alias].filter(Boolean));
  if (Array.from(leftNames).some((name) => rightNames.has(name))) return true;
  return left.entry !== undefined && right.entry !== undefined && left.entry === right.entry;
}

function matchesInstanceName(instance: RuntimeInstance, name: string): boolean {
  return instance.name === name || instance.optionsName === name;
}

function statusCandidate(instance: RuntimeInstance): InstanceCandidate {
  return instanceCandidate(instance);
}

function moduleInfoCandidate(instance: RuntimeInstance): InstanceCandidate {
  return instanceCandidate(instance);
}

function instanceCandidate(instance: RuntimeInstance): InstanceCandidate {
  return {
    instanceRef: instance.instanceRef,
    name: visibleInstanceName(instance),
    ...(instance.optionsVersion === undefined ? {} : { version: instance.optionsVersion }),
    roles: instance.role === "mixed" ? ["consumer", "producer"] : [instance.role]
  };
}

function remoteAsInstanceCandidate(
  consumer: RuntimeInstance,
  candidate: RemoteCandidate
): InstanceCandidate {
  return {
    instanceRef: consumer.instanceRef,
    name: candidate.remote.name,
    ...(candidate.remote.version === undefined ? {} : { version: candidate.remote.version }),
    roles: ["consumer"]
  };
}

function createRemoteCandidate(
  remote: RuntimeRemote,
  status: RemoteCandidate["status"]
): RemoteCandidate {
  return {
    remote,
    status
  };
}

function remoteMatchesName(remote: RuntimeRemote, name: string): boolean {
  return remote.name === name || remote.alias === name;
}

function remoteKey(remote: RuntimeRemote): string {
  return `${remote.name}\u0000${remote.alias ?? ""}\u0000${remote.entry ?? ""}`;
}

function mergeRemote(declared: RuntimeRemote, loaded: RuntimeRemote): RuntimeRemote {
  return {
    ...declared,
    ...loaded,
    name: loaded.name || declared.name
  };
}

function noMatchingStatus(
  state: RuntimeState,
  selectors: StatusSelectors
): SelectionResult<StatusSelection> {
  return {
    ok: false,
    issue: {
      code: "MF_INSTANCE_NOT_FOUND",
      kind: "not_found",
      message: "No current Module Federation instance matches the supplied selectors.",
      facts: { selectors },
      candidates: state.instances.map(statusCandidate),
      recommendedActions: [{ type: "inspect-status" }]
    }
  };
}

function noMatchingConsumer(
  consumers: RuntimeInstance[],
  name: string | undefined
): SelectionResult<RuntimeInstance> {
  return {
    ok: false,
    issue: {
      code: "MF_CONSUMER_NOT_FOUND",
      kind: "not_found",
      message: name === undefined
        ? "No consumer is confirmed in the current observability state."
        : `No confirmed consumer uses the name ${name}.`,
      facts: {
        requiredRole: "consumer",
        ...(name === undefined ? {} : { name })
      },
      candidates: consumers.map(moduleInfoCandidate),
      recommendedActions: [{ type: "inspect-status", role: "consumer" }]
    }
  };
}
