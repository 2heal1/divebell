import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "@rstest/core";

import { createBridgeServer } from "../../bridge/dist/index.js";
import {
  createDivebell,
  installDivebellOnWindow,
  uninstallDivebellFromWindow
} from "../../core/dist/index.js";
import { runCli } from "../dist/index.js";

process.env.DIVEBELL_DISABLE_EXTENSIONS = "1";

test("runs the stage 2 cli flow against a connected runtime", async () => {
  const previousEventSource = globalThis.EventSource;
  const previousLocation = globalThis.location;
  const previousRuntime = (globalThis as unknown as Record<string, unknown>).__DIVEBELL__;
  const previousRegistry = (globalThis as unknown as Record<string, unknown>).__DIVEBELL_REGISTRY__;
  const previousManager = (globalThis as unknown as Record<string, unknown>).__DIVEBELL_BRIDGE_MANAGER__;
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-stage2-flow-"));
  const bridge = createBridgeServer();
  const address = await bridge.listen({ port: 0 });

  try {
    NodeEventSource.instances = [];
    (globalThis as unknown as { EventSource: typeof EventSource }).EventSource = NodeEventSource as unknown as typeof EventSource;
    (globalThis as unknown as { location: Location }).location = {
      href: "http://app.test/"
    } as Location;

    const runtime = createDivebell();
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

    const childRuntime = createDivebell();
    childRuntime.registerTarget({
      id: "microfrontend:checkout",
      type: "demo.microfrontend",
      source: "checkout",
      statuses: ["mounted", "unmounted"]
    });
    childRuntime.updateSnapshot({
      id: "microfrontend:checkout",
      status: "mounted"
    });

    const host = globalThis as unknown as Window;
    installDivebellOnWindow(runtime, host, {
      runtimeId: "runtime-orders",
      name: "orders",
      source: "demo"
    });
    const openOutput = createOutput();
    const openExitCode = await runCli([
      "open",
      "http://app.test/",
      "--bridge",
      address.url,
      "--session",
      "stage2-flow"
    ], {
      stdout: openOutput.stdout,
      stderr: openOutput.stderr,
      operationLogDirectory,
      browserRunner: {
        run: async (args) => {
          if (args[0] === "open" && args[1] !== undefined) {
            (globalThis as unknown as { location: Location }).location = { href: args[1] } as Location;
            const scriptPath = args[3];
            assert.equal(args[2], "--init-script");
            assert.equal(typeof scriptPath, "string");
            globalThis.eval(readFileSync(scriptPath as string, "utf8"));
          }
          return { exitCode: 0, stdout: "", stderr: "" };
        }
      }
    });
    assert.equal(openExitCode, 0, openOutput.errorText());
    await waitForConnectedRuntimes(address.url, 1);

    installDivebellOnWindow(childRuntime, host, {
      runtimeId: "runtime-checkout",
      name: "checkout",
      source: "demo",
      parentRuntimeId: "runtime-orders"
    });
    await waitForConnectedRuntimes(address.url, 2);

    const runtimes = await runCliJson<{
      runtimes: Array<{ runtimeId: string; name?: string; parentRuntimeId?: string }>;
    }>(["runtimes", "--bridge", address.url]);
    assert.deepEqual(runtimes.runtimes.toSorted((left, right) => left.runtimeId.localeCompare(right.runtimeId)).map((item) => ({
      runtimeId: item.runtimeId,
      name: item.name,
      parentRuntimeId: item.parentRuntimeId
    })), [
      { runtimeId: "runtime-checkout", name: "checkout", parentRuntimeId: "runtime-orders" },
      { runtimeId: "runtime-orders", name: "orders", parentRuntimeId: undefined }
    ]);

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
      "--runtime",
      "runtime-orders",
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
      "--runtime",
      "runtime-orders",
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
      "--runtime",
      "runtime-orders",
      "--url",
      "http://app.test/",
      "--limit",
      "10"
    ]);
    assert.deepEqual(events.result.events.filter((event) => event.actionName === "demo.refresh-orders").map((event) => event.type), [
      "action.started",
      "action.success"
    ]);

    assert.equal(uninstallDivebellFromWindow(childRuntime, host), true);
    assert.equal(
      (globalThis as unknown as { __DIVEBELL_BRIDGE_MANAGER__?: { connectionCount: number } })
        .__DIVEBELL_BRIDGE_MANAGER__?.connectionCount,
      1
    );
    await waitForRuntimeMissing(address.url, "runtime-checkout");
  } finally {
    (globalThis as unknown as { __DIVEBELL_BRIDGE_MANAGER__?: { close(): void } })
      .__DIVEBELL_BRIDGE_MANAGER__?.close();
    for (const source of NodeEventSource.instances) {
      source.close();
    }
    restoreGlobal("EventSource", previousEventSource);
    restoreLocation(previousLocation);
    restoreOptionalGlobal("__DIVEBELL__", previousRuntime);
    restoreOptionalGlobal("__DIVEBELL_REGISTRY__", previousRegistry);
    restoreOptionalGlobal("__DIVEBELL_BRIDGE_MANAGER__", previousManager);
    rmSync(operationLogDirectory, { recursive: true, force: true });
    await bridge.close();
  }
});

class NodeEventSource {
  static instances: NodeEventSource[] = [];

  onerror: (() => void) | undefined;
  readonly #request: ReturnType<typeof httpRequest>;
  #response: IncomingMessage | undefined;
  readonly #listeners = new Map<string, Array<(event: MessageEvent) => void>>();

  constructor(url: string) {
    NodeEventSource.instances.push(this);
    this.#request = httpRequest(url, { method: "GET" }, (response) => {
      this.#response = response;
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
    this.#response?.destroy();
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
  const parsed = JSON.parse(output.text()) as { status: string; data: T };
  assert.equal(parsed.status, "ok");
  return parsed.data;
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

async function waitForConnectedRuntimes(bridgeUrl: string, count: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(`${bridgeUrl}/runtimes`);
    const body = await response.json() as {
      runtimes?: Array<{ status?: string; url?: string }>;
    };
    if (body.runtimes?.filter((runtime) => runtime.status === "connected").length === count) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Runtime did not connect to the Bridge.");
}

async function waitForRuntimeMissing(bridgeUrl: string, runtimeId: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(`${bridgeUrl}/runtimes`);
    const body = await response.json() as {
      runtimes?: Array<{ runtimeId?: string }>;
    };
    if (!body.runtimes?.some((runtime) => runtime.runtimeId === runtimeId)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Runtime ${runtimeId} remained in the connected runtime list.`);
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

function restoreOptionalGlobal(name: string, value: unknown): void {
  const host = globalThis as unknown as Record<string, unknown>;
  if (value === undefined) delete host[name];
  else host[name] = value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
