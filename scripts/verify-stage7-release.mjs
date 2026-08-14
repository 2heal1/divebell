import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createBridgeServer } from "../packages/bridge/dist/index.js";
import { createDivebell, installDivebellOnWindow } from "../packages/core/dist/index.js";
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
  const previousRuntime = globalThis.__DIVEBELL__;
  const previousRegistry = globalThis.__DIVEBELL_REGISTRY__;
  const previousBridgeManager = globalThis.__DIVEBELL_BRIDGE_MANAGER__;

  const bridge = createBridgeServer();
  const address = await bridge.listen({ port: 0 });

  try {
    NodeEventSource.instances = [];
    globalThis.EventSource = NodeEventSource;
    globalThis.location = {
      href: "http://stage7-release.test/"
    };

    const runtime = createDivebell();
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
    installDivebellOnWindow(runtime, globalThis, {
      runtimeId: "stage7-release-runtime",
      name: "stage7-release",
      source: "stage7-smoke"
    });
    await openWithInjectedBridge(address.url);

    await waitForConnectedRuntime(address.url);

    const targets = await runCliData([
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

    const snapshot = await runCliData([
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

    const wait = await runCliData([
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
    globalThis.__DIVEBELL_BRIDGE_MANAGER__?.close();
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
    if (previousRuntime === undefined) {
      delete globalThis.__DIVEBELL__;
    } else {
      globalThis.__DIVEBELL__ = previousRuntime;
    }
    restoreOptionalGlobal("__DIVEBELL_REGISTRY__", previousRegistry);
    restoreOptionalGlobal("__DIVEBELL_BRIDGE_MANAGER__", previousBridgeManager);
    await bridge.close();
  }
}

async function openWithInjectedBridge(bridgeUrl) {
  const output = createOutput();
  const exitCode = await runCli([
    "open",
    "http://stage7-release.test/",
    "--bridge",
    bridgeUrl,
    "--session",
    "stage7-release"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    browserRunner: {
      run: async (args) => {
        if (args[0] === "open" && args[1] !== undefined) {
          globalThis.location = { href: args[1] };
          assert.equal(args[2], "--init-script");
          globalThis.eval(readFileSync(args[3], "utf8"));
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      }
    }
  });
  assert.equal(exitCode, 0, output.errorText());
}

function restoreOptionalGlobal(name, value) {
  if (value === undefined) delete globalThis[name];
  else globalThis[name] = value;
}

async function runCliData(argv) {
  const output = createOutput();
  const exitCode = await runCli(argv, {
    stdout: output.stdout,
    stderr: output.stderr
  });

  assert.equal(exitCode, 0, output.errorText());
  const result = JSON.parse(output.text());
  assert.equal(result.status, "ok");
  assert.equal(result.meta?.version, 1);
  return result.data;
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
        (runtime) => runtime.status === "connected" &&
          runtime.url === "http://stage7-release.test/?divebellSessionId=stage7-release"
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
