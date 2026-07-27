import type {
  BrowserObservabilitySnapshot,
  CapabilityName,
  RuntimeInstance
} from "../types.js";
import type { SharedCapabilitySummary } from "./types.js";

export const MINIMUM_SHARED_TRACE_RUNTIME = "2.5.0";
const INJECTED_MF_PREVIEW_VERSION =
  "0.0.0-feat-operate-openruntime-20260722064424";

export function createSharedCapabilitySummary(
  snapshot: BrowserObservabilitySnapshot,
  capabilityName: Extract<CapabilityName, "sharedState" | "sharedTrace">,
  instances: readonly RuntimeInstance[]
): SharedCapabilitySummary {
  const reportedCapability = snapshot.state.capabilities[capabilityName];
  const capability = capabilityName === "sharedTrace" &&
      reportedCapability.available === false &&
      reasonRequiresStableRuntime(reportedCapability.reason) &&
      snapshot.observabilityMode === "injected" &&
      snapshot.injection?.source === "openruntime/extension-mf" &&
      snapshot.injection.status !== "error" &&
      snapshot.observabilityVersion === INJECTED_MF_PREVIEW_VERSION &&
      snapshot.injection.observabilityVersion === INJECTED_MF_PREVIEW_VERSION &&
      instances.length > 0 &&
      instances.every((instance) =>
        instance.runtimeVersion === INJECTED_MF_PREVIEW_VERSION
      )
    ? {
        available: true,
        completeness: snapshot.state.completeness.history,
        reason: "No shared lifecycle signal has been observed yet."
      } as const
    : reportedCapability;
  const runtimeVersions = unique(instances.flatMap((instance) =>
    instance.runtimeVersion === undefined ? [] : [instance.runtimeVersion]
  ));
  const versionTooLow = capabilityName === "sharedTrace" &&
    capability.available === false &&
    reasonRequiresStableRuntime(capability.reason) &&
    runtimeVersions.some((version) => isVersionBelow(version, MINIMUM_SHARED_TRACE_RUNTIME));

  return {
    ...capability,
    runtimeVersions,
    runtimeVersionKnown: runtimeVersions.length > 0,
    ...(versionTooLow ? { minimumRuntimeVersion: MINIMUM_SHARED_TRACE_RUNTIME } : {})
  };
}

export function capabilityWarnings(
  label: "shared state" | "shared trace",
  capability: SharedCapabilitySummary
): string[] {
  if (!capability.available) {
    if (capability.minimumRuntimeVersion !== undefined) {
      return [
        `The observed MF runtime (${capability.runtimeVersions.join(", ")}) does not meet the stable shared trace requirement. Upgrade to ${capability.minimumRuntimeVersion} or newer.`
      ];
    }
    return [
      capability.runtimeVersionKnown
        ? `${label} is unavailable: ${capability.reason ?? "the reader did not expose this capability."}`
        : `${label} is unavailable and the runtime version is unknown: ${capability.reason ?? "the reader did not expose this capability."}`
    ];
  }
  if (capability.completeness !== "complete") {
    return [
      `${label} is ${capability.completeness}: ${capability.reason ?? "only the available facts can be confirmed."}`
    ];
  }
  return [];
}

export function capabilityActions(
  capabilityName: "sharedState" | "sharedTrace",
  capability: SharedCapabilitySummary
): string[] {
  if (capability.available && capability.completeness === "complete") return [];
  if (capability.minimumRuntimeVersion !== undefined) {
    return [`Upgrade Module Federation runtime to ${capability.minimumRuntimeVersion} or newer, reopen the page, and retry.`];
  }
  return [
    `Configure or upgrade the MF Observability Plugin so ${capabilityName} is available, then reopen the page.`
  ];
}

function reasonRequiresStableRuntime(reason: string | undefined): boolean {
  return reason !== undefined &&
    /stable runtime|runtime version|2\.5\.0|newer/i.test(reason);
}

function isVersionBelow(version: string, minimum: string): boolean {
  const left = parseVersion(version);
  const right = parseVersion(minimum);
  if (left === undefined || right === undefined) return false;
  for (let index = 0; index < 3; index += 1) {
    if ((left[index] as number) < (right[index] as number)) return true;
    if ((left[index] as number) > (right[index] as number)) return false;
  }
  return false;
}

function parseVersion(version: string): [number, number, number] | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+]|$)/.exec(version.trim());
  return match === null
    ? undefined
    : [Number(match[1]), Number(match[2]), Number(match[3])];
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
