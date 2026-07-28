import { createDivebell } from "./center.js";
import type { DivebellCore } from "./types.js";

export interface DivebellWindowHost {
  __DIVEBELL__?: DivebellCore;
  __DIVEBELL_REGISTRY__?: DivebellRegistry;
}

export interface DivebellInstanceOptions {
  runtimeId?: string;
  name?: string;
  source?: string;
  parentRuntimeId?: string;
  renderId?: string;
}

export interface DivebellInstance extends DivebellInstanceOptions {
  runtimeId: string;
  runtime: DivebellCore;
}

export type DivebellRegistryEvent =
  | { type: "registered"; instance: DivebellInstance }
  | { type: "unregistered"; instance: DivebellInstance };

export interface DivebellRegistry {
  register(runtime: DivebellCore, options?: DivebellInstanceOptions): DivebellInstance;
  unregister(runtimeOrId: DivebellCore | string): boolean;
  list(): DivebellInstance[];
  subscribe(listener: (event: DivebellRegistryEvent) => void): () => void;
}

export function installDivebellOnWindow(
  runtime: DivebellCore = createDivebell(),
  host: DivebellWindowHost | undefined = getDefaultWindowHost(),
  options: DivebellInstanceOptions = {}
): DivebellCore {
  if (host === undefined) {
    return runtime;
  }

  const registry = getOrCreateDivebellRegistry(host);
  registry.register(runtime, options);
  host.__DIVEBELL__ ??= runtime;
  return runtime;
}

export function uninstallDivebellFromWindow(
  runtimeOrId: DivebellCore | string,
  host: DivebellWindowHost | undefined = getDefaultWindowHost()
): boolean {
  if (host?.__DIVEBELL_REGISTRY__ === undefined) {
    return false;
  }

  const removedDefault = typeof runtimeOrId === "string"
    ? host.__DIVEBELL_REGISTRY__.list().find((instance) => instance.runtimeId === runtimeOrId)?.runtime === host.__DIVEBELL__
    : runtimeOrId === host.__DIVEBELL__;
  const removed = host.__DIVEBELL_REGISTRY__.unregister(runtimeOrId);
  if (removed && removedDefault) {
    const nextDefault = host.__DIVEBELL_REGISTRY__.list()[0]?.runtime;
    if (nextDefault === undefined) {
      delete host.__DIVEBELL__;
    } else {
      host.__DIVEBELL__ = nextDefault;
    }
  }
  return removed;
}

export function getDivebellFromWindow(
  host: DivebellWindowHost | undefined = getDefaultWindowHost()
): DivebellCore | undefined {
  return host?.__DIVEBELL__;
}

export function getDivebellRegistryFromWindow(
  host: DivebellWindowHost | undefined = getDefaultWindowHost()
): DivebellRegistry | undefined {
  return host?.__DIVEBELL_REGISTRY__;
}

function getOrCreateDivebellRegistry(host: DivebellWindowHost): DivebellRegistry {
  host.__DIVEBELL_REGISTRY__ ??= new WindowRuntimeRegistry();
  return host.__DIVEBELL_REGISTRY__;
}

class WindowRuntimeRegistry implements DivebellRegistry {
  readonly #instances = new Map<string, DivebellInstance>();
  readonly #runtimeIds = new WeakMap<DivebellCore, string>();
  readonly #listeners = new Set<(event: DivebellRegistryEvent) => void>();

  register(runtime: DivebellCore, options: DivebellInstanceOptions = {}): DivebellInstance {
    const existingId = this.#runtimeIds.get(runtime);
    if (existingId !== undefined) {
      return this.#instances.get(existingId) as DivebellInstance;
    }

    const runtimeId = normalizeRuntimeId(options.runtimeId) ?? createRuntimeId();
    const collision = this.#instances.get(runtimeId);
    if (collision !== undefined && collision.runtime !== runtime) {
      throw new Error(`Divebell instance id "${runtimeId}" is already registered.`);
    }

    const name = normalizeOptional(options.name);
    const source = normalizeOptional(options.source);
    const parentRuntimeId = normalizeOptional(options.parentRuntimeId);
    const renderId = normalizeOptional(options.renderId);
    const instance: DivebellInstance = {
      runtimeId,
      runtime,
      ...(name === undefined ? {} : { name }),
      ...(source === undefined ? {} : { source }),
      ...(parentRuntimeId === undefined ? {} : { parentRuntimeId }),
      ...(renderId === undefined ? {} : { renderId })
    };
    this.#instances.set(runtimeId, instance);
    this.#runtimeIds.set(runtime, runtimeId);
    this.#emit({ type: "registered", instance });
    return instance;
  }

  unregister(runtimeOrId: DivebellCore | string): boolean {
    const runtimeId = typeof runtimeOrId === "string" ? runtimeOrId : this.#runtimeIds.get(runtimeOrId);
    if (runtimeId === undefined) return false;
    const instance = this.#instances.get(runtimeId);
    if (instance === undefined) return false;

    this.#instances.delete(runtimeId);
    this.#runtimeIds.delete(instance.runtime);
    this.#emit({ type: "unregistered", instance });
    return true;
  }

  list(): DivebellInstance[] {
    return [...this.#instances.values()];
  }

  subscribe(listener: (event: DivebellRegistryEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit(event: DivebellRegistryEvent): void {
    for (const listener of this.#listeners) {
      listener(event);
    }
  }
}

function createRuntimeId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid !== undefined) return `runtime-${uuid}`;
  return `runtime-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function normalizeRuntimeId(value: string | undefined): string | undefined {
  return normalizeOptional(value);
}

function normalizeOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
}

function getDefaultWindowHost(): DivebellWindowHost | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window;
}

declare global {
  interface Window {
    __DIVEBELL__?: DivebellCore;
    __DIVEBELL_REGISTRY__?: DivebellRegistry;
  }
}
