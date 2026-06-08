import assert from "node:assert/strict";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { test } from "@rstest/core";

import { createBridgeServer } from "../../bridge/dist/index.js";
import { createOpenRuntime } from "../../core/dist/index.js";
import { runCli } from "../dist/index.js";

test("runs the stage 2 cli flow against a connected runtime", async () => {
  const previousEventSource = globalThis.EventSource;
  const previousLocation = globalThis.location;
  const bridge = createBridgeServer();
  const address = await bridge.listen({ port: 0 });

  try {
    NodeEventSource.instances = [];
    (globalThis as unknown as { EventSource: typeof EventSource }).EventSource = NodeEventSource as unknown as typeof EventSource;
    (globalThis as unknown as { location: Location }).location = {
      href: "http://app.test/"
    } as Location;

    const runtime = createOpenRuntime();
    runtime.registerTarget({
      id: "business:orders",
      type: "demo.business",
      source: "demo",
      statuses: ["ready", "blocked"]
    });
    runtime.updateSnapshot({
      id: "business:orders",
      status: "ready",
      data: {
        orders: 3,
        updatedBy: "demo"
      }
    });
    runtime.registerAction({
      name: "demo.refresh-orders",
      source: "demo",
      risk: "safe",
      availableWhen: {
        id: "business:orders",
        status: "ready"
      },
      getInputOptions: (inputName) => inputName === "source"
        ? [
            {
              value: "cli"
            },
            {
              value: "demo"
            }
          ]
        : [],
      handler: (payload) => {
        const input = isRecord(payload) ? payload : {};
        const amount = typeof input.amount === "number" ? input.amount : 1;
        runtime.updateSnapshot({
          id: "business:orders",
          status: "ready",
          data: {
            orders: 3 + amount,
            updatedBy: input.source
          }
        });
        return {
          orders: 3 + amount,
          source: input.source
        };
      }
    });

    runtime.connectBridge({
      port: address.port,
      autoReconnect: false
    });
    await waitForConnectedRuntime(address.url);

    const options = await runCliJson<{
      result: Array<{ value: string }>;
    }>([
      "input-options",
      "--bridge",
      address.url,
      "--url",
      "http://app.test/",
      "--action",
      "demo.refresh-orders",
      "--input",
      "source"
    ]);
    assert.deepEqual(options.result.map((option) => option.value), ["cli", "demo"]);

    const action = await runCliJson<{
      result: {
        success: boolean;
        result?: {
          orders?: number;
          source?: string;
        };
      };
    }>([
      "run-action",
      "--bridge",
      address.url,
      "--url",
      "http://app.test/",
      "demo.refresh-orders",
      "--payload",
      "{\"amount\":2,\"source\":\"cli\"}"
    ]);
    assert.equal(action.result.success, true);
    assert.equal(action.result.result?.orders, 5);
    assert.equal(action.result.result?.source, "cli");

    const wait = await runCliJson<{
      result: {
        success: boolean;
        target?: {
          status?: string;
          data?: {
            orders?: number;
            updatedBy?: string;
          };
        };
      };
    }>([
      "wait-for",
      "--bridge",
      address.url,
      "--url",
      "http://app.test/",
      "business:orders",
      "ready",
      "--timeout",
      "500"
    ]);
    assert.equal(wait.result.success, true);
    assert.equal(wait.result.target?.status, "ready");
    assert.equal(wait.result.target?.data?.orders, 5);
    assert.equal(wait.result.target?.data?.updatedBy, "cli");

    const events = await runCliJson<{
      result: {
        events: Array<{ type: string; actionName?: string }>;
      };
    }>([
      "events",
      "--bridge",
      address.url,
      "--url",
      "http://app.test/",
      "--limit",
      "10"
    ]);
    assert.deepEqual(events.result.events.filter((event) => event.actionName === "demo.refresh-orders").map((event) => event.type), [
      "action.started",
      "action.success"
    ]);
  } finally {
    for (const source of NodeEventSource.instances) {
      source.close();
    }
    restoreGlobal("EventSource", previousEventSource);
    restoreLocation(previousLocation);
    await bridge.close();
  }
});

class NodeEventSource {
  static instances: NodeEventSource[] = [];

  onerror: (() => void) | undefined;
  readonly #request: ReturnType<typeof httpRequest>;
  readonly #listeners = new Map<string, Array<(event: MessageEvent) => void>>();

  constructor(url: string) {
    NodeEventSource.instances.push(this);
    this.#request = httpRequest(url, { method: "GET" }, (response) => {
      this.#read(response);
    });
    this.#request.on("error", () => {
      this.onerror?.();
    });
    this.#request.end();
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    const listeners = this.#listeners.get(type);
    if (listeners === undefined) {
      this.#listeners.set(type, [listener]);
      return;
    }
    listeners.push(listener);
  }

  close(): void {
    this.#request.destroy();
  }

  #read(response: IncomingMessage): void {
    let buffer = "";
    response.on("data", (chunk: Buffer) => {
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

  #emit(event: { event: string; data: unknown }): void {
    const message = { data: JSON.stringify(event.data) } as MessageEvent;
    for (const listener of this.#listeners.get(event.event) ?? []) {
      listener(message);
    }
  }
}

async function runCliJson<T>(argv: string[]): Promise<T> {
  const output = createOutput();
  const exitCode = await runCli(argv, {
    stdout: output.stdout,
    stderr: output.stderr
  });

  assert.equal(exitCode, 0, output.errorText());
  return JSON.parse(output.text()) as T;
}

function createOutput(): {
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
  text(): string;
  errorText(): string;
} {
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

async function waitForConnectedRuntime(bridgeUrl: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${bridgeUrl}/runtimes`);
    const body = await response.json() as {
      runtimes?: Array<{ status?: string; url?: string }>;
    };
    if (body.runtimes?.some((runtime) => runtime.status === "connected" && runtime.url === "http://app.test/")) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Runtime did not connect to the Bridge.");
}

function parseServerSentEvent(raw: string): { event: string; data: unknown } {
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

function restoreGlobal(name: "EventSource", value: typeof EventSource | undefined): void {
  if (value === undefined) {
    delete (globalThis as unknown as { EventSource?: typeof EventSource }).EventSource;
    return;
  }
  (globalThis as unknown as { EventSource: typeof EventSource }).EventSource = value;
}

function restoreLocation(value: Location): void {
  (globalThis as unknown as { location: Location }).location = value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
