import {
  request as httpRequest,
  type ClientRequest,
  type IncomingMessage
} from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { BridgeRuntimeInfo } from "@divebell/bridge";
import type {
  DivebellCore,
  DivebellWindowHost
} from "@divebell/core";

import {
  importFromTestPackage,
  resolvePackagePathFromTestPackage
} from "@divebell/test/internal";

interface DemoState {
  orders: number;
}

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

export interface RuntimeSdkDemoFixture {
  bridgeUrl: string;
  pageUrl: string;
  runtimeId: string;
  childRuntimeId: string;
  close(): Promise<void>;
}

export interface RefreshOrdersResult {
  orders: number;
  amount: number;
  source: "cli" | "demo";
}

export function isRefreshOrdersResult(
  value: unknown
): value is RefreshOrdersResult {
  return isRecord(value)
    && typeof value.orders === "number"
    && typeof value.amount === "number"
    && (value.source === "cli" || value.source === "demo");
}

const { createBridgeServer } = await importFromTestPackage<
  typeof import("@divebell/bridge")
>("@divebell/bridge");
const {
  createDivebell,
  installDivebellOnWindow,
  uninstallDivebellFromWindow
} = await importFromTestPackage<typeof import("@divebell/core")>("@divebell/core");
const createBridgeInitScript = await resolveCliBridgeInitScript();

export async function createRuntimeSdkDemoFixture(): Promise<RuntimeSdkDemoFixture> {
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
  const pageUrl = "http://divebell-e2e.test/runtime-sdk?divebellSessionId=runtime-sdk-e2e";
  const state: DemoState = {
    orders: 3
  };
  const host = testGlobal;
  let ordersRuntime: DivebellCore | undefined;
  let checkoutRuntime: DivebellCore | undefined;
  let closed = false;

  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    if (checkoutRuntime !== undefined) {
      uninstallDivebellFromWindow(checkoutRuntime, host);
    }
    if (ordersRuntime !== undefined) {
      uninstallDivebellFromWindow(ordersRuntime, host);
    }
    testGlobal.__DIVEBELL_BRIDGE_MANAGER__?.close();
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

    ordersRuntime = createDivebell();
    registerOrdersDemo(ordersRuntime, state);
    installDivebellOnWindow(ordersRuntime, host, {
      runtimeId: "runtime-sdk-orders",
      name: "orders",
      source: "runtime-sdk-demo"
    });

    checkoutRuntime = createDivebell();
    checkoutRuntime.registerTarget({
      id: "microfrontend:checkout",
      type: "demo.microfrontend",
      source: "runtime-sdk-demo",
      label: "Checkout microfrontend",
      statuses: ["mounted", "unmounted"]
    });
    checkoutRuntime.updateSnapshot({
      id: "microfrontend:checkout",
      status: "mounted",
      data: {
        owner: "checkout"
      }
    });
    installDivebellOnWindow(checkoutRuntime, host, {
      runtimeId: "runtime-sdk-checkout",
      name: "checkout",
      source: "runtime-sdk-demo",
      parentRuntimeId: "runtime-sdk-orders"
    });

    testGlobal.eval(createBridgeInitScript(address.url));
    await waitForConnectedRuntimes(address.url, 2);

    return {
      bridgeUrl: address.url,
      pageUrl,
      runtimeId: "runtime-sdk-orders",
      childRuntimeId: "runtime-sdk-checkout",
      close
    };
  } catch (error) {
    await close();
    throw error;
  }
}

function registerOrdersDemo(runtime: DivebellCore, state: DemoState): void {
  runtime.registerTarget({
    id: "app:runtime-sdk-demo",
    type: "demo.app",
    source: "runtime-sdk-demo",
    label: "Runtime SDK demo app",
    statuses: ["booting", "ready", "error"]
  });
  runtime.registerTarget({
    id: "route:/runtime-sdk",
    type: "demo.route",
    source: "runtime-sdk-demo",
    label: "Runtime SDK demo route",
    statuses: ["loading", "ready", "error"]
  });
  runtime.registerTarget({
    id: "business:orders",
    type: "demo.business",
    source: "runtime-sdk-demo",
    label: "Orders panel",
    statuses: ["idle", "ready", "blocked", "error"]
  });
  runtime.registerAction({
    name: "demo.refresh-orders",
    description: "Refresh the orders panel",
    source: "runtime-sdk-demo",
    risk: "safe",
    availableWhen: {
      id: "business:orders",
      status: "ready"
    },
    inputSchema: {
      type: "object",
      properties: {
        amount: {
          type: "number"
        },
        source: {
          type: "string",
          enum: ["cli", "demo"]
        }
      },
      additionalProperties: false
    },
    handler: (payload: unknown) => {
      const input = isRecord(payload) ? payload : {};
      const amount = typeof input.amount === "number" && Number.isFinite(input.amount)
        ? Math.max(1, Math.floor(input.amount))
        : 1;
      const source = input.source === "cli" || input.source === "demo"
        ? input.source
        : "cli";
      state.orders += amount;
      setReady(runtime, state, source);
      return {
        orders: state.orders,
        amount,
        source
      };
    }
  });

  runtime.updateSnapshot({
    id: "app:runtime-sdk-demo",
    status: "ready",
    data: {
      title: "Runtime SDK CLI demo"
    }
  });
  setReady(runtime, state, "demo");
}

function setReady(
  runtime: DivebellCore,
  state: DemoState,
  updatedBy: "cli" | "demo"
): void {
  runtime.updateSnapshot({
    id: "route:/runtime-sdk",
    status: "ready",
    data: {
      path: "/runtime-sdk"
    }
  });
  runtime.updateSnapshot({
    id: "business:orders",
    status: "ready",
    dependsOn: ["route:/runtime-sdk"],
    data: {
      orders: state.orders,
      updatedBy
    }
  });
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

async function waitForConnectedRuntimes(
  bridgeUrl: string,
  count: number
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(`${bridgeUrl}/runtimes`);
    const body = await response.json() as RuntimesResponse;
    if (
      body.runtimes?.filter((runtime) => runtime.status === "connected").length === count
    ) {
      return;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  }
  throw new Error(`${count} Runtime SDK demo runtimes did not connect to ${bridgeUrl}.`);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function resolveCliBridgeInitScript(): Promise<(bridgeUrl: string) => string> {
  const bridgeInitScriptModule = await import(pathToFileURL(join(
    await resolvePackagePathFromTestPackage("@divebell/cli", "dist/features/bridge"),
    "inject.js"
  )).href) as CliBridgeInjectModule;
  return bridgeInitScriptModule.createBridgeInitScript;
}
