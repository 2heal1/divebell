import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { createBridgeServer } from "../packages/bridge/dist/index.js";
import { createOpenRuntime } from "../packages/core/dist/index.js";
import { runCli } from "../packages/cli/dist/index.js";

class NodeEventSource {
  static instances = [];

  onerror;
  #request;
  #listeners = new Map();

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
    const listeners = this.#listeners.get(type);
    if (listeners === undefined) {
      this.#listeners.set(type, [listener]);
      return;
    }
    listeners.push(listener);
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
        this.#emit(parseServerSentEvent(raw));
        boundary = buffer.indexOf("\n\n");
      }
    });
  }

  #emit(event) {
    const message = { data: JSON.stringify(event.data) };
    for (const listener of this.#listeners.get(event.event) ?? []) {
      listener(message);
    }
  }
}

await main();

async function main() {
  const previousEventSource = globalThis.EventSource;
  const previousLocation = globalThis.location;
  const previousBridgeConnection = globalThis.__OPEN_RUNTIME_BRIDGE_CONNECTION__;

  const bridge = createBridgeServer();
  const address = await bridge.listen({ port: 0 });

  try {
    NodeEventSource.instances = [];
    globalThis.EventSource = NodeEventSource;
    globalThis.location = {
      href: "http://stage7-release.test/"
    };

    const runtime = createOpenRuntime();
    runtime.registerTarget({
      id: "app:stage7-release",
      type: "release.app",
      source: "stage7-smoke",
      label: "Stage 7 release smoke app",
      statuses: ["starting", "ready", "error"]
    });
    runtime.updateSnapshot({
      id: "app:stage7-release",
      status: "ready",
      data: {
        installed: true,
        bridgeManagedBy: "cli"
      }
    });
    runtime.connectBridge({
      port: address.port,
      autoReconnect: false,
      runtimeId: "stage7-release-runtime"
    });

    await waitForConnectedRuntime(address.url);

    const targets = await runCliJson([
      "targets",
      "--bridge",
      address.url,
      "--url",
      "http://stage7-release.test/",
      "--id",
      "app:stage7-release"
    ]);
    assert.equal(targets.result.length, 1);
    assert.equal(targets.result[0].type, "release.app");

    const snapshot = await runCliJson([
      "snapshot",
      "--bridge",
      address.url,
      "--url",
      "http://stage7-release.test/",
      "--id",
      "app:stage7-release"
    ]);
    assert.equal(snapshot.result.targets["app:stage7-release"].status, "ready");
    assert.equal(snapshot.result.targets["app:stage7-release"].data.bridgeManagedBy, "cli");

    const wait = await runCliJson([
      "wait-for",
      "--bridge",
      address.url,
      "--url",
      "http://stage7-release.test/",
      "app:stage7-release",
      "ready",
      "--where",
      "installed=true",
      "--timeout",
      "500"
    ]);
    assert.equal(wait.result.success, true);
    assert.equal(wait.result.target.id, "app:stage7-release");

    console.log("Stage 7 release smoke verification passed.");
  } finally {
    for (const source of NodeEventSource.instances) {
      source.close();
    }
    if (previousEventSource === undefined) {
      delete globalThis.EventSource;
    } else {
      globalThis.EventSource = previousEventSource;
    }
    if (previousLocation === undefined) {
      delete globalThis.location;
    } else {
      globalThis.location = previousLocation;
    }
    if (previousBridgeConnection === undefined) {
      delete globalThis.__OPEN_RUNTIME_BRIDGE_CONNECTION__;
    } else {
      globalThis.__OPEN_RUNTIME_BRIDGE_CONNECTION__ = previousBridgeConnection;
    }
    await bridge.close();
  }
}

async function runCliJson(argv) {
  const output = createOutput();
  const exitCode = await runCli(argv, {
    stdout: output.stdout,
    stderr: output.stderr
  });

  assert.equal(exitCode, 0, output.errorText());
  return JSON.parse(output.text());
}

function createOutput() {
  let stdout = "";
  let stderr = "";
  return {
    stdout: {
      write: (chunk) => {
        stdout += chunk;
      }
    },
    stderr: {
      write: (chunk) => {
        stderr += chunk;
      }
    },
    text: () => stdout,
    errorText: () => stderr
  };
}

async function waitForConnectedRuntime(bridgeUrl) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await fetch(`${bridgeUrl}/runtimes`);
    const body = await response.json();
    if (
      body.runtimes?.some(
        (runtime) => runtime.status === "connected" && runtime.url === "http://stage7-release.test/"
      )
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Stage 7 release runtime did not connect to the Bridge.");
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
