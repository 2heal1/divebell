import { remotesMatch, visibleInstanceName } from "../selection.js";
import type {
  RuntimeInstance,
  RuntimeState
} from "../types.js";
import type {
  BridgeCurrentState,
  BridgeInstanceCandidate,
  BridgeOperationCandidate,
  BridgeOperationTrace,
  BridgeTraceSelectionKind,
  BridgeTraceSelectors
} from "./types.js";

export interface BridgeTraceSelection {
  kind: BridgeTraceSelectionKind;
  operations: BridgeOperationTrace[];
  currentStates: BridgeCurrentState[];
  candidates: BridgeOperationCandidate[];
  instanceCandidates: BridgeInstanceCandidate[];
}

export function selectBridgeTrace(
  state: RuntimeState,
  operations: readonly BridgeOperationTrace[],
  currentStates: readonly BridgeCurrentState[],
  selectors: BridgeTraceSelectors
): BridgeTraceSelection {
  const instanceSelection = selectInstances(state.instances, selectors);
  const selectedRefs = new Set(
    instanceSelection.instances.map((instance) => instance.instanceRef)
  );
  const scopedOperations = operations.filter((operation) =>
    operation.instance.instanceRef === undefined
      ? selectors.instanceRef === undefined && selectors.name === undefined
      : selectedRefs.has(operation.instance.instanceRef)
  );
  const scopedStates = currentStates.filter((current) =>
    selectedRefs.has(current.instance.instanceRef)
  );

  if (instanceSelection.kind !== "ok") {
    return {
      kind: instanceSelection.kind === "ambiguous" ? "candidates" : "not-found",
      operations: [],
      currentStates: scopedStates,
      candidates: operationCandidates(scopedOperations),
      instanceCandidates: instanceSelection.candidates
    };
  }

  const matchedOperations = scopedOperations.filter((operation) =>
    operationMatches(operation, state, selectors)
  );
  const matchedStates = scopedStates.filter((current) =>
    currentStateMatches(current, state, selectors)
  );
  const detailRequested = selectors.remote !== undefined ||
    selectors.operationId !== undefined;

  if (!detailRequested) {
    return {
      kind: matchedOperations.length === 0 ? "not-found" : "summary",
      operations: matchedOperations,
      currentStates: matchedStates,
      candidates: [],
      instanceCandidates: []
    };
  }
  if (matchedOperations.length === 1) {
    return {
      kind: "operation",
      operations: matchedOperations,
      currentStates: matchedStates,
      candidates: [],
      instanceCandidates: []
    };
  }
  if (matchedOperations.length > 1) {
    return {
      kind: "candidates",
      operations: [],
      currentStates: matchedStates,
      candidates: operationCandidates(matchedOperations),
      instanceCandidates: []
    };
  }

  const alternatives = scopedOperations.filter((operation) =>
    selectors.bridgeId === undefined || operation.bridgeIds.includes(selectors.bridgeId)
  );
  return {
    kind: "not-found",
    operations: [],
    currentStates: matchedStates,
    candidates: operationCandidates(alternatives),
    instanceCandidates: []
  };
}

export function operationCandidates(
  operations: readonly BridgeOperationTrace[]
): BridgeOperationCandidate[] {
  return operations.flatMap((operation) => {
    if (operation.operationId === undefined) return [];
    return operation.sides.map((side) => {
      const remote = side.remote ?? operation.remote;
      return {
        ...(operation.instance.instanceRef === undefined
          ? {}
          : { instanceRef: operation.instance.instanceRef }),
        instanceName: operation.instance.name,
        bridgeId: side.bridgeId,
        operationId: operation.operationId as string,
        side: side.side,
        operation: side.operation,
        ...(remote === undefined ? {} : { remote })
      };
    });
  });
}

function selectInstances(
  instances: readonly RuntimeInstance[],
  selectors: BridgeTraceSelectors
): {
  kind: "ok" | "ambiguous" | "not-found";
  instances: RuntimeInstance[];
  candidates: BridgeInstanceCandidate[];
} {
  if (selectors.instanceRef !== undefined) {
    const instance = instances.find((item) => item.instanceRef === selectors.instanceRef);
    if (
      instance === undefined ||
      (selectors.name !== undefined && !matchesInstanceName(instance, selectors.name))
    ) {
      return {
        kind: "not-found",
        instances: [],
        candidates: instances.map(instanceCandidate)
      };
    }
    return { kind: "ok", instances: [instance], candidates: [] };
  }

  if (selectors.name === undefined) {
    return { kind: "ok", instances: [...instances], candidates: [] };
  }

  const matched = instances.filter((instance) =>
    matchesInstanceName(instance, selectors.name as string)
  );
  if (matched.length === 0) {
    return {
      kind: "not-found",
      instances: [],
      candidates: instances.map(instanceCandidate)
    };
  }
  if (matched.length > 1) {
    return {
      kind: "ambiguous",
      instances: matched,
      candidates: matched.map(instanceCandidate)
    };
  }
  return { kind: "ok", instances: matched, candidates: [] };
}

function operationMatches(
  operation: BridgeOperationTrace,
  state: RuntimeState,
  selectors: BridgeTraceSelectors
): boolean {
  return (selectors.bridgeId === undefined || operation.bridgeIds.includes(selectors.bridgeId)) &&
    (selectors.operationId === undefined || operation.operationId === selectors.operationId) &&
    (selectors.remote === undefined || traceRemoteMatches(
      state,
      operation.instance.instanceRef,
      operationRemoteNames(operation),
      selectors.remote
    ));
}

function currentStateMatches(
  current: BridgeCurrentState,
  state: RuntimeState,
  selectors: BridgeTraceSelectors
): boolean {
  return (selectors.bridgeId === undefined || current.bridgeId === selectors.bridgeId) &&
    (selectors.operationId === undefined || current.lastOperationId === selectors.operationId) &&
    (selectors.remote === undefined || traceRemoteMatches(
      state,
      current.instance.instanceRef,
      remoteNames(current.remote, current.moduleName),
      selectors.remote
    ));
}

function traceRemoteMatches(
  state: RuntimeState,
  instanceRef: string | undefined,
  traceNames: string[],
  selector: string
): boolean {
  if (traceNames.includes(selector)) return true;
  if (instanceRef === undefined) return false;
  const instance = state.instances.find((item) => item.instanceRef === instanceRef);
  if (instance === undefined) return false;
  return [...instance.remotes, ...instance.loadedProducers].some((remote) =>
    (remote.name === selector || remote.alias === selector) &&
    traceNames.some((name) => remotesMatch(remote, { name }))
  );
}

function operationRemoteNames(operation: BridgeOperationTrace): string[] {
  return Array.from(new Set([
    ...remoteNames(operation.remote, operation.moduleName),
    ...operation.sides.flatMap((side) => remoteNames(side.remote, side.moduleName))
  ]));
}

function remoteNames(remote: string | undefined, moduleName: string | undefined): string[] {
  const moduleRemote = moduleName?.split("/", 1)[0];
  return [remote, moduleRemote]
    .filter((name): name is string => name !== undefined && name.length > 0);
}

function matchesInstanceName(instance: RuntimeInstance, name: string): boolean {
  return instance.name === name || instance.optionsName === name;
}

function instanceCandidate(instance: RuntimeInstance): BridgeInstanceCandidate {
  return {
    instanceRef: instance.instanceRef,
    name: visibleInstanceName(instance)
  };
}
