import { request as httpRequest } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  importFromTestPackage,
  resolvePackagePathFromTestPackage
} from "../../support/package-resolution.mjs";

const { createBridgeServer } = await importFromTestPackage("@divebell/bridge");
const {
  createDivebell,
  installDivebellOnWindow,
  uninstallDivebellFromWindow
} = await importFromTestPackage("@divebell/core");
const createBridgeInitScript = await resolveCliBridgeInitScript();

export async function createRuntimeSdkDemoFixture() {
  const previousGlobals = {
    EventSource: globalThis.EventSource,
    location: globalThis.location,
    runtime: globalThis.__DIVEBELL__,
    registry: globalThis.__DIVEBELL_REGISTRY__,
    manager: globalThis.__DIVEBELL_BRIDGE_MANAGER__
  };
  const bridge = createBridgeServer();
  const address = await bridge.listen({ port: 0 });
  const pageUrl = "http://divebell-e2e.test/runtime-sdk?divebellSessionId=runtime-sdk-e2e";
  const state = {
    orders: 3
  };
  const host = globalThis;
  let ordersRuntime;
  let checkoutRuntime;
  let closed = false;

  const close = async () => {
    if (closed) return;
    closed = true;
    if (checkoutRuntime !== undefined) {
      uninstallDivebellFromWindow(checkoutRuntime, host);
    }
    if (ordersRuntime !== undefined) {
      uninstallDivebellFromWindow(ordersRuntime, host);
    }
    globalThis.__DIVEBELL_BRIDGE_MANAGER__?.close();
    for (const source of NodeEventSource.instances) source.close();
    await bridge.close();
    restoreGlobal("EventSource", previousGlobals.EventSource);
    restoreGlobal("location", previousGlobals.location);
    restoreGlobal("__DIVEBELL__", previousGlobals.runtime);
    restoreGlobal("__DIVEBELL_REGISTRY__", previousGlobals.registry);
    restoreGlobal("__DIVEBELL_BRIDGE_MANAGER__", previousGlobals.manager);
  };

  try {
    NodeEventSource.instances = [];
    globalThis.EventSource = NodeEventSource;
    globalThis.location = { href: pageUrl };

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

    globalThis.eval(createBridgeInitScript(address.url));
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

function registerOrdersDemo(runtime, state) {
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
    handler: (payload) => {
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

function setReady(runtime, state, updatedBy) {
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
  static instances = [];

  #listeners = new Map();
  #request;

  constructor(url) {
    NodeEventSource.instances.push(this);
    this.#request = httpRequest(url, { method: "GET" }, (response) => {
      this.#read(response);
    });
    this.#request.on("error", () => {
      this.onerror?.();
    });
    this.#request.end();
  }

  addEventListener(type, listener) {
    const listeners = this.#listeners.get(type) ?? [];
    listeners.push(listener);
    this.#listeners.set(type, listeners);
  }

  close() {
    this.#request.destroy();
  }

  #read(response) {
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

async function waitForConnectedRuntimes(bridgeUrl, count) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(`${bridgeUrl}/runtimes`);
    const body = await response.json();
    if (
      body.runtimes?.filter((runtime) => runtime.status === "connected").length === count
    ) {
      return;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  }
  throw new Error(`${count} Runtime SDK demo runtimes did not connect to ${bridgeUrl}.`);
}

function parseServerSentEvent(raw) {
  let event = "message";
  const data = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice("event: ".length);
    if (line.startsWith("data: ")) data.push(line.slice("data: ".length));
  }
  return {
    event,
    data: JSON.parse(data.join("\n"))
  };
}

function restoreGlobal(name, value) {
  if (value === undefined) {
    delete globalThis[name];
  } else {
    globalThis[name] = value;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function resolveCliBridgeInitScript() {
  const bridgeInitScriptModule = await import(pathToFileURL(join(
    await resolvePackagePathFromTestPackage("@divebell/cli", "dist/features/bridge"),
    "inject.js"
  )).href);
  return bridgeInitScriptModule.createBridgeInitScript;
}
