import { createOpenRuntime } from "./center.js";
import type { OpenRuntimeCore } from "./types.js";

export interface OpenRuntimeWindowHost {
  __OPEN_RUNTIME__?: OpenRuntimeCore;
  __OPEN_RUNTIME_REGISTRY__?: OpenRuntimeRegistry;
}

export interface OpenRuntimeInstanceOptions {
  runtimeId?: string;
  name?: string;
  source?: string;
  parentRuntimeId?: string;
  renderId?: string;
}

export interface OpenRuntimeInstance extends OpenRuntimeInstanceOptions {
  runtimeId: string;
  runtime: OpenRuntimeCore;
}

export type OpenRuntimeRegistryEvent =
  | { type: "registered"; instance: OpenRuntimeInstance }
  | { type: "unregistered"; instance: OpenRuntimeInstance };

export interface OpenRuntimeRegistry {
  register(runtime: OpenRuntimeCore, options?: OpenRuntimeInstanceOptions): OpenRuntimeInstance;
  unregister(runtimeOrId: OpenRuntimeCore | string): boolean;
  list(): OpenRuntimeInstance[];
  subscribe(listener: (event: OpenRuntimeRegistryEvent) => void): () => void;
}

export function installOpenRuntimeOnWindow(
  runtime: OpenRuntimeCore = createOpenRuntime(),
  host: OpenRuntimeWindowHost | undefined = getDefaultWindowHost(),
  options: OpenRuntimeInstanceOptions = {}
): OpenRuntimeCore {
  if (host === undefined) {
    return runtime;
  }

  const registry = getOrCreateOpenRuntimeRegistry(host);
  registry.register(runtime, options);
  host.__OPEN_RUNTIME__ ??= runtime;
  return runtime;
}

export function uninstallOpenRuntimeFromWindow(
  runtimeOrId: OpenRuntimeCore | string,
  host: OpenRuntimeWindowHost | undefined = getDefaultWindowHost()
): boolean {
  if (host?.__OPEN_RUNTIME_REGISTRY__ === undefined) {
    return false;
  }

  const removedDefault = typeof runtimeOrId === "string"
    ? host.__OPEN_RUNTIME_REGISTRY__.list().find((instance) => instance.runtimeId === runtimeOrId)?.runtime === host.__OPEN_RUNTIME__
    : runtimeOrId === host.__OPEN_RUNTIME__;
  const removed = host.__OPEN_RUNTIME_REGISTRY__.unregister(runtimeOrId);
  if (removed && removedDefault) {
    const nextDefault = host.__OPEN_RUNTIME_REGISTRY__.list()[0]?.runtime;
    if (nextDefault === undefined) {
      delete host.__OPEN_RUNTIME__;
    } else {
      host.__OPEN_RUNTIME__ = nextDefault;
    }
  }
  return removed;
}

export function getOpenRuntimeFromWindow(
  host: OpenRuntimeWindowHost | undefined = getDefaultWindowHost()
): OpenRuntimeCore | undefined {
  return host?.__OPEN_RUNTIME__;
}

export function getOpenRuntimeRegistryFromWindow(
  host: OpenRuntimeWindowHost | undefined = getDefaultWindowHost()
): OpenRuntimeRegistry | undefined {
  return host?.__OPEN_RUNTIME_REGISTRY__;
}

function getOrCreateOpenRuntimeRegistry(host: OpenRuntimeWindowHost): OpenRuntimeRegistry {
  host.__OPEN_RUNTIME_REGISTRY__ ??= new WindowRuntimeRegistry();
  return host.__OPEN_RUNTIME_REGISTRY__;
}

class WindowRuntimeRegistry implements OpenRuntimeRegistry {
  readonly #instances = new Map<string, OpenRuntimeInstance>();
  readonly #runtimeIds = new WeakMap<OpenRuntimeCore, string>();
  readonly #listeners = new Set<(event: OpenRuntimeRegistryEvent) => void>();

  register(runtime: OpenRuntimeCore, options: OpenRuntimeInstanceOptions = {}): OpenRuntimeInstance {
    const existingId = this.#runtimeIds.get(runtime);
    if (existingId !== undefined) {
      return this.#instances.get(existingId) as OpenRuntimeInstance;
    }

    const runtimeId = normalizeRuntimeId(options.runtimeId) ?? createRuntimeId();
    const collision = this.#instances.get(runtimeId);
    if (collision !== undefined && collision.runtime !== runtime) {
      throw new Error(`OpenRuntime instance id "${runtimeId}" is already registered.`);
    }

    const name = normalizeOptional(options.name);
    const source = normalizeOptional(options.source);
    const parentRuntimeId = normalizeOptional(options.parentRuntimeId);
    const renderId = normalizeOptional(options.renderId);
    const instance: OpenRuntimeInstance = {
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

  unregister(runtimeOrId: OpenRuntimeCore | string): boolean {
    const runtimeId = typeof runtimeOrId === "string" ? runtimeOrId : this.#runtimeIds.get(runtimeOrId);
    if (runtimeId === undefined) return false;
    const instance = this.#instances.get(runtimeId);
    if (instance === undefined) return false;

    this.#instances.delete(runtimeId);
    this.#runtimeIds.delete(instance.runtime);
    this.#emit({ type: "unregistered", instance });
    return true;
  }

  list(): OpenRuntimeInstance[] {
    return [...this.#instances.values()];
  }

  subscribe(listener: (event: OpenRuntimeRegistryEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit(event: OpenRuntimeRegistryEvent): void {
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

function getDefaultWindowHost(): OpenRuntimeWindowHost | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window;
}

declare global {
  interface Window {
    __OPEN_RUNTIME__?: OpenRuntimeCore;
    __OPEN_RUNTIME_REGISTRY__?: OpenRuntimeRegistry;
  }
}
