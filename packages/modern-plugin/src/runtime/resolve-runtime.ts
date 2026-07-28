import {
  createDivebell,
  getDivebellFromWindow,
  installDivebellOnWindow,
  type DivebellCore,
  type DivebellWindowHost
} from "@divebell/core";
import { readDivebellRenderContext } from "./render-context.js";

export interface ResolveRuntimeOptions {
  runtime?: DivebellCore;
  host?: DivebellWindowHost;
  name?: string;
  source?: string;
  parentRuntimeId?: string;
  beforeConnect?: (runtime: DivebellCore) => void;
}

export function resolveDivebell(options: ResolveRuntimeOptions = {}): DivebellCore {
  const host = options.host ?? getDefaultHost();
  const runtime = options.runtime ?? getDivebellFromWindow(host) ?? createDivebell();

  options.beforeConnect?.(runtime);

  if (host !== undefined) {
    const context = readDivebellRenderContext();
    const source = options.source ?? context?.source;
    installDivebellOnWindow(runtime, host, {
      ...(context?.runtimeId === undefined ? {} : { runtimeId: context.runtimeId }),
      ...(context?.renderId === undefined ? {} : { renderId: context.renderId }),
      ...(options.name === undefined ? {} : { name: options.name }),
      ...(source === undefined ? {} : { source }),
      ...(options.parentRuntimeId === undefined ? {} : { parentRuntimeId: options.parentRuntimeId })
    });
  }

  return runtime;
}

function getDefaultHost(): DivebellWindowHost | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window;
}
