import { matchesText, matchesValue } from "../shared/query.js";
import type { RuntimeClock } from "../runtime/types.js";
import type { RuntimeTargetDescriptor } from "../target/types.js";
import type {
  GetSnapshotQuery,
  RuntimeSnapshot,
  RuntimeSnapshotTarget,
  UpdateSnapshotInput
} from "./types.js";

export class SnapshotStore {
  readonly #clock: RuntimeClock;
  readonly #targets = new Map<string, RuntimeSnapshotTarget>();

  constructor(clock: RuntimeClock) {
    this.#clock = clock;
  }

  update(target: RuntimeTargetDescriptor, input: UpdateSnapshotInput): RuntimeSnapshotTarget {
    const updatedAt = this.#clock.now();
    const next: RuntimeSnapshotTarget = {
      id: target.id,
      type: target.type,
      status: input.status,
      updatedAt
    };

    const source = input.source ?? target.source;
    if (source !== undefined) next.source = source;

    const description = input.description ?? target.description;
    if (description !== undefined) next.description = description;

    if ("data" in input) next.data = input.data;
    if (input.error !== undefined) next.error = { ...input.error };
    if (input.dependsOn !== undefined) next.dependsOn = [...input.dependsOn];

    this.#targets.set(next.id, next);
    return cloneSnapshotTarget(next);
  }

  remove(targetId: string): void {
    this.#targets.delete(targetId);
  }

  get(query: GetSnapshotQuery | undefined, latestEventId: number): RuntimeSnapshot {
    const targets: Record<string, RuntimeSnapshotTarget> = {};

    for (const target of this.#targets.values()) {
      if (matchesSnapshotTarget(target, query)) {
        targets[target.id] = cloneSnapshotTarget(target);
      }
    }

    return {
      targets,
      latestEventId,
      capturedAt: this.#clock.now()
    };
  }
}

function matchesSnapshotTarget(
  target: RuntimeSnapshotTarget,
  query: GetSnapshotQuery | undefined
): boolean {
  if (query === undefined) {
    return true;
  }

  return (
    matchesValue(target.id, query.id) &&
    matchesValue(target.type, query.type) &&
    matchesValue(target.source, query.source) &&
    matchesValue(target.status, query.status) &&
    matchesText([target.id, target.description], query.query)
  );
}

function cloneSnapshotTarget(target: RuntimeSnapshotTarget): RuntimeSnapshotTarget {
  const clone: RuntimeSnapshotTarget = {
    id: target.id,
    type: target.type,
    status: target.status,
    updatedAt: target.updatedAt
  };

  if (target.source !== undefined) clone.source = target.source;
  if (target.description !== undefined) clone.description = target.description;
  if ("data" in target) clone.data = target.data;
  if (target.error !== undefined) clone.error = { ...target.error };
  if (target.dependsOn !== undefined) clone.dependsOn = [...target.dependsOn];

  return clone;
}
