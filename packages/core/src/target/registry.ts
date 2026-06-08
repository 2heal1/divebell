import { matchesAnyValue, matchesText, matchesValue } from "../shared/query.js";
import type { RuntimeClock } from "../runtime/types.js";
import type {
  GetTargetsQuery,
  RegisterTargetInput,
  RuntimeTargetDescriptor
} from "./types.js";

export class TargetRegistry {
  readonly #clock: RuntimeClock;
  readonly #targets = new Map<string, RuntimeTargetDescriptor>();

  constructor(clock: RuntimeClock) {
    this.#clock = clock;
  }

  register(input: RegisterTargetInput): void {
    const now = this.#clock.now();
    const existing = this.#targets.get(input.id);
    const descriptor = normalizeTarget(input, existing?.registeredAt ?? now, now);

    this.#targets.set(descriptor.id, descriptor);
  }

  unregister(targetId: string): boolean {
    return this.#targets.delete(targetId);
  }

  get(targetId: string): RuntimeTargetDescriptor | undefined {
    const descriptor = this.#targets.get(targetId);
    return descriptor === undefined ? undefined : cloneTarget(descriptor);
  }

  list(query?: GetTargetsQuery): RuntimeTargetDescriptor[] {
    const descriptors = Array.from(this.#targets.values());
    return descriptors.filter((target) => matchesTarget(target, query)).map(cloneTarget);
  }
}

function normalizeTarget(
  input: RegisterTargetInput,
  registeredAt: number,
  updatedAt: number
): RuntimeTargetDescriptor {
  const id = assertNonEmptyString(input.id, "target id");
  const type = assertNonEmptyString(input.type, "target type");
  const source = assertNonEmptyString(input.source, "target source");
  const statuses = uniqueStatuses(input.statuses);

  const descriptor: RuntimeTargetDescriptor = {
    id,
    type,
    source,
    statuses,
    registeredAt,
    updatedAt
  };

  assignOptionalTargetFields(descriptor, input);
  return descriptor;
}

function assignOptionalTargetFields(
  descriptor: RuntimeTargetDescriptor,
  input: RegisterTargetInput
): void {
  if (input.label !== undefined) descriptor.label = input.label;
  if (input.description !== undefined) descriptor.description = input.description;
  if (input.params !== undefined) descriptor.params = input.params.map((param) => ({ ...param }));
  if (input.matcher !== undefined) descriptor.matcher = { ...input.matcher };
  if ("data" in input) descriptor.data = input.data;
}

function cloneTarget(target: RuntimeTargetDescriptor): RuntimeTargetDescriptor {
  const clone: RuntimeTargetDescriptor = {
    id: target.id,
    type: target.type,
    source: target.source,
    statuses: [...target.statuses],
    registeredAt: target.registeredAt,
    updatedAt: target.updatedAt
  };

  assignOptionalTargetFields(clone, target);
  return clone;
}

function uniqueStatuses(statuses: RuntimeTargetDescriptor["statuses"]): string[] {
  if (!Array.isArray(statuses) || statuses.length === 0) {
    throw new Error("target statuses must not be empty");
  }

  const unique = new Set<string>();
  for (const status of statuses) {
    unique.add(assertNonEmptyString(status, "target status"));
  }

  return [...unique];
}

function assertNonEmptyString(value: string, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value;
}

function matchesTarget(target: RuntimeTargetDescriptor, query: GetTargetsQuery | undefined): boolean {
  if (query === undefined) {
    return true;
  }

  return (
    matchesValue(target.id, query.id) &&
    matchesValue(target.type, query.type) &&
    matchesValue(target.source, query.source) &&
    matchesAnyValue(target.statuses, query.status) &&
    matchesText([target.id, target.label, target.description], query.query)
  );
}
