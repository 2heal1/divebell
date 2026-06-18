import assert from "node:assert/strict";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { test } from "@rstest/core";

import { createBridgeServer, type BridgeRuntimeInfo } from "../dist/index.js";

test("lists connected runtimes and forwards target reads", async () => {
  const server = createBridgeServer({
    idGenerator: () => "runtime-1",
    clock: createClock(1000)
  });
  const address = await server.listen({ port: 0 });
  const stream = await openRuntimeStream(`${address.url}/connect?url=${encodeURIComponent("http://app.test/")}`);

  try {
    assert.deepEqual(await stream.next("connected"), { runtimeId: "runtime-1" });

    const runtimes = await readJson<{ runtimes: BridgeRuntimeInfo[] }>(`${address.url}/runtimes`);
    assert.deepEqual(runtimes.runtimes, [
      {
        runtimeId: "runtime-1",
        url: "http://app.test/",
        status: "connected",
        connectedAt: 1001,
        lastSeenAt: 1001
      }
    ]);

    const targetsPromise = readJson(`${address.url}/runtimes/runtime-1/targets?source=modern`);
    const request = await stream.next<{ requestId: string; method: string; query: unknown }>("request");
    assert.deepEqual(request, {
      requestId: "request-1",
      method: "getTargets",
      query: {
        source: "modern"
      }
    });

    const targets = [
      {
        id: "route:/home",
        type: "modern.route",
        source: "modern",
        statuses: ["loading", "ready"],
        registeredAt: 100,
        updatedAt: 100
      }
    ];
    await postJson(`${address.url}/runtimes/runtime-1/responses/request-1`, {
      success: true,
      result: targets
    });

    assert.deepEqual(await targetsPromise, targets);
  } finally {
    stream.close();
    await server.close();
  }
});

test("keeps the last snapshot after a runtime disconnects", async () => {
  const server = createBridgeServer({
    idGenerator: () => "runtime-1",
    clock: createClock(2000)
  });
  const address = await server.listen({ port: 0 });
  const stream = await openRuntimeStream(`${address.url}/connect?url=${encodeURIComponent("http://app.test/")}`);

  try {
    await stream.next("connected");
    const snapshotPromise = readJson(`${address.url}/runtimes/runtime-1/snapshot`);
    const request = await stream.next<{ requestId: string }>("request");
    const snapshot = {
      targets: {},
      latestEventId: 0,
      capturedAt: 2005
    };
    await postJson(`${address.url}/runtimes/runtime-1/responses/${request.requestId}`, {
      success: true,
      result: snapshot
    });
    assert.deepEqual(await snapshotPromise, snapshot);

    stream.close();
    await waitForDisconnect();

    assert.deepEqual(await readJson(`${address.url}/runtimes/runtime-1/snapshot`), snapshot);
    const runtimes = await readJson<{ runtimes: BridgeRuntimeInfo[] }>(`${address.url}/runtimes`);
    assert.deepEqual(runtimes.runtimes, []);
  } finally {
    stream.close();
    await server.close();
  }
});

test("creates a fresh runtime when the same URL reconnects", async () => {
  const ids = ["runtime-1", "runtime-2"];
  const server = createBridgeServer({
    idGenerator: () => ids.shift() ?? "runtime-extra",
    clock: createClock(2500)
  });
  const address = await server.listen({ port: 0 });
  const firstStream = await openRuntimeStream(`${address.url}/connect?url=${encodeURIComponent("http://app.test/")}`);

  try {
    assert.deepEqual(await firstStream.next("connected"), { runtimeId: "runtime-1" });
    firstStream.close();
    await waitForDisconnect();

    const secondStream = await openRuntimeStream(`${address.url}/connect?url=${encodeURIComponent("http://app.test/")}`);
    try {
      assert.deepEqual(await secondStream.next("connected"), { runtimeId: "runtime-2" });
      const runtimes = await readJson<{ runtimes: BridgeRuntimeInfo[] }>(`${address.url}/runtimes`);
      assert.deepEqual(runtimes.runtimes.map((runtime) => [runtime.runtimeId, runtime.status]), [
        ["runtime-2", "connected"]
      ]);
    } finally {
      secondStream.close();
    }
  } finally {
    firstStream.close();
    await server.close();
  }
});

test("creates a fresh runtime when a page instance reconnects on another URL", async () => {
  const ids = ["runtime-orders", "runtime-home"];
  const server = createBridgeServer({
    idGenerator: () => ids.shift() ?? "runtime-extra",
    clock: createClock(2700)
  });
  const address = await server.listen({ port: 0 });
  const ordersStream = await openRuntimeStream(`${address.url}/connect?url=${encodeURIComponent("http://app.test/orders")}&pageInstanceId=page-1`);

  try {
    assert.deepEqual(await ordersStream.next("connected"), { runtimeId: "runtime-orders" });
    ordersStream.close();
    await waitForDisconnect();

    const homeStream = await openRuntimeStream(`${address.url}/connect?url=${encodeURIComponent("http://app.test/")}&pageInstanceId=page-1`);
    try {
      assert.deepEqual(await homeStream.next("connected"), { runtimeId: "runtime-home" });
      const runtimes = await readJson<{ runtimes: BridgeRuntimeInfo[] }>(`${address.url}/runtimes`);
      assert.deepEqual(runtimes.runtimes.map((runtime) => [runtime.runtimeId, runtime.status]), [
        ["runtime-home", "connected"]
      ]);
      assert.equal(runtimes.runtimes[0]?.url, "http://app.test/");
      assert.equal(runtimes.runtimes[0]?.pageInstanceId, "page-1");
    } finally {
      homeStream.close();
    }
  } finally {
    ordersStream.close();
    await server.close();
  }
});

test("keeps same-url page instances separate", async () => {
  const ids = ["runtime-tab-a", "runtime-tab-b"];
  const server = createBridgeServer({
    idGenerator: () => ids.shift() ?? "runtime-extra",
    clock: createClock(2800)
  });
  const address = await server.listen({ port: 0 });
  const tabA = await openRuntimeStream(`${address.url}/connect?url=${encodeURIComponent("http://app.test/")}&pageInstanceId=tab-a`);
  const tabB = await openRuntimeStream(`${address.url}/connect?url=${encodeURIComponent("http://app.test/")}&pageInstanceId=tab-b`);

  try {
    assert.deepEqual(await tabA.next("connected"), { runtimeId: "runtime-tab-a" });
    assert.deepEqual(await tabB.next("connected"), { runtimeId: "runtime-tab-b" });
    const runtimes = await readJson<{ runtimes: BridgeRuntimeInfo[] }>(`${address.url}/runtimes`);
    assert.deepEqual(
      runtimes.runtimes.map((runtime) => [runtime.runtimeId, runtime.pageInstanceId]).sort(),
      [
        ["runtime-tab-a", "tab-a"],
        ["runtime-tab-b", "tab-b"]
      ]
    );
  } finally {
    tabA.close();
    tabB.close();
    await server.close();
  }
});

test("tracks a stable session across refreshed runtimes", async () => {
  const ids = ["runtime-before-refresh", "runtime-after-refresh"];
  const server = createBridgeServer({
    idGenerator: () => ids.shift() ?? "runtime-extra",
    clock: createClock(2850)
  });
  const address = await server.listen({ port: 0 });
  const firstStream = await openRuntimeStream(`${address.url}/connect?url=${encodeURIComponent("http://app.test/orders?openruntimeSessionId=session-orders")}&pageInstanceId=page-before&sessionId=session-orders`);

  try {
    assert.deepEqual(await firstStream.next("connected"), { runtimeId: "runtime-before-refresh" });
    firstStream.close();
    await waitForDisconnect();

    const secondStream = await openRuntimeStream(`${address.url}/connect?url=${encodeURIComponent("http://app.test/orders?openruntimeSessionId=session-orders")}&pageInstanceId=page-after&sessionId=session-orders`);
    try {
      assert.deepEqual(await secondStream.next("connected"), { runtimeId: "runtime-after-refresh" });
      const runtimes = await readJson<{ runtimes: BridgeRuntimeInfo[] }>(`${address.url}/runtimes`);
      assert.deepEqual(runtimes.runtimes, [
        {
          runtimeId: "runtime-after-refresh",
          url: "http://app.test/orders?openruntimeSessionId=session-orders",
          sessionId: "session-orders",
          pageInstanceId: "page-after",
          status: "connected",
          connectedAt: 2854,
          lastSeenAt: 2854
        }
      ]);
    } finally {
      secondStream.close();
    }
  } finally {
    firstStream.close();
    await server.close();
  }
});

test("derives session id from the runtime url when connect omits sessionId", async () => {
  const server = createBridgeServer({
    idGenerator: () => "runtime-session-url",
    clock: createClock(2860)
  });
  const address = await server.listen({ port: 0 });
  const stream = await openRuntimeStream(`${address.url}/connect?url=${encodeURIComponent("http://app.test/orders?openruntimeSessionId=session-orders")}&pageInstanceId=page-orders`);

  try {
    assert.deepEqual(await stream.next("connected"), { runtimeId: "runtime-session-url" });
    const runtimes = await readJson<{ runtimes: BridgeRuntimeInfo[] }>(`${address.url}/runtimes`);
    assert.deepEqual(runtimes.runtimes, [
      {
        runtimeId: "runtime-session-url",
        url: "http://app.test/orders?openruntimeSessionId=session-orders",
        sessionId: "session-orders",
        pageInstanceId: "page-orders",
        status: "connected",
        connectedAt: 2861,
        lastSeenAt: 2861
      }
    ]);
  } finally {
    stream.close();
    await server.close();
  }
});

test("links server-rendered runtime state with the later browser connection", async () => {
  const server = createBridgeServer({
    clock: createClock(2900)
  });
  const address = await server.listen({ port: 0 });

  try {
    const serverSnapshot = {
      targets: {
        "modern:ssr": {
          id: "modern:ssr",
          type: "modern.ssr",
          status: "server-rendered",
          updatedAt: 2901,
          source: "modern.js",
          data: {
            environment: "server",
            renderId: "render-1"
          }
        }
      },
      latestEventId: 1,
      capturedAt: 2902
    };
    await postReadJson(`${address.url}/server-runtimes`, {
      runtimeId: "runtime-ssr",
      renderId: "render-1",
      url: "http://app.test/",
      source: "modern.js",
      targets: [
        {
          id: "modern:ssr",
          type: "modern.ssr",
          source: "modern.js",
          statuses: ["rendering", "server-rendered", "fallback", "error"],
          registeredAt: 2900,
          updatedAt: 2900
        }
      ],
      snapshot: serverSnapshot,
      events: {
        events: [
          {
            id: 1,
            type: "snapshot.updated",
            source: "modern.js",
            timestamp: 2902,
            targetId: "modern:ssr",
            status: "server-rendered"
          }
        ],
        latestEventId: 1,
        truncated: false
      },
      actions: []
    });

    assert.deepEqual(await readJson(`${address.url}/runtimes/runtime-ssr/snapshot`), serverSnapshot);
    assert.deepEqual(await postReadJson(`${address.url}/runtimes/runtime-ssr/wait-for`, {
      targetId: "modern:ssr",
      status: "server-rendered",
      where: [
        {
          path: "environment",
          equals: "server"
        }
      ]
    }), {
      success: true,
      condition: {
        id: "modern:ssr",
        status: "server-rendered",
        where: [
          {
            path: "environment",
            equals: "server"
          }
        ]
      },
      snapshot: serverSnapshot,
      target: serverSnapshot.targets["modern:ssr"]
    });

    const serverOnlyRuntimes = await readJson<{ runtimes: BridgeRuntimeInfo[] }>(`${address.url}/runtimes`);
    assert.deepEqual(serverOnlyRuntimes.runtimes, [
      {
        runtimeId: "runtime-ssr",
        renderId: "render-1",
        source: "modern.js",
        url: "http://app.test/",
        status: "server",
        connectedAt: 2901,
        lastSeenAt: 2901
      }
    ]);

    const stream = await openRuntimeStream(`${address.url}/connect?url=${encodeURIComponent("http://app.test/")}&pageInstanceId=page-1&runtimeId=runtime-ssr&renderId=render-1`);
    try {
      assert.deepEqual(await stream.next("connected"), { runtimeId: "runtime-ssr" });

      const snapshotPromise = readJson(`${address.url}/runtimes/runtime-ssr/snapshot`);
      const request = await stream.next<{ requestId: string; method: string }>("request");
      assert.equal(request.method, "getSnapshot");
      await postJson(`${address.url}/runtimes/runtime-ssr/responses/${request.requestId}`, {
        success: true,
        result: {
          targets: {
            "modern:hydration": {
              id: "modern:hydration",
              type: "modern.hydration",
              status: "success",
              updatedAt: 2910,
              source: "modern.js"
            }
          },
          latestEventId: 3,
          capturedAt: 2911
        }
      });

      assert.deepEqual(await snapshotPromise, {
        targets: {
          "modern:hydration": {
            id: "modern:hydration",
            type: "modern.hydration",
            status: "success",
            updatedAt: 2910,
            source: "modern.js"
          },
          "modern:ssr": serverSnapshot.targets["modern:ssr"]
        },
        latestEventId: 3,
        capturedAt: 2911
      });

      const eventsPromise = readJson(`${address.url}/runtimes/runtime-ssr/events?source=modern.js`);
      const eventsRequest = await stream.next<{ requestId: string; method: string; query: unknown }>("request");
      assert.deepEqual(eventsRequest, {
        requestId: "request-2",
        method: "getEvents",
        query: {
          source: "modern.js"
        }
      });
      await postJson(`${address.url}/runtimes/runtime-ssr/responses/${eventsRequest.requestId}`, {
        success: true,
        result: {
          events: [
            {
              id: 2,
              type: "snapshot.updated",
              source: "modern.js",
              timestamp: 2912,
              targetId: "modern:hydration",
              status: "success"
            }
          ],
          latestEventId: 2,
          truncated: false
        }
      });
      assert.deepEqual(await eventsPromise, {
        events: [
          {
            id: 1,
            type: "snapshot.updated",
            source: "modern.js",
            timestamp: 2902,
            targetId: "modern:ssr",
            status: "server-rendered"
          },
          {
            id: 2,
            type: "snapshot.updated",
            source: "modern.js",
            timestamp: 2912,
            targetId: "modern:hydration",
            status: "success"
          }
        ],
        latestEventId: 2,
        truncated: false
      });
    } finally {
      stream.close();
    }
  } finally {
    await server.close();
  }
});

test("forwards input options, action runs, and wait requests", async () => {
  const server = createBridgeServer({
    idGenerator: () => "runtime-1",
    clock: createClock(3000)
  });
  const address = await server.listen({ port: 0 });
  const stream = await openRuntimeStream(`${address.url}/connect?url=${encodeURIComponent("http://app.test/")}`);

  try {
    await stream.next("connected");

    const optionsPromise = readJson(`${address.url}/runtimes/runtime-1/actions/demo.select/options?input=region&payload=${encodeURIComponent(JSON.stringify({ country: "cn" }))}&timeout=20`);
    const optionsRequest = await stream.next("request");
    assert.deepEqual(optionsRequest, {
      requestId: "request-1",
      method: "getInputOptions",
      actionName: "demo.select",
      inputName: "region",
      payload: {
        country: "cn"
      },
      options: {
        timeout: 20
      }
    });
    await postJson(`${address.url}/runtimes/runtime-1/responses/request-1`, {
      success: true,
      result: [
        {
          value: "hangzhou"
        }
      ]
    });
    assert.deepEqual(await optionsPromise, [
      {
        value: "hangzhou"
      }
    ]);

    const runPromise = postReadJson(`${address.url}/runtimes/runtime-1/actions/demo.select/run`, {
      payload: {
        region: "hangzhou"
      }
    });
    const runRequest = await stream.next("request");
    assert.deepEqual(runRequest, {
      requestId: "request-2",
      method: "runAction",
      actionName: "demo.select",
      payload: {
        region: "hangzhou"
      }
    });
    await postJson(`${address.url}/runtimes/runtime-1/responses/request-2`, {
      success: true,
      result: {
        success: true,
        actionName: "demo.select",
        result: {
          accepted: true
        }
      }
    });
    assert.deepEqual(await runPromise, {
      success: true,
      actionName: "demo.select",
      result: {
        accepted: true
      }
    });

    const waitPromise = postReadJson(`${address.url}/runtimes/runtime-1/wait-for`, {
      targetId: "route:/home",
      status: "ready",
      timeout: 30,
      where: [
        {
          path: "matches.pathname",
          equals: "/orders"
        }
      ]
    });
    const waitRequest = await stream.next("request");
    assert.deepEqual(waitRequest, {
      requestId: "request-3",
      method: "waitFor",
      targetId: "route:/home",
      status: "ready",
      where: [
        {
          path: "matches.pathname",
          equals: "/orders"
        }
      ],
      options: {
        timeout: 30
      }
    });
    await postJson(`${address.url}/runtimes/runtime-1/responses/request-3`, {
      success: true,
      result: {
        success: true,
        condition: {
          id: "route:/home",
          status: "ready"
        },
        snapshot: {
          targets: {},
          latestEventId: 0,
          capturedAt: 3005
        }
      }
    });
    assert.deepEqual(await waitPromise, {
      success: true,
      condition: {
        id: "route:/home",
        status: "ready"
      },
      snapshot: {
        targets: {},
        latestEventId: 0,
        capturedAt: 3005
      }
    });
  } finally {
    stream.close();
    await server.close();
  }
});

test("forwards wait requests to connected runtimes even when a cached target exists", async () => {
  const server = createBridgeServer({
    clock: createClock(3500)
  });
  const address = await server.listen({ port: 0 });

  try {
    await postJson(`${address.url}/server-runtimes`, {
      runtimeId: "runtime-ssr",
      renderId: "render-1",
      source: "modern.js",
      url: "http://app.test/",
      targets: [
        {
          id: "modern:route",
          type: "modern.route",
          source: "modern.js",
          statuses: ["idle", "loading", "ready", "error"],
          registeredAt: 3501,
          updatedAt: 3501,
          data: {
            routes: []
          }
        }
      ],
      snapshot: {
        targets: {},
        latestEventId: 0,
        capturedAt: 3502
      },
      events: {
        events: [],
        latestEventId: 0,
        truncated: false
      },
      actions: []
    });

    const stream = await openRuntimeStream(`${address.url}/connect?url=${encodeURIComponent("http://app.test/")}&runtimeId=runtime-ssr&renderId=render-1`);
    try {
      await stream.next("connected");

      const waitPromise = postReadJson(`${address.url}/runtimes/runtime-ssr/wait-for`, {
        targetId: "modern:route",
        status: "ready",
        timeout: 1000,
        where: [
          {
            path: "pathname",
            equals: "/details"
          }
        ]
      });
      const waitRequest = await stream.next("request");
      assert.deepEqual(waitRequest, {
        requestId: "request-1",
        method: "waitFor",
        targetId: "modern:route",
        status: "ready",
        where: [
          {
            path: "pathname",
            equals: "/details"
          }
        ],
        options: {
          timeout: 1000
        }
      });

      const result = {
        success: true,
        condition: {
          id: "modern:route",
          status: "ready"
        },
        snapshot: {
          targets: {
            "modern:route": {
              id: "modern:route",
              type: "modern.route",
              status: "ready",
              updatedAt: 3510,
              source: "modern.js",
              data: {
                pathname: "/details"
              }
            }
          },
          latestEventId: 1,
          capturedAt: 3511
        }
      };
      await postJson(`${address.url}/runtimes/runtime-ssr/responses/request-1`, {
        success: true,
        result
      });
      assert.deepEqual(await waitPromise, result);
    } finally {
      stream.close();
    }
  } finally {
    await server.close();
  }
});

test("rejects execution requests for disconnected runtimes", async () => {
  const server = createBridgeServer({
    idGenerator: () => "runtime-1",
    clock: createClock(4000)
  });
  const address = await server.listen({ port: 0 });
  const stream = await openRuntimeStream(`${address.url}/connect?url=${encodeURIComponent("http://app.test/")}`);

  try {
    await stream.next("connected");
    stream.close();
    await waitForDisconnect();

    const response = await fetch(`${address.url}/runtimes/runtime-1/wait-for`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        targetId: "route:/home",
        status: "ready"
      })
    });
    const body = await response.json() as { error?: { code?: string } };
    assert.equal(response.status, 409);
    assert.equal(body.error?.code, "runtime_disconnected");
  } finally {
    stream.close();
    await server.close();
  }
});

test("rejects pending wait requests when the runtime disconnects", async () => {
  const server = createBridgeServer({
    idGenerator: () => "runtime-1",
    clock: createClock(4500)
  });
  const address = await server.listen({ port: 0 });
  const stream = await openRuntimeStream(`${address.url}/connect?url=${encodeURIComponent("http://app.test/")}`);

  try {
    await stream.next("connected");

    const waitPromise = fetch(`${address.url}/runtimes/runtime-1/wait-for`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        targetId: "route:/home",
        status: "ready"
      })
    });
    const request = await stream.next<{ requestId: string; method: string }>("request");
    assert.deepEqual(request, {
      requestId: "request-1",
      method: "waitFor",
      targetId: "route:/home",
      status: "ready"
    });

    stream.close();
    await waitForDisconnect();

    const response = await waitPromise;
    const body = await response.json() as { error?: { code?: string; message?: string } };
    assert.equal(response.status, 409);
    assert.equal(body.error?.code, "runtime_disconnected");
    assert.match(body.error?.message ?? "", /disconnected before responding/);
  } finally {
    stream.close();
    await server.close();
  }
});

class TestRuntimeStream {
  readonly #request: ReturnType<typeof httpRequest>;
  readonly #waiters = new Map<string, Array<(data: unknown) => void>>();
  readonly #events = new Map<string, unknown[]>();

  constructor(request: ReturnType<typeof httpRequest>, response: IncomingMessage) {
    this.#request = request;
    let buffer = "";
    response.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        this.#push(parseServerSentEvent(raw));
        boundary = buffer.indexOf("\n\n");
      }
    });
  }

  next<T = unknown>(event: string): Promise<T> {
    const queued = this.#events.get(event);
    if (queued !== undefined && queued.length > 0) {
      return Promise.resolve(queued.shift() as T);
    }

    return new Promise((resolve) => {
      const waiters = this.#waiters.get(event);
      if (waiters === undefined) {
        this.#waiters.set(event, [resolve as (data: unknown) => void]);
        return;
      }
      waiters.push(resolve as (data: unknown) => void);
    });
  }

  close(): void {
    this.#request.destroy();
  }

  #push(event: { event: string; data: unknown }): void {
    const waiters = this.#waiters.get(event.event);
    const waiter = waiters?.shift();
    if (waiter !== undefined) {
      waiter(event.data);
      return;
    }

    const queued = this.#events.get(event.event);
    if (queued === undefined) {
      this.#events.set(event.event, [event.data]);
      return;
    }
    queued.push(event.data);
  }
}

function openRuntimeStream(url: string): Promise<TestRuntimeStream> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { method: "GET" }, (response) => {
      resolve(new TestRuntimeStream(request, response));
    });
    request.on("error", reject);
    request.end();
  });
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

async function readJson<T = unknown>(url: string): Promise<T> {
  const response = await fetch(url);
  const text = await response.text();
  assert.equal(response.ok, true, text);
  return JSON.parse(text) as T;
}

async function postJson(url: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  assert.equal(response.ok, true, text);
}

async function postReadJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  assert.equal(response.ok, true, text);
  return JSON.parse(text) as T;
}

function createClock(start: number): { now(): number } {
  let current = start;
  return {
    now: () => {
      current += 1;
      return current;
    }
  };
}

async function waitForDisconnect(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
}
