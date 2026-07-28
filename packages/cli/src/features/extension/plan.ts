import type {
  DivebellDetectStackHook,
  DivebellExtensionDefinition,
  DivebellOpenHook
} from "../../types/commands.js";

export type ExtensionOrderedHookName = "open" | "detectStack";

export interface ExtensionHookPlanFailure {
  extension: string;
  hook: ExtensionOrderedHookName;
  message: string;
}

export interface ExtensionHookPlan {
  hook: ExtensionOrderedHookName;
  batches: readonly (readonly string[])[];
  failures: readonly ExtensionHookPlanFailure[];
}

export interface ExtensionHookPlans {
  open: ExtensionHookPlan;
  detectStack: ExtensionHookPlan;
}

interface HookNode {
  name: string;
  before: readonly string[];
  after: readonly string[];
}

export function createExtensionHookPlans(
  extensions: readonly DivebellExtensionDefinition[]
): ExtensionHookPlans {
  return {
    open: createExtensionHookPlan(extensions, "open"),
    detectStack: createExtensionHookPlan(extensions, "detectStack")
  };
}

export function createExtensionHookPlan(
  extensions: readonly DivebellExtensionDefinition[],
  hook: ExtensionOrderedHookName
): ExtensionHookPlan {
  const order = new Map(extensions.map((extension, index) => [extension.name, index]));
  const nodes = new Map<string, HookNode>();
  for (const extension of extensions) {
    const definition = extension.hooks?.[hook];
    if (definition === undefined) continue;
    const ordered = typeof definition === "function" ? undefined : definition;
    nodes.set(extension.name, {
      name: extension.name,
      before: ordered?.before ?? [],
      after: ordered?.after ?? []
    });
  }

  const skipped = new Map<string, string>();
  const cyclicGroups = findCyclicGroups(nodes, skipped, order);
  for (const group of cyclicGroups) {
    for (const name of group) {
      skipped.set(
        name,
        `Extension ${hook} hook ordering cycle detected among: ${group.join(", ")}.`
      );
    }
  }
  const { outgoing, incomingCount } = createEdges(nodes, skipped);
  const batches: string[][] = [];
  let ready = [...nodes.keys()]
    .filter((name) => !skipped.has(name) && incomingCount.get(name) === 0)
    .sort((left, right) => compareOrder(left, right, order));
  let visited = 0;
  while (ready.length > 0) {
    const batch = ready;
    batches.push(batch);
    visited += batch.length;
    const next: string[] = [];
    for (const name of batch) {
      for (const target of outgoing.get(name) ?? []) {
        const remaining = (incomingCount.get(target) ?? 0) - 1;
        incomingCount.set(target, remaining);
        if (remaining === 0) next.push(target);
      }
    }
    ready = next.sort((left, right) => compareOrder(left, right, order));
  }

  const expected = [...nodes.keys()].filter((name) => !skipped.has(name)).length;
  if (visited !== expected) {
    throw new Error(`Could not create the Extension ${hook} hook execution plan.`);
  }

  return {
    hook,
    batches,
    failures: [...skipped.entries()]
      .sort(([left], [right]) => compareOrder(left, right, order))
      .map(([extension, message]) => ({ extension, hook, message }))
  };
}

export function getOpenHook(
  extension: DivebellExtensionDefinition
): DivebellOpenHook | undefined {
  const hook = extension.hooks?.open;
  if (hook === undefined) return undefined;
  return typeof hook === "function" ? hook : hook.run;
}

export function getDetectStackHook(
  extension: DivebellExtensionDefinition
): DivebellDetectStackHook | undefined {
  const hook = extension.hooks?.detectStack;
  if (hook === undefined) return undefined;
  return typeof hook === "function" ? hook : hook.run;
}

function createEdges(
  nodes: ReadonlyMap<string, HookNode>,
  skipped: ReadonlyMap<string, string>
): {
  outgoing: Map<string, Set<string>>;
  incomingCount: Map<string, number>;
} {
  const outgoing = new Map<string, Set<string>>();
  const incomingCount = new Map<string, number>();
  for (const name of nodes.keys()) {
    if (skipped.has(name)) continue;
    outgoing.set(name, new Set());
    incomingCount.set(name, 0);
  }
  const addEdge = (from: string, to: string): void => {
    if (
      from === to
      || skipped.has(from)
      || skipped.has(to)
      || !nodes.has(from)
      || !nodes.has(to)
    ) {
      return;
    }
    const targets = outgoing.get(from);
    if (targets === undefined || targets.has(to)) return;
    targets.add(to);
    incomingCount.set(to, (incomingCount.get(to) ?? 0) + 1);
  };
  for (const node of nodes.values()) {
    for (const target of node.before) addEdge(node.name, target);
    for (const source of node.after) addEdge(source, node.name);
  }
  return { outgoing, incomingCount };
}

function findCyclicGroups(
  nodes: ReadonlyMap<string, HookNode>,
  skipped: ReadonlyMap<string, string>,
  order: ReadonlyMap<string, number>
): string[][] {
  const { outgoing } = createEdges(nodes, skipped);
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const groups: string[][] = [];
  let nextIndex = 0;

  const visit = (name: string): void => {
    indices.set(name, nextIndex);
    lowLinks.set(name, nextIndex);
    nextIndex += 1;
    stack.push(name);
    onStack.add(name);

    for (const target of outgoing.get(name) ?? []) {
      if (!indices.has(target)) {
        visit(target);
        lowLinks.set(name, Math.min(lowLinks.get(name) ?? 0, lowLinks.get(target) ?? 0));
      } else if (onStack.has(target)) {
        lowLinks.set(name, Math.min(lowLinks.get(name) ?? 0, indices.get(target) ?? 0));
      }
    }

    if (lowLinks.get(name) !== indices.get(name)) return;
    const group: string[] = [];
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) break;
      onStack.delete(current);
      group.push(current);
      if (current === name) break;
    }
    if (group.length > 1) {
      groups.push(group.sort((left, right) => compareOrder(left, right, order)));
    }
  };

  for (const name of nodes.keys()) {
    if (!skipped.has(name) && !indices.has(name)) visit(name);
  }
  return groups;
}

function compareOrder(
  left: string,
  right: string,
  order: ReadonlyMap<string, number>
): number {
  return (order.get(left) ?? Number.MAX_SAFE_INTEGER)
    - (order.get(right) ?? Number.MAX_SAFE_INTEGER);
}
