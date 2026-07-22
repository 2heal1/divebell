import type {
  BrowserObservabilitySnapshot,
  RuntimeInstance,
  RuntimeShared,
  SharedConflict
} from "../types.js";
import {
  capabilityActions,
  capabilityWarnings,
  createSharedCapabilitySummary
} from "./capability.js";
import {
  matchingSharedInstances,
  selectSharedInstances,
  visibleMfName
} from "./selection.js";
import type {
  SharedStatusInstance,
  SharedStatusPackage,
  SharedStatusResult,
  SharedStatusSelectors
} from "./types.js";

export function createSharedStatusResult(
  snapshot: BrowserObservabilitySnapshot,
  selectors: SharedStatusSelectors
): SharedStatusResult {
  const capabilityInstances = matchingSharedInstances(snapshot.state.instances, selectors);
  const capability = createSharedCapabilitySummary(
    snapshot,
    "sharedState",
    capabilityInstances
  );
  const warnings = capabilityWarnings("shared state", capability);
  const recommendedActions = capabilityActions("sharedState", capability);

  if (!capability.available) {
    return {
      schemaVersion: 1,
      command: "mf shared status",
      supported: false,
      capability,
      filters: { ...selectors },
      instances: [],
      warnings,
      recommendedActions
    };
  }

  const selectedInstances = selectSharedInstances(
    snapshot.state.instances,
    selectors,
    "mf shared status"
  );

  const instances = selectedInstances.map((instance) =>
    createInstanceStatus(snapshot, instance, selectors)
  );
  if (
    snapshot.state.completeness.history === "partial" &&
    instances.some((instance) => instance.scopes.some((scope) =>
      scope.packages.some((item) => item.conflicts.length > 0)
    ))
  ) {
    warnings.push("Current shared state is complete, but earlier conflict history may be incomplete.");
  }

  return {
    schemaVersion: 1,
    command: "mf shared status",
    supported: true,
    capability,
    filters: { ...selectors },
    instances,
    warnings: unique(warnings),
    recommendedActions: unique(recommendedActions)
  };
}

function createInstanceStatus(
  snapshot: BrowserObservabilitySnapshot,
  instance: RuntimeInstance,
  selectors: SharedStatusSelectors
): SharedStatusInstance {
  return {
    instanceRef: instance.instanceRef,
    mfName: visibleMfName(instance),
    ...(instance.runtimeVersion === undefined ? {} : { runtimeVersion: instance.runtimeVersion }),
    scopes: instance.shareScopes
      .filter((scope) => selectors.scope === undefined || scope.name === selectors.scope)
      .map((scope) => ({
        scope: scope.name,
        packages: scope.shared
          .filter((shared) => selectors.package === undefined || shared.name === selectors.package)
          .map((shared): SharedStatusPackage => {
            const availableVersions = unique(shared.versions.map((version) => version.version));
            return {
              package: shared.name,
              availableVersions,
              loadedVersions: unique(shared.versions.flatMap((version) =>
                version.loaded === true ? [version.version] : []
              )),
              versions: shared.versions.map((version) => ({ ...version })),
              conflicts: findCurrentConflicts(
                snapshot,
                instance.instanceRef,
                shared.name,
                scope.name,
                availableVersions
              )
            };
          })
      }))
  };
}

function findCurrentConflicts(
  snapshot: BrowserObservabilitySnapshot,
  instanceRef: string,
  packageName: string,
  scope: string,
  availableVersions: readonly string[]
): SharedConflict[] {
  const currentVersions = new Set(availableVersions);
  const conflicts = snapshot.reports
    .filter((report) => report.instanceRef === instanceRef)
    .flatMap((report) => [report.shared, ...report.events.map((event) => event.shared)])
    .filter((shared): shared is RuntimeShared => shared !== undefined)
    .filter((shared) => shared.name === packageName && shared.conflict?.scope === scope)
    .flatMap((shared) => shared.conflict === undefined ? [] : [shared.conflict])
    .filter((conflict) =>
      conflict.versions.length > 1 &&
      conflict.versions.every((version) => currentVersions.has(version))
    );
  return uniqueBy(conflicts, (conflict) => JSON.stringify(conflict));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const valueKey = key(value);
    if (seen.has(valueKey)) return false;
    seen.add(valueKey);
    return true;
  });
}
