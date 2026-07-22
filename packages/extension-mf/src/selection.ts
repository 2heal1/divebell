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
  command: string;
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
          message: `Instance reference ${selectors.instanceRef} is not present in the current page session.`,
          hint: "Run `openruntime mf status --json` and choose a current instanceRef.",
          candidates: state.instances.map((instance) => statusCandidate(instance))
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
        message: `More than one current instance uses the name ${selectors.name}.`,
        hint: "Repeat the command with one of the candidate --instance values.",
        candidates: matched.map((instance) => statusCandidate(instance))
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
          message: `Instance reference ${selectors.instanceRef} is not present in the current page session.`,
          hint: "Run `openruntime mf status --role consumer --json` and choose a current instanceRef.",
          candidates: consumers.map(moduleInfoCandidate)
        }
      };
    }
    if (!hasRole(selected, "consumer")) {
      return {
        ok: false,
        issue: {
          code: "MF_INSTANCE_NOT_CONSUMER",
          message: `Instance ${selectors.instanceRef} is not known to be a consumer.`,
          hint: "Choose a consumer candidate. Unknown role evidence is not treated as consumer proof.",
          candidates: consumers.map(moduleInfoCandidate)
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
      message: selectors.name === undefined
        ? "More than one consumer is present in the current page."
        : `More than one consumer uses the name ${selectors.name}.`,
      hint: "Repeat the command with one of the candidate --instance values.",
      candidates: matched.map(moduleInfoCandidate)
    }
  };
}

export function listRemoteCandidates(
  consumer: RuntimeInstance,
  remoteName?: string
): RemoteCandidate[] {
  const byKey = new Map<string, RemoteCandidate>();
  for (const remote of consumer.remotes) {
    const candidate = createRemoteCandidate(consumer, remote, "declared");
    byKey.set(remoteKey(remote), candidate);
  }
  for (const remote of consumer.loadedProducers) {
    const loaded = createRemoteCandidate(consumer, remote, "loaded");
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
        message: remoteName === undefined
          ? `Consumer ${consumer.instanceRef} has no observable remotes.`
          : `Remote ${remoteName} is not declared or loaded by consumer ${consumer.instanceRef}.`,
        hint: "Run `openruntime mf status --json` to inspect the consumer's declared and loaded remotes.",
        candidates: allCandidates.map((candidate) => remoteAsInstanceCandidate(consumer, candidate))
      }
    };
  }
  return {
    ok: false,
    issue: {
      code: "MF_REMOTE_AMBIGUOUS",
      message: remoteName === undefined
        ? `Consumer ${consumer.instanceRef} has more than one remote.`
        : `Remote selector ${remoteName} matches more than one remote.`,
      hint: "Repeat the command with one of the candidate remote names and the same --instance value.",
      candidates: candidates.map((candidate) => remoteAsInstanceCandidate(consumer, candidate))
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
  return instanceCandidate(
    instance,
    `openruntime mf status --instance ${quote(instance.instanceRef)}`
  );
}

function moduleInfoCandidate(instance: RuntimeInstance): InstanceCandidate {
  return instanceCandidate(
    instance,
    `openruntime mf module-info --instance ${quote(instance.instanceRef)}`
  );
}

function instanceCandidate(instance: RuntimeInstance, command: string): InstanceCandidate {
  return {
    instanceRef: instance.instanceRef,
    name: visibleInstanceName(instance),
    ...(instance.optionsVersion === undefined ? {} : { version: instance.optionsVersion }),
    roles: instance.role === "mixed" ? ["consumer", "producer"] : [instance.role],
    command
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
    roles: ["consumer"],
    command: `${candidate.command} --instance ${quote(consumer.instanceRef)}`
  };
}

function createRemoteCandidate(
  consumer: RuntimeInstance,
  remote: RuntimeRemote,
  status: RemoteCandidate["status"]
): RemoteCandidate {
  return {
    remote,
    status,
    command: `openruntime mf module-info ${quote(remote.name)}`
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
      message: "No current Module Federation instance matches the supplied selectors.",
      hint: "Run `openruntime mf status --json` to inspect the current candidates.",
      candidates: state.instances.map(statusCandidate)
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
      message: name === undefined
        ? "No consumer is confirmed in the current observability state."
        : `No confirmed consumer uses the name ${name}.`,
      hint: "Run `openruntime mf status --json` and inspect roles and role evidence.",
      candidates: consumers.map(moduleInfoCandidate)
    }
  };
}

function quote(value: string): string {
  return JSON.stringify(value);
}
