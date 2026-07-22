import { MfCoreError } from "../errors.js";
import type { RuntimeInstance } from "../types.js";
import type { SharedInstanceSelectors } from "./types.js";

export function selectSharedInstances(
  instances: readonly RuntimeInstance[],
  selectors: SharedInstanceSelectors,
  command: "mf shared status" | "mf shared trace"
): RuntimeInstance[] {
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
