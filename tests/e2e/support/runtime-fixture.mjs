import { request as httpRequest } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  importFromTestPackage,
  resolvePackagePathFromTestPackage
} from "./package-resolution.mjs";

const { createBridgeServer } = await importFromTestPackage("@divebell/bridge");
const {
  createDivebell,
  installDivebellOnWindow
} = await importFromTestPackage("@divebell/core");
const createBridgeInitScript = await resolveCliBridgeInitScript();

export async function createTroubleshootingRuntimeFixture() {
  const previousGlobals = {
    EventSource: globalThis.EventSource,
    location: globalThis.location,
    runtime: globalThis.__DIVEBELL__,
    registry: globalThis.__DIVEBELL_REGISTRY__,
    manager: globalThis.__DIVEBELL_BRIDGE_MANAGER__
  };
  const bridge = createBridgeServer();
  const address = await bridge.listen({ port: 0 });
  const pageUrl = "http://divebell-e2e.test/orders?divebellSessionId=troubleshooting-e2e";
  let bridgeManager;
  let closed = false;

  const close = async () => {
    if (closed) return;
    closed = true;
    bridgeManager?.close();
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
    installDivebellOnWindow(runtime, globalThis, {
      runtimeId: "troubleshooting-e2e-runtime",
      name: "troubleshooting-e2e",
      source: "divebell-test"
    });
    globalThis.eval(createBridgeInitScript(address.url));
    bridgeManager = globalThis.__DIVEBELL_BRIDGE_MANAGER__;

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

async function waitForRuntime(bridgeUrl, runtimeId) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await fetch(`${bridgeUrl}/runtimes`);
    const body = await response.json();
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

async function resolveCliBridgeInitScript() {
  const bridgeInitScriptModule = await import(pathToFileURL(join(
    await resolvePackagePathFromTestPackage("@divebell/cli", "dist/features/bridge"),
    "inject.js"
  )).href);
  return bridgeInitScriptModule.createBridgeInitScript;
}
