import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "@rstest/core";

import { runCli } from "../dist/index.js";

import { createOpenContextFixture, createOutput, errorOutput, jsonResponse } from "./helpers.js";

test("passes keyword query to events", async () => {
  const calls: string[] = [];
  const output = createOutput();
  const exitCode = await runCli(["events", "--bridge", "http://bridge.test", "--url", "http://app.test/", "--query", "react", "--limit", "50"], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      calls.push(String(url));
      if (String(url).endsWith("/runtimes")) {
        return jsonResponse({
          runtimes: [
            {
              runtimeId: "runtime-1",
              url: "http://app.test/",
              status: "connected",
              connectedAt: 1,
              lastSeenAt: 2
            }
          ]
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-1/events?limit=50&query=react");
      return jsonResponse({
        events: [],
        latestEventId: 0,
        truncated: false
      });
    }
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [
    "http://bridge.test/runtimes",
    "http://bridge.test/runtimes/runtime-1/events?limit=50&query=react"
  ]);
});

test("prints runtimes from the configured bridge", async () => {
  const output = createOutput();
  const exitCode = await runCli(["runtimes", "--bridge", "http://bridge.test"], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      assert.equal(String(url), "http://bridge.test/runtimes");
      return jsonResponse({
        runtimes: [
          {
            runtimeId: "runtime-1",
            url: "http://app.test/",
            status: "connected",
            connectedAt: 1,
            lastSeenAt: 2
          }
        ]
      });
    }
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(JSON.parse(output.text()), {
    bridgeUrl: "http://bridge.test",
    runtimes: [
      {
        runtimeId: "runtime-1",
        url: "http://app.test/",
        status: "connected",
        connectedAt: 1,
        lastSeenAt: 2
      }
    ]
  });
});

test("uses the current directory open context when listing runtimes", async () => {
  const context = createOpenContextFixture({
    bridgeUrl: "http://bridge.context",
    bridgePort: 18421
  });
  const output = createOutput();
  const calls: string[] = [];

  try {
    const exitCode = await runCli(["runtimes"], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory: context.operationLogDirectory,
      fetcher: async (url) => {
        calls.push(String(url));
        return jsonResponse({ runtimes: [] });
      }
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(calls, ["http://bridge.context/runtimes"]);
    assert.equal(JSON.parse(output.text()).bridgeUrl, "http://bridge.context");
  } finally {
    context.cleanup();
  }
});

test("auto-starts a local bridge before listing runtimes", async () => {
  const output = createOutput();
  const stateDirectory = mkdtempSync(join(tmpdir(), "divebell-cli-state-"));
  const calls: string[] = [];
  let bridgeStarted = false;

  try {
    const exitCode = await runCli(["runtimes", "--port", "18083"], {
      stdout: output.stdout,
      stderr: output.stderr,
      bridgeStateDirectory: stateDirectory,
      fetcher: async (url) => {
        calls.push(String(url));
        assert.equal(String(url), "http://localhost:18083/runtimes");
        if (!bridgeStarted) {
          throw new TypeError("fetch failed");
        }
        return jsonResponse({
          runtimes: [
            {
              runtimeId: "runtime-1",
              url: "http://app.test/",
              status: "connected",
              connectedAt: 1,
              lastSeenAt: 2
            }
          ]
        });
      },
      bridgeStarter: {
        start: async ({ port }) => {
          assert.equal(port, 18083);
          bridgeStarted = true;
          return { pid: 34567 };
        }
      }
    });

    assert.equal(exitCode, 0);
    assert.equal(output.errorText(), "");
    assert.equal(bridgeStarted, true);
    assert.deepEqual(calls, [
      "http://localhost:18083/runtimes",
      "http://localhost:18083/runtimes",
      "http://localhost:18083/runtimes"
    ]);
    assert.equal(JSON.parse(output.text()).runtimes[0].runtimeId, "runtime-1");
  } finally {
    rmSync(stateDirectory, {
      recursive: true,
      force: true
    });
  }
});

test("auto-starts a local bridge before reading runtime resources", async () => {
  const output = createOutput();
  const stateDirectory = mkdtempSync(join(tmpdir(), "divebell-cli-state-"));
  const calls: string[] = [];
  let bridgeStarted = false;

  try {
    const exitCode = await runCli(["snapshot", "--port", "18084", "--url", "http://app.test/"], {
      stdout: output.stdout,
      stderr: output.stderr,
      bridgeStateDirectory: stateDirectory,
      fetcher: async (url) => {
        calls.push(String(url));
        if (String(url) === "http://localhost:18084/runtimes") {
          if (!bridgeStarted) {
            throw new TypeError("fetch failed");
          }
          return jsonResponse({
            runtimes: [
              {
                runtimeId: "runtime-1",
                url: "http://app.test/",
                status: "connected",
                connectedAt: 1,
                lastSeenAt: 2
              }
            ]
          });
        }

        assert.equal(String(url), "http://localhost:18084/runtimes/runtime-1/snapshot");
        return jsonResponse({
          targets: {},
          latestEventId: 0,
          capturedAt: 10
        });
      },
      bridgeStarter: {
        start: async ({ port }) => {
          assert.equal(port, 18084);
          bridgeStarted = true;
          return { pid: 34568 };
        }
      }
    });

    assert.equal(exitCode, 0);
    assert.equal(output.errorText(), "");
    assert.equal(bridgeStarted, true);
    assert.deepEqual(calls, [
      "http://localhost:18084/runtimes",
      "http://localhost:18084/runtimes",
      "http://localhost:18084/runtimes",
      "http://localhost:18084/runtimes/runtime-1/snapshot"
    ]);
    assert.equal(JSON.parse(output.text()).runtime.runtimeId, "runtime-1");
  } finally {
    rmSync(stateDirectory, {
      recursive: true,
      force: true
    });
  }
});

test("selects the first matching runtime for read commands", async () => {
  const calls: string[] = [];
  const output = createOutput();
  const exitCode = await runCli(["snapshot", "--bridge", "http://bridge.test", "--url", "http://app.test/"], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      calls.push(String(url));
      if (String(url).endsWith("/runtimes")) {
        return jsonResponse({
          runtimes: [
            {
              runtimeId: "runtime-old",
              url: "http://app.test/",
              status: "connected",
              connectedAt: 1,
              lastSeenAt: 2
            },
            {
              runtimeId: "runtime-new",
              url: "http://app.test/",
              status: "connected",
              connectedAt: 3,
              lastSeenAt: 4
            }
          ]
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-old/snapshot");
      return jsonResponse({
        targets: {},
        latestEventId: 0,
        capturedAt: 10
      });
    }
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [
    "http://bridge.test/runtimes",
    "http://bridge.test/runtimes/runtime-old/snapshot"
  ]);
  assert.deepEqual(JSON.parse(output.text()), {
    runtime: {
      runtimeId: "runtime-old",
      url: "http://app.test/",
      status: "connected",
      connectedAt: 1,
      lastSeenAt: 2
    },
    result: {
      targets: {},
      latestEventId: 0,
      capturedAt: 10
    }
  });
});

test("uses the first runtime for actions when multiple instances match", async () => {
  const output = createOutput();
  const calls: string[] = [];
  const exitCode = await runCli([
    "run-action",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://app.test/",
    "route.pick"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      calls.push(String(url));
      if (String(url).endsWith("/runtimes")) {
        return jsonResponse({
          runtimes: [
            {
              runtimeId: "runtime-main",
              url: "http://app.test/",
              status: "connected",
              connectedAt: 1,
              lastSeenAt: 2
            },
            {
              runtimeId: "runtime-child",
              url: "http://app.test/",
              status: "connected",
              connectedAt: 3,
              lastSeenAt: 4
            }
          ]
        });
      }
      assert.equal(String(url), "http://bridge.test/runtimes/runtime-main/actions/route.pick/run");
      return jsonResponse({ selected: "main" });
    }
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [
    "http://bridge.test/runtimes",
    "http://bridge.test/runtimes/runtime-main/actions/route.pick/run"
  ]);
  assert.equal(JSON.parse(output.text()).runtime.runtimeId, "runtime-main");
});

test("matches runtime url when root path trailing slash differs", async () => {
  const output = createOutput();
  const exitCode = await runCli(["snapshot", "--bridge", "http://bridge.test", "--url", "http://app.test"], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      if (String(url).endsWith("/runtimes")) {
        return jsonResponse({
          runtimes: [
            {
              runtimeId: "runtime-root",
              url: "http://app.test/",
              status: "connected",
              connectedAt: 1,
              lastSeenAt: 2
            }
          ]
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-root/snapshot");
      return jsonResponse({
        targets: {},
        latestEventId: 0,
        capturedAt: 10
      });
    }
  });

  assert.equal(exitCode, 0);
  assert.equal(JSON.parse(output.text()).runtime.runtimeId, "runtime-root");
});

test("matches localhost and IPv4 loopback runtime URLs for read commands", async () => {
  const output = createOutput();
  const exitCode = await runCli(["snapshot", "--bridge", "http://bridge.test", "--url", "http://localhost:3000/orders"], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      if (String(url).endsWith("/runtimes")) {
        return jsonResponse({
          runtimes: [
            {
              runtimeId: "runtime-loopback",
              url: "http://127.0.0.1:3000/orders",
              status: "connected",
              connectedAt: 1,
              lastSeenAt: 2
            }
          ]
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-loopback/snapshot");
      return jsonResponse({
        targets: {},
        latestEventId: 0,
        capturedAt: 10
      });
    }
  });

  assert.equal(exitCode, 0);
  assert.equal(JSON.parse(output.text()).runtime.runtimeId, "runtime-loopback");
});

test("matches runtime url when the runtime only adds the Divebell session query", async () => {
  const output = createOutput();
  const exitCode = await runCli(["snapshot", "--bridge", "http://bridge.test", "--url", "http://app.test"], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      if (String(url).endsWith("/runtimes")) {
        return jsonResponse({
          runtimes: [
            {
              runtimeId: "runtime-session-url",
              url: "http://app.test/?divebellSessionId=session-orders",
              status: "connected",
              connectedAt: 1,
              lastSeenAt: 2
            }
          ]
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-session-url/snapshot");
      return jsonResponse({
        targets: {},
        latestEventId: 0,
        capturedAt: 10
      });
    }
  });

  assert.equal(exitCode, 0);
  assert.equal(JSON.parse(output.text()).runtime.runtimeId, "runtime-session-url");
});

test("selects the latest matching runtime by session", async () => {
  const calls: string[] = [];
  const output = createOutput();
  const exitCode = await runCli(["snapshot", "--bridge", "http://bridge.test", "--session", "session-orders"], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      calls.push(String(url));
      if (String(url).endsWith("/runtimes")) {
        return jsonResponse({
          runtimes: [
            {
              runtimeId: "runtime-other",
              url: "http://app.test/orders",
              sessionId: "session-other",
              status: "connected",
              connectedAt: 1,
              lastSeenAt: 20
            },
            {
              runtimeId: "runtime-before-refresh",
              url: "http://app.test/orders?divebellSessionId=session-orders",
              sessionId: "session-orders",
              status: "disconnected",
              connectedAt: 1,
              lastSeenAt: 2,
              disconnectedAt: 3
            },
            {
              runtimeId: "runtime-after-refresh",
              url: "http://app.test/orders?divebellSessionId=session-orders",
              sessionId: "session-orders",
              status: "connected",
              connectedAt: 4,
              lastSeenAt: 5
            }
          ]
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-after-refresh/snapshot");
      return jsonResponse({
        targets: {},
        latestEventId: 0,
        capturedAt: 10
      });
    }
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [
    "http://bridge.test/runtimes",
    "http://bridge.test/runtimes/runtime-after-refresh/snapshot"
  ]);
  assert.equal(JSON.parse(output.text()).runtime.runtimeId, "runtime-after-refresh");
});

test("selects runtime by session from the runtime url when sessionId is not exposed", async () => {
  const output = createOutput();
  const exitCode = await runCli(["snapshot", "--bridge", "http://bridge.test", "--session", "session-orders"], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      if (String(url).endsWith("/runtimes")) {
        return jsonResponse({
          runtimes: [
            {
              runtimeId: "runtime-other",
              url: "http://app.test/orders?divebellSessionId=session-other",
              status: "connected",
              connectedAt: 1,
              lastSeenAt: 20
            },
            {
              runtimeId: "runtime-orders",
              url: "http://app.test/orders?divebellSessionId=session-orders",
              status: "connected",
              connectedAt: 1,
              lastSeenAt: 30
            }
          ]
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-orders/snapshot");
      return jsonResponse({
        targets: {},
        latestEventId: 0,
        capturedAt: 10
      });
    }
  });

  assert.equal(exitCode, 0);
  assert.equal(JSON.parse(output.text()).runtime.runtimeId, "runtime-orders");
});

test("runs execution commands against the selected runtime", async () => {
  const calls: Array<{ url: string; method?: string; body?: unknown }> = [];
  const runtimes = [
    {
      runtimeId: "runtime-1",
      url: "http://app.test/",
      status: "connected",
      connectedAt: 1,
      lastSeenAt: 2
    }
  ];
  const fetcher = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const call: {
      url: string;
      method?: string;
      body?: unknown;
    } = {
      url: String(url)
    };
    if (init?.method !== undefined) {
      call.method = init.method;
    }
    if (init?.body !== undefined) {
      call.body = JSON.parse(String(init.body));
    }
    calls.push(call);

    const textUrl = String(url);
    if (textUrl.endsWith("/runtimes")) {
      return jsonResponse({ runtimes });
    }
    if (textUrl.includes("/actions/route.pick/run")) {
      return jsonResponse({ success: true, actionName: "route.pick" });
    }
    if (textUrl.endsWith("/wait-for")) {
      return jsonResponse({
        success: true,
        condition: {
          id: "route:/home",
          status: "ready"
        },
        snapshot: {
          targets: {},
          latestEventId: 0,
          capturedAt: 10
        }
      });
    }

    return jsonResponse({});
  };

  assert.equal(await runCli([
    "run-action",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://app.test/",
    "route.pick",
    "--payload",
    "{\"city\":\"hangzhou\"}"
  ], {
    stdout: createOutput().stdout,
    stderr: createOutput().stderr,
    fetcher
  }), 0);

  assert.equal(await runCli([
    "wait-for",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://app.test/",
    "route:/home",
    "ready",
    "--strict",
    "--where",
    "matches.pathname=/orders",
    "--where",
    "data.mounted=true",
    "--where",
    "data.matchedCount=1",
    "--where",
    "data.optional=null",
    "--timeout",
    "30"
  ], {
    stdout: createOutput().stdout,
    stderr: createOutput().stderr,
    fetcher
  }), 0);

  assert.deepEqual(calls, [
    {
      url: "http://bridge.test/runtimes"
    },
    {
      url: "http://bridge.test/runtimes/runtime-1/actions/route.pick/run",
      method: "POST",
      body: {
        payload: {
          city: "hangzhou"
        }
      }
    },
    {
      url: "http://bridge.test/runtimes"
    },
    {
      url: "http://bridge.test/runtimes/runtime-1/wait-for",
      method: "POST",
      body: {
        targetId: "route:/home",
        status: "ready",
        timeout: 30,
        where: [
          {
            path: "matches.pathname",
            equals: "/orders"
          },
          {
            path: "data.mounted",
            equals: true
          },
          {
            path: "data.matchedCount",
            equals: 1
          },
          {
            path: "data.optional",
            equals: null
          }
        ]
      }
    }
  ]);
});

test("rejects invalid payload json", async () => {
  const output = createOutput();
  const exitCode = await runCli([
    "run-action",
    "route.pick",
    "--payload",
    "{"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async () => jsonResponse({ runtimes: [] })
  });

  assert.equal(exitCode, 1);
  assert.equal(output.errorText(), "");
  assert.deepEqual(JSON.parse(output.text()), errorOutput("run-action route.pick", {
    code: "CLI_PAYLOAD_INVALID_JSON",
    kind: "validation",
    message: "--payload must be valid JSON.",
    retryable: false,
    hint: "Pass --payload as a JSON object string."
  }));
});
