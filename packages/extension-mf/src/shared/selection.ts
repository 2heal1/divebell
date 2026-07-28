import { MfCoreError } from "../errors.js";
import type {
  InstanceCandidate,
  RuntimeInstance,
  RuntimeRelationship
} from "../types.js";
import type { SharedInstanceSelectors } from "./types.js";

export function selectSharedInstances(
  instances: readonly RuntimeInstance[],
  selectors: SharedInstanceSelectors,
  command: "mf shared status" | "mf shared trace",
  relationships: readonly RuntimeRelationship[] = []
): RuntimeInstance[] {
  if (command === "mf shared trace") {
    return selectSharedTraceConsumers(
      instances,
      selectors,
      relationships
    );
  }
  const selected = matchingSharedInstances(instances, selectors);

  if (selected.length > 0) return [...selected];

  const code = selectors.instanceRef === undefined
    ? "MF_SHARED_INSTANCE_NOT_FOUND"
    : "MF_SHARED_INSTANCE_REF_NOT_FOUND";
  throw new MfCoreError({
    code,
    kind: "not_found",
    message: selectors.instanceRef === undefined
      ? "No current Module Federation instance matches the supplied shared selectors."
      : `Instance reference ${selectors.instanceRef} is not present in the selected current page state.`,
    facts: { command, selectors },
    candidates: instances.map((instance) => ({
      instanceRef: instance.instanceRef,
      name: visibleMfName(instance),
      ...(instance.optionsVersion === undefined ? {} : { version: instance.optionsVersion }),
      roles: instance.role === "mixed" ? ["consumer", "producer"] : [instance.role]
    })),
    recommendedActions: [{ type: "inspect-status" }]
  });
}

function selectSharedTraceConsumers(
  instances: readonly RuntimeInstance[],
  selectors: SharedInstanceSelectors,
  relationships: readonly RuntimeRelationship[]
): RuntimeInstance[] {
  const consumers = instances.filter(isConsumer);
  if (selectors.instanceRef !== undefined || selectors.mf !== undefined) {
    const selected = matchingSharedInstances(consumers, selectors);
    if (selected.length > 0) return selected;
    throw sharedConsumerNotFound(consumers, selectors);
  }

  const producedInstanceRefs = new Set(
    relationships.flatMap((relationship) =>
      relationship.producerInstanceRef === undefined
        ? []
        : [relationship.producerInstanceRef]
    )
  );
  const topLevelConsumer = consumers.find(
    (instance) => !producedInstanceRefs.has(instance.instanceRef)
  );
  const selected = topLevelConsumer ?? consumers[0];
  if (selected !== undefined) return [selected];
  throw sharedConsumerNotFound(consumers, selectors);
}

function sharedConsumerNotFound(
  consumers: readonly RuntimeInstance[],
  selectors: SharedInstanceSelectors
): MfCoreError {
  return new MfCoreError({
    code: "MF_SHARED_CONSUMER_NOT_FOUND",
    kind: "not_found",
    message: selectors.instanceRef === undefined && selectors.mf === undefined
      ? "No current Module Federation consumer is available for the shared trace."
      : "No current Module Federation consumer matches the supplied shared trace selectors.",
    facts: {
      command: "mf shared trace",
      selectors,
      requiredRole: "consumer"
    },
    candidates: consumers.map(instanceCandidate),
    recommendedActions: [{ type: "inspect-status", role: "consumer" }]
  });
}

function isConsumer(instance: RuntimeInstance): boolean {
  return instance.role === "consumer" || instance.role === "mixed";
}

function instanceCandidate(instance: RuntimeInstance): InstanceCandidate {
  return {
    instanceRef: instance.instanceRef,
    name: visibleMfName(instance),
    ...(instance.optionsVersion === undefined
      ? {}
      : { version: instance.optionsVersion }),
    roles: instance.role === "mixed"
      ? ["consumer", "producer"]
      : [instance.role]
  };
}

export function matchingSharedInstances(
  instances: readonly RuntimeInstance[],
  selectors: SharedInstanceSelectors
): RuntimeInstance[] {
  return instances.filter((instance) =>
    (selectors.instanceRef === undefined || instance.instanceRef === selectors.instanceRef) &&
    (selectors.mf === undefined || matchesMfName(instance, selectors.mf))
  );
}

export function visibleMfName(instance: RuntimeInstance): string {
  return instance.optionsName ?? instance.name ?? "unknown";
}

function matchesMfName(instance: RuntimeInstance, name: string): boolean {
  return instance.optionsName === name || instance.name === name;
}
