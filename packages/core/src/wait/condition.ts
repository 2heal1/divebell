import type { RuntimeSnapshotTarget } from "../snapshot/types.js";
import type { RuntimeCondition, RuntimeDataCondition } from "./types.js";

export function matchesRuntimeCondition(
  target: RuntimeSnapshotTarget | undefined,
  condition: RuntimeCondition
): target is RuntimeSnapshotTarget {
  return target?.status === condition.status && matchesDataConditions(target.data, condition.where);
}

function matchesDataConditions(data: unknown, conditions: RuntimeDataCondition[] | undefined): boolean {
  if (conditions === undefined || conditions.length === 0) {
    return true;
  }

  return conditions.every((condition) => {
    const values = getValuesByPath(data, condition.path);
    return values.some((value) => matchesExpectedValue(value, condition.equals));
  });
}

function getValuesByPath(value: unknown, path: string): unknown[] {
  const segments = path.split(".").filter(Boolean);
  if (segments.length === 0) {
    return [value];
  }

  return segments.reduce<unknown[]>((values, segment) => {
    const next: unknown[] = [];
    for (const item of values) {
      if (Array.isArray(item)) {
        for (const entry of item) {
          next.push(...readProperty(entry, segment));
        }
        continue;
      }

      next.push(...readProperty(item, segment));
    }

    return next;
  }, [value]);
}

function readProperty(value: unknown, segment: string): unknown[] {
  if (value === null || typeof value !== "object") {
    return [];
  }

  if (!(segment in value)) {
    return [];
  }

  return [(value as Record<string, unknown>)[segment]];
}

function matchesExpectedValue(value: unknown, expected: unknown): boolean {
  if (typeof expected === "string") {
    return String(value) === expected;
  }

  return Object.is(value, expected);
}
