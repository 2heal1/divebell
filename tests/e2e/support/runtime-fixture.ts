import {
  request as httpRequest,
  type ClientRequest,
  type IncomingMessage
} from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { BridgeRuntimeInfo } from "@divebell/bridge";
import type { DivebellWindowHost } from "@divebell/core";

import {
  importFromTestPackage,
  resolvePackagePathFromTestPackage
} from "@divebell/test/internal";

interface BridgeManager {
  close(): void;
}

interface TestRuntimeGlobal extends DivebellWindowHost {
  EventSource?: typeof NodeEventSource;
  location?: {
    href: string;
  };
  __DIVEBELL_BRIDGE_MANAGER__?: BridgeManager;
  eval(source: string): unknown;
}

interface RuntimesResponse {
  runtimes: BridgeRuntimeInfo[];
}

interface CliBridgeInjectModule {
  createBridgeInitScript(bridgeUrl: string): string;
}

interface ServerSentMessage {
  data: string;
}

export interface TroubleshootingRuntimeFixture {
  bridgeUrl: string;
  pageUrl: string;
  targetId: string;
  close(): Promise<void>;
}

const { createBridgeServer } = await importFromTestPackage<
  typeof import("@divebell/bridge")
>("@divebell/bridge");
const {
  createDivebell,
  installDivebellOnWindow
} = await importFromTestPackage<typeof import("@divebell/core")>("@divebell/core");
const createBridgeInitScript = await resolveCliBridgeInitScript();

export async function createTroubleshootingRuntimeFixture(): Promise<
  TroubleshootingRuntimeFixture
> {
  const testGlobal = globalThis as unknown as TestRuntimeGlobal;
  const previousGlobals = {
    EventSource: testGlobal.EventSource,
    location: testGlobal.location,
    runtime: testGlobal.__DIVEBELL__,
    registry: testGlobal.__DIVEBELL_REGISTRY__,
    manager: testGlobal.__DIVEBELL_BRIDGE_MANAGER__
  };
  const bridge = createBridgeServer();
  const address = await bridge.listen({ port: 0 });
  const pageUrl = "http://divebell-e2e.test/orders?divebellSessionId=troubleshooting-e2e";
  let bridgeManager: BridgeManager | undefined;
  let closed = false;

  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    bridgeManager?.close();
    for (const source of NodeEventSource.instances) source.close();
    await bridge.close();
    restoreGlobal(testGlobal, "EventSource", previousGlobals.EventSource);
    restoreGlobal(testGlobal, "location", previousGlobals.location);
    restoreGlobal(testGlobal, "__DIVEBELL__", previousGlobals.runtime);
    restoreGlobal(testGlobal, "__DIVEBELL_REGISTRY__", previousGlobals.registry);
    restoreGlobal(testGlobal, "__DIVEBELL_BRIDGE_MANAGER__", previousGlobals.manager);
  };

  try {
    NodeEventSource.instances = [];
    testGlobal.EventSource = NodeEventSource;
    testGlobal.location = { href: pageUrl };

    const runtime = createDivebell();
    runtime.registerTarget({
      id: "business:orders:summary",
      type: "business.component",
      source: "divebell-test",
      label: "Orders summary",
      statuses: ["loading", "ready", "error"]
    });
    runtime.updateSnapshot({
      id: "business:orders:summary",
      status: "ready",
      data: {
        orderCount: 3,
        region: "cn"
      }
    });
    installDivebellOnWindow(runtime, testGlobal, {
      runtimeId: "troubleshooting-e2e-runtime",
      name: "troubleshooting-e2e",
      source: "divebell-test"
    });
    testGlobal.eval(createBridgeInitScript(address.url));
    bridgeManager = testGlobal.__DIVEBELL_BRIDGE_MANAGER__;

    await waitForRuntime(address.url, "troubleshooting-e2e-runtime");

    return {
      bridgeUrl: address.url,
      pageUrl,
      targetId: "business:orders:summary",
      close
    };
  } catch (error) {
    await close();
    throw error;
  }
}

class NodeEventSource {
  static instances: NodeEventSource[] = [];

  readonly #listeners = new Map<string, Array<(event: ServerSentMessage) => void>>();
  readonly #request: ClientRequest;
  onerror?: () => void;

  constructor(url: string | URL) {
    NodeEventSource.instances.push(this);
    this.#request = httpRequest(url, { method: "GET" }, (response) => {
      this.#read(response);
    });
    this.#request.on("error", () => {
      this.onerror?.();
    });
    this.#request.end();
  }

  addEventListener(type: string, listener: (event: ServerSentMessage) => void): void {
    const listeners = this.#listeners.get(type) ?? [];
    listeners.push(listener);
    this.#listeners.set(type, listeners);
  }

  close(): void {
    this.#request.destroy();
  }

  #read(response: IncomingMessage): void {
    let buffer = "";
    response.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = parseServerSentEvent(raw);
        const message = { data: JSON.stringify(event.data) };
        for (const listener of this.#listeners.get(event.event) ?? []) {
          listener(message);
        }
        boundary = buffer.indexOf("\n\n");
      }
    });
  }
}

async function waitForRuntime(bridgeUrl: string, runtimeId: string): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await fetch(`${bridgeUrl}/runtimes`);
    const body = await response.json() as RuntimesResponse;
    if (
      body.runtimes?.some(
        (runtime) => runtime.runtimeId === runtimeId && runtime.status === "connected"
      )
    ) {
      return;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  }
  throw new Error(`Runtime ${runtimeId} did not connect to ${bridgeUrl}.`);
}

function parseServerSentEvent(raw: string): {
  event: string;
  data: unknown;
} {
  let event = "message";
  const data: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice("event: ".length);
    if (line.startsWith("data: ")) data.push(line.slice("data: ".length));
  }
  return {
    event,
    data: JSON.parse(data.join("\n"))
  };
}

function restoreGlobal(
  target: TestRuntimeGlobal,
  name: keyof TestRuntimeGlobal,
  value: unknown
): void {
  if (value === undefined) {
    Reflect.deleteProperty(target, name);
  } else {
    Reflect.set(target, name, value);
  }
}

async function resolveCliBridgeInitScript(): Promise<(bridgeUrl: string) => string> {
  const bridgeInitScriptModule = await import(pathToFileURL(join(
    await resolvePackagePathFromTestPackage("@divebell/cli", "dist/features/bridge"),
    "inject.js"
  )).href) as CliBridgeInjectModule;
  return bridgeInitScriptModule.createBridgeInitScript;
}
