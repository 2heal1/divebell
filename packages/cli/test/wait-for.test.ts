import assert from "node:assert/strict";
import { test } from "@rstest/core";

import { runCli } from "../dist/index.js";

import { createBrowserRunner, createOutput, jsonResponse } from "./helpers.js";

test("wait-for follows the latest matching runtime unless strict mode is set", async () => {
  const calls: Array<{ url: string; method?: string; body?: unknown }> = [];
  const output = createOutput();
  const exitCode = await runCli([
    "wait-for",
    "--bridge",
    "http://bridge.test",
    "--runtime",
    "runtime-before-refresh",
    "--url",
    "http://app.test/orders",
    "modern:route",
    "ready",
    "--timeout",
    "300"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url, init) => {
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

      if (String(url) === "http://bridge.test/runtimes") {
        return jsonResponse({
          runtimes: [
            {
              runtimeId: "runtime-before-refresh",
              url: "http://app.test/orders",
              status: "disconnected",
              connectedAt: 1,
              lastSeenAt: 2,
              disconnectedAt: 3
            },
            {
              runtimeId: "runtime-after-refresh",
              url: "http://app.test/orders",
              status: "connected",
              connectedAt: 4,
              lastSeenAt: 5
            }
          ]
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-after-refresh/wait-for");
      assert.equal(init?.method, "POST");
      return jsonResponse({
        success: true,
        condition: {
          id: "modern:route",
          status: "ready"
        },
        snapshot: {
          targets: {},
          latestEventId: 0,
          capturedAt: 10
        }
      });
    }
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls.map((call) => call.url), [
    "http://bridge.test/runtimes",
    "http://bridge.test/runtimes/runtime-after-refresh/wait-for"
  ]);
  assert.equal(JSON.parse(output.text()).runtime.runtimeId, "runtime-after-refresh");
});

test("wait-for waits for a runtime to connect when none is currently connected", async () => {
  const calls: string[] = [];
  let runtimesCalls = 0;

  const output = createOutput();
  const exitCode = await runCli([
    "wait-for",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://app.test/orders",
    "modern:route",
    "ready",
    "--timeout",
    "350"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url, init) => {
      calls.push(String(url));

      if (String(url) === "http://bridge.test/runtimes") {
        runtimesCalls += 1;
        return jsonResponse({
          runtimes: runtimesCalls < 2
            ? []
            : [
                {
                  runtimeId: "runtime-new",
                  url: "http://app.test/orders",
                  status: "connected",
                  connectedAt: 1,
                  lastSeenAt: 2
                }
              ]
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-new/wait-for");
      assert.equal(init?.method, "POST");
      return jsonResponse({
        success: true,
        condition: {
          id: "modern:route",
          status: "ready"
        },
        snapshot: {
          targets: {},
          latestEventId: 0,
          capturedAt: 10
        }
      });
    }
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [
    "http://bridge.test/runtimes",
    "http://bridge.test/runtimes",
    "http://bridge.test/runtimes/runtime-new/wait-for"
  ]);
  assert.equal(JSON.parse(output.text()).runtime.runtimeId, "runtime-new");
});

test("wait-for keeps following when the current runtime has not registered the target", async () => {
  const calls: string[] = [];
  let runtimesCalls = 0;

  const output = createOutput();
  const exitCode = await runCli([
    "wait-for",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://app.test/orders",
    "modern:route",
    "ready",
    "--timeout",
    "500"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      calls.push(String(url));

      if (String(url) === "http://bridge.test/runtimes") {
        runtimesCalls += 1;
        return jsonResponse({
          runtimes: runtimesCalls < 2
            ? [
                {
                  runtimeId: "runtime-old",
                  url: "http://app.test/orders",
                  status: "connected",
                  connectedAt: 1,
                  lastSeenAt: 2
                }
              ]
            : [
                {
                  runtimeId: "runtime-old",
                  url: "http://app.test/orders",
                  status: "disconnected",
                  connectedAt: 1,
                  lastSeenAt: 2,
                  disconnectedAt: 3
                },
                {
                  runtimeId: "runtime-new",
                  url: "http://app.test/orders",
                  status: "connected",
                  connectedAt: 4,
                  lastSeenAt: 5
                }
              ]
        });
      }

      if (String(url) === "http://bridge.test/runtimes/runtime-old/wait-for") {
        return jsonResponse({
          success: false,
          condition: {
            id: "modern:route",
            status: "ready"
          },
          snapshot: {
            targets: {},
            latestEventId: 0,
            capturedAt: 10
          },
          reason: "Target is not registered."
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-new/wait-for");
      return jsonResponse({
        success: true,
        condition: {
          id: "modern:route",
          status: "ready"
        },
        snapshot: {
          targets: {},
          latestEventId: 0,
          capturedAt: 20
        }
      });
    }
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [
    "http://bridge.test/runtimes",
    "http://bridge.test/runtimes/runtime-old/wait-for",
    "http://bridge.test/runtimes",
    "http://bridge.test/runtimes/runtime-new/wait-for"
  ]);
  assert.equal(JSON.parse(output.text()).runtime.runtimeId, "runtime-new");
});

test("wait-for next ignores runtimes that were connected before the command started", async () => {
  const calls: string[] = [];
  let runtimesCalls = 0;

  const output = createOutput();
  const exitCode = await runCli([
    "wait-for",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://app.test/orders",
    "modern:route",
    "ready",
    "--next",
    "--timeout",
    "500"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url, init) => {
      calls.push(String(url));

      if (String(url) === "http://bridge.test/runtimes") {
        runtimesCalls += 1;
        return jsonResponse({
          runtimes: runtimesCalls < 3
            ? [
                {
                  runtimeId: "runtime-existing",
                  url: "http://app.test/orders",
                  status: "connected",
                  connectedAt: 1,
                  lastSeenAt: 2
                }
              ]
            : [
                {
                  runtimeId: "runtime-existing",
                  url: "http://app.test/orders",
                  status: "connected",
                  connectedAt: 1,
                  lastSeenAt: 2
                },
                {
                  runtimeId: "runtime-next",
                  url: "http://app.test/orders",
                  status: "connected",
                  connectedAt: 3,
                  lastSeenAt: 4
                }
              ]
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-next/wait-for");
      assert.equal(init?.method, "POST");
      return jsonResponse({
        success: true,
        condition: {
          id: "modern:route",
          status: "ready"
        },
        snapshot: {
          targets: {},
          latestEventId: 0,
          capturedAt: 10
        }
      });
    }
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [
    "http://bridge.test/runtimes",
    "http://bridge.test/runtimes",
    "http://bridge.test/runtimes",
    "http://bridge.test/runtimes/runtime-next/wait-for"
  ]);
  assert.equal(JSON.parse(output.text()).runtime.runtimeId, "runtime-next");
});

test("wait-for next reports when no new runtime connects before timeout", async () => {
  const output = createOutput();
  const exitCode = await runCli([
    "wait-for",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://app.test/orders",
    "modern:route",
    "ready",
    "--next",
    "--timeout",
    "20"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      assert.equal(String(url), "http://bridge.test/runtimes");
      return jsonResponse({
        runtimes: [
          {
            runtimeId: "runtime-existing",
            url: "http://app.test/orders",
            status: "connected",
            connectedAt: 1,
            lastSeenAt: 2
          }
        ]
      });
    }
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(JSON.parse(output.text()), {
    result: {
      success: false,
      condition: {
        id: "modern:route",
        status: "ready"
      },
      reason: "No new connected runtime was found before timeout."
    }
  });
  assert.equal(output.errorText(), "No new connected runtime was found before timeout.\n");
});

test("wait-for rejects next with strict mode", async () => {
  const output = createOutput();
  const exitCode = await runCli([
    "wait-for",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://app.test/orders",
    "modern:route",
    "ready",
    "--next",
    "--strict"
  ], {
    stdout: output.stdout,
    stderr: output.stderr
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(JSON.parse(output.text()), {
    result: {
      success: false,
      condition: {
        id: "modern:route",
        status: "ready"
      },
      reason: "--next cannot be used with --strict."
    }
  });
  assert.equal(output.errorText(), "--next cannot be used with --strict.\n");
});

test("wait-for returns a failing exit code with structured output when the condition is not met", async () => {
  const output = createOutput();
  const exitCode = await runCli([
    "wait-for",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://app.test/orders",
    "modern:route",
    "ready",
    "--timeout",
    "20"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      if (String(url) === "http://bridge.test/runtimes") {
        return jsonResponse({
          runtimes: [
            {
              runtimeId: "runtime-1",
              url: "http://app.test/orders",
              status: "connected",
              connectedAt: 1,
              lastSeenAt: 2
            }
          ]
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-1/wait-for");
      return jsonResponse({
        success: false,
        condition: {
          id: "modern:route",
          status: "ready"
        },
        snapshot: {
          targets: {},
          latestEventId: 0,
          capturedAt: 10
        },
        reason: "Timed out waiting for target status."
      });
    }
  });

  assert.equal(exitCode, 1);
  assert.equal(output.errorText(), "");
  assert.deepEqual(JSON.parse(output.text()), {
    runtime: {
      runtimeId: "runtime-1",
      url: "http://app.test/orders",
      status: "connected",
      connectedAt: 1,
      lastSeenAt: 2
    },
    result: {
      success: false,
      condition: {
        id: "modern:route",
        status: "ready"
      },
      snapshot: {
        targets: {},
        latestEventId: 0,
        capturedAt: 10
      },
      reason: "Timed out waiting for target status."
    }
  });
});

test("suggests open when wait-for cannot find a matching runtime", async () => {
  const output = createOutput();
  const exitCode = await runCli([
    "wait-for",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://app.test/route-a",
    "modern:route",
    "ready",
    "--timeout",
    "1"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      assert.equal(String(url), "http://bridge.test/runtimes");
      return jsonResponse({ runtimes: [] });
    }
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(JSON.parse(output.text()), {
    result: {
      success: false,
      condition: {
        id: "modern:route",
        status: "ready"
      },
      reason: "No connected runtime matched URL \"http://app.test/route-a\".\nRun `openruntime open <url>` before waiting."
    }
  });
  assert.equal(
    output.errorText(),
    "No connected runtime matched URL \"http://app.test/route-a\".\nRun `openruntime open <url>` before waiting.\n"
  );
});

test("opens a page before wait-for when open is set", async () => {
  const calls: Array<{ url: string; method?: string; body?: unknown }> = [];
  const browserCalls: string[][] = [];
  let opened = false;

  const output = createOutput();
  const exitCode = await runCli([
    "wait-for",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://app.test/route-a",
    "modern:route",
    "ready",
    "--where",
    "pathname=/route-a",
    "--open",
    "--timeout",
    "500"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url, init) => {
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

      if (String(url) === "http://bridge.test/runtimes") {
        return jsonResponse({
          runtimes: opened
            ? [
                {
                  runtimeId: "runtime-1",
                  url: "http://app.test/route-a",
                  status: "connected",
                  connectedAt: 1,
                  lastSeenAt: 2
                }
              ]
            : []
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-1/wait-for");
      return jsonResponse({
        success: true,
        condition: {
          id: "modern:route",
          status: "ready"
        },
        target: {
          id: "modern:route",
          type: "modern.route",
          status: "ready",
          updatedAt: 10,
          data: {
            pathname: "/route-a"
          }
        },
        snapshot: {
          targets: {},
          latestEventId: 0,
          capturedAt: 10
        }
      });
    },
    browserRunner: createBrowserRunner(async (args) => {
      browserCalls.push(args);
      opened = true;
      return {
        exitCode: 0,
        stdout: "opened\n",
        stderr: ""
      };
    })
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(browserCalls, [["open", "http://app.test/route-a"]]);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.slice(0, 3), [
    {
      url: "http://bridge.test/runtimes"
    },
    {
      url: "http://bridge.test/runtimes"
    },
    {
      url: "http://bridge.test/runtimes"
    }
  ]);
  assert.equal(calls[3]?.url, "http://bridge.test/runtimes/runtime-1/wait-for");
  assert.equal(calls[3]?.method, "POST");
  const waitBody = calls[3]?.body as { timeout?: unknown };
  if (typeof waitBody.timeout !== "number") {
    assert.fail("wait-for timeout should be a number.");
  }
  assert.ok(waitBody.timeout >= 1);
  assert.ok(waitBody.timeout <= 500);
  assert.deepEqual(calls[3]?.body, {
    targetId: "modern:route",
    status: "ready",
    timeout: waitBody.timeout,
    where: [
      {
        path: "pathname",
        equals: "/route-a"
      }
    ]
  });
  assert.equal(JSON.parse(output.text()).result.success, true);
});

test("opens and follows a session before wait-for when open is set", async () => {
  const browserCalls: string[][] = [];
  let opened = false;

  const output = createOutput();
  const exitCode = await runCli([
    "wait-for",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://app.test/route-a",
    "--session",
    "session-route-a",
    "modern:route",
    "ready",
    "--open",
    "--timeout",
    "500"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url, init) => {
      if (String(url) === "http://bridge.test/runtimes") {
        return jsonResponse({
          runtimes: opened
            ? [
                {
                  runtimeId: "runtime-session",
                  url: "http://app.test/route-a?openruntimeSessionId=session-route-a",
                  sessionId: "session-route-a",
                  status: "connected",
                  connectedAt: 1,
                  lastSeenAt: 2
                }
              ]
            : []
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-session/wait-for");
      assert.equal(init?.method, "POST");
      return jsonResponse({
        success: true,
        condition: {
          id: "modern:route",
          status: "ready"
        },
        snapshot: {
          targets: {},
          latestEventId: 0,
          capturedAt: 10
        }
      });
    },
    browserRunner: createBrowserRunner(async (args) => {
      browserCalls.push(args);
      opened = true;
      return {
        exitCode: 0,
        stdout: "opened\n",
        stderr: ""
      };
    })
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(browserCalls, [[
    "open",
    "http://app.test/route-a?openruntimeSessionId=session-route-a"
  ]]);
  assert.equal(JSON.parse(output.text()).runtime.runtimeId, "runtime-session");
});
