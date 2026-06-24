import assert from "node:assert/strict";
import { test } from "@rstest/core";

import { createOpenRuntime } from "../../dist/index.js";
import { createClock, registerRoute } from "../helpers/runtime.ts";

test("connects to bridge and responds to runtime read requests", async () => {
  const previousEventSource = globalThis.EventSource;
  const previousFetch = globalThis.fetch;
  const fetchCalls: Array<{ url: string; body: unknown }> = [];

  try {
    FakeEventSource.instances = [];
    (globalThis as unknown as { EventSource: typeof EventSource }).EventSource = FakeEventSource as unknown as typeof EventSource;
    globalThis.fetch = async (input, init) => {
      fetchCalls.push({
        url: String(input),
        body: JSON.parse(String(init?.body))
      });
      return new Response(JSON.stringify({ accepted: true }), { status: 200 });
    };

    const runtime = createOpenRuntime({ clock: createClock() });
    registerRoute(runtime);
    runtime.updateSnapshot({
      id: "route:/home",
      status: "ready",
      data: {
        matches: [{ pathname: "/home" }]
      }
    });

    runtime.connectBridge({ port: 19001, autoReconnect: false, pageInstanceId: "page-test" });

    const stream = FakeEventSource.instances[0];
    assert.ok(stream);
    assert.equal(stream.url, "http://localhost:19001/connect?url=unknown&pageInstanceId=page-test");

    stream.emit("connected", { runtimeId: "runtime-1" });
    stream.emit("request", {
      requestId: "request-1",
      method: "getSnapshot"
    });
    await waitForMicrotasks();

    assert.equal(fetchCalls[0]?.url, "http://localhost:19001/runtimes/runtime-1/responses/request-1");
    const body = fetchCalls[0]?.body as {
      success?: boolean;
      result?: {
        latestEventId?: number;
        capturedAt?: number;
        targets?: Record<string, { status?: string }>;
      };
    };
    assert.equal(body.success, true);
    assert.equal(body.result?.latestEventId, 1);
    assert.equal(typeof body.result?.capturedAt, "number");
    assert.equal(body.result?.targets?.["route:/home"]?.status, "ready");
  } finally {
    restoreGlobal("EventSource", previousEventSource);
    globalThis.fetch = previousFetch;
    clearBridgeConnection();
  }
});

test("opens a single bridge connection per browser global", () => {
  const previousEventSource = globalThis.EventSource;

  try {
    FakeEventSource.instances = [];
    (globalThis as unknown as { EventSource: typeof EventSource }).EventSource = FakeEventSource as unknown as typeof EventSource;

    createOpenRuntime({ clock: createClock() }).connectBridge({ port: 19001, autoReconnect: false });
    createOpenRuntime({ clock: createClock() }).connectBridge({ port: 19001, autoReconnect: false });

    const firstUrl = FakeEventSource.instances[0]?.url;
    assert.equal(FakeEventSource.instances.length, 1);
    assert.equal(typeof firstUrl, "string");

    const firstPageInstanceId = new URL(firstUrl as string).searchParams.get("pageInstanceId");
    assert.match(firstPageInstanceId ?? "", /^page-/);
  } finally {
    restoreGlobal("EventSource", previousEventSource);
    clearBridgeConnection();
  }
});

test("passes runtime and render context when connecting to bridge", () => {
  const previousEventSource = globalThis.EventSource;

  try {
    FakeEventSource.instances = [];
    (globalThis as unknown as { EventSource: typeof EventSource }).EventSource = FakeEventSource as unknown as typeof EventSource;

    createOpenRuntime({ clock: createClock() }).connectBridge({
      port: 19001,
      autoReconnect: false,
      pageInstanceId: "page-test",
      runtimeId: "runtime-ssr",
      sessionId: "session-debug",
      renderId: "render-ssr"
    });

    const stream = FakeEventSource.instances[0];
    assert.ok(stream);
    assert.equal(
      stream.url,
      "http://localhost:19001/connect?url=unknown&pageInstanceId=page-test&runtimeId=runtime-ssr&sessionId=session-debug&renderId=render-ssr"
    );
  } finally {
    restoreGlobal("EventSource", previousEventSource);
    clearBridgeConnection();
  }
});

test("reads the session id from the page query when connecting to bridge", () => {
  const previousEventSource = globalThis.EventSource;
  const previousLocation = globalThis.location;

  try {
    FakeEventSource.instances = [];
    (globalThis as unknown as { EventSource: typeof EventSource }).EventSource = FakeEventSource as unknown as typeof EventSource;
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: {
        href: "http://app.test/orders?openruntimeSessionId=session-orders"
      }
    });

    createOpenRuntime({ clock: createClock() }).connectBridge({
      port: 19001,
      autoReconnect: false,
      pageInstanceId: "page-test"
    });

    const stream = FakeEventSource.instances[0];
    assert.ok(stream);
    assert.equal(
      stream.url,
      "http://localhost:19001/connect?url=http%3A%2F%2Fapp.test%2Forders%3FopenruntimeSessionId%3Dsession-orders&pageInstanceId=page-test&sessionId=session-orders"
    );
  } finally {
    restoreGlobal("EventSource", previousEventSource);
    restoreLocation(previousLocation);
    clearBridgeConnection();
  }
});

test("does not open duplicate bridge connections for the same runtime", () => {
  const previousEventSource = globalThis.EventSource;

  try {
    FakeEventSource.instances = [];
    (globalThis as unknown as { EventSource: typeof EventSource }).EventSource = FakeEventSource as unknown as typeof EventSource;

    const runtime = createOpenRuntime({ clock: createClock() });
    runtime.connectBridge({ port: 19001, autoReconnect: false });
    runtime.connectBridge({ port: 19001, autoReconnect: false });

    assert.equal(FakeEventSource.instances.length, 1);
  } finally {
    restoreGlobal("EventSource", previousEventSource);
    clearBridgeConnection();
  }
});

test("responds to runtime action and wait requests from bridge", async () => {
  const previousEventSource = globalThis.EventSource;
  const previousFetch = globalThis.fetch;
  const fetchCalls: Array<{ url: string; body: unknown }> = [];

  try {
    FakeEventSource.instances = [];
    (globalThis as unknown as { EventSource: typeof EventSource }).EventSource = FakeEventSource as unknown as typeof EventSource;
    globalThis.fetch = async (input, init) => {
      fetchCalls.push({
        url: String(input),
        body: JSON.parse(String(init?.body))
      });
      return new Response(JSON.stringify({ accepted: true }), { status: 200 });
    };

    const runtime = createOpenRuntime({ clock: createClock() });
    registerRoute(runtime);
    runtime.updateSnapshot({
      id: "route:/home",
      status: "ready",
      data: {
        matches: [{ pathname: "/home" }]
      }
    });
    runtime.registerAction({
      name: "route.pick",
      source: "test",
      risk: "safe",
      getInputOptions: (inputName, payload) => [
        {
          value: `${inputName}:${payload?.region ?? "unknown"}`
        }
      ],
      handler: (payload) => ({
        payload
      })
    });

    runtime.connectBridge({ port: 19001, autoReconnect: false, pageInstanceId: "page-test" });

    const stream = FakeEventSource.instances[0];
    assert.ok(stream);
    stream.emit("connected", { runtimeId: "runtime-1" });

    stream.emit("request", {
      requestId: "request-options",
      method: "getInputOptions",
      actionName: "route.pick",
      inputName: "city",
      payload: {
        region: "zhejiang"
      }
    });
    await waitForFetchCalls(fetchCalls, 1);
    assert.deepEqual(getResponse(fetchCalls[0]?.body).result, [
      {
        value: "city:zhejiang"
      }
    ]);

    stream.emit("request", {
      requestId: "request-run",
      method: "runAction",
      actionName: "route.pick",
      payload: {
        city: "hangzhou"
      }
    });
    await waitForFetchCalls(fetchCalls, 2);
    assert.deepEqual(getResponse(fetchCalls[1]?.body).result, {
      success: true,
      actionName: "route.pick",
      result: {
        payload: {
          city: "hangzhou"
        }
      }
    });

    stream.emit("request", {
      requestId: "request-wait",
      method: "waitFor",
      targetId: "route:/home",
      status: "ready",
      where: [
        {
          path: "matches.pathname",
          equals: "/home"
        }
      ],
      options: {
        timeout: 100
      }
    });
    await waitForFetchCalls(fetchCalls, 3);
    const waitResult = getResponse(fetchCalls[2]?.body).result as {
      success?: boolean;
      target?: {
        status?: string;
      };
    };
    assert.equal(waitResult.success, true);
    assert.equal(waitResult.target?.status, "ready");
  } finally {
    restoreGlobal("EventSource", previousEventSource);
    globalThis.fetch = previousFetch;
    clearBridgeConnection();
  }
});

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly url: string;
  readonly #listeners = new Map<string, Array<(event: MessageEvent) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
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
    // Test double; no resources to release.
  }

  emit(type: string, data: unknown): void {
    const event = { data: JSON.stringify(data) } as MessageEvent;
    for (const listener of this.#listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function restoreGlobal(name: "EventSource", value: typeof EventSource | undefined): void {
  if (value === undefined) {
    delete (globalThis as unknown as { EventSource?: typeof EventSource }).EventSource;
    return;
  }
  (globalThis as unknown as { EventSource: typeof EventSource }).EventSource = value;
}

function restoreLocation(value: Location | undefined): void {
  if (value === undefined) {
    delete (globalThis as unknown as { location?: Location }).location;
    return;
  }
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value
  });
}

function clearBridgeConnection(): void {
  delete (globalThis as { __OPEN_RUNTIME_BRIDGE_CONNECTION__?: unknown }).__OPEN_RUNTIME_BRIDGE_CONNECTION__;
}

async function waitForMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function waitForFetchCalls(calls: unknown[], count: number): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (calls.length >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function getResponse(value: unknown): {
  success?: boolean;
  result?: unknown;
} {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  return value as {
    success?: boolean;
    result?: unknown;
  };
}
