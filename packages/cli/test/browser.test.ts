import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "@rstest/core";

import { runCli } from "../dist/index.js";
import { type BrowserRunOptions } from "../dist/browser.js";
import { createOperationSessionId } from "../dist/operation-log.js";

import { assertOpenOutput, createBrowserRunner, createOpenContextFixture, createOutput, errorOutput, jsonResponse } from "./helpers.js";

test("opens a browser page and auto-starts the bridge when needed", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  let bridgeStarted = false;

  const exitCode = await runCli(["open", "http://app.test/", "--port", "18080"], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      assert.equal(String(url), "http://localhost:18080/runtimes");
      if (!bridgeStarted) {
        throw new TypeError("fetch failed");
      }
      return jsonResponse({ runtimes: [] });
    },
    bridgeStarter: {
      start: async ({ port }) => {
        assert.equal(port, 18080);
        bridgeStarted = true;
      }
    },
    browserRunner: createBrowserRunner(async (args) => {
      browserCalls.push(args);
      return {
        exitCode: 0,
        stdout: "opened\n",
        stderr: ""
      };
    })
  });

  assert.equal(exitCode, 0);
  const sessionId = createOperationSessionId();
  assertOpenOutput(output.text(), {
    command: "open http://app.test/",
    url: "http://app.test/",
    openedUrl: `http://app.test/?openruntimeSessionId=${sessionId}`,
    normalizedUrl: "http://app.test/",
    bridgeUrl: "http://localhost:18080",
    sessionId
  });
  assert.equal(output.errorText(), "");
  assert.deepEqual(browserCalls, [["open", `http://app.test/?openruntimeSessionId=${sessionId}`]]);
});

test("opens a browser page with a stable OpenRuntime session", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];

  const exitCode = await runCli(["open", "http://app.test/orders?region=cn#details", "--session", "session-orders"], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async () => jsonResponse({ runtimes: [] }),
    bridgeStarter: {
      start: async () => ({ pid: 12345 })
    },
    browserRunner: createBrowserRunner(async (args) => {
      browserCalls.push(args);
      return {
        exitCode: 0,
        stdout: "opened\n",
        stderr: ""
      };
    })
  });

  assert.equal(exitCode, 0);
  assertOpenOutput(output.text(), {
    command: "open http://app.test/orders?region=cn#details",
    url: "http://app.test/orders?region=cn#details",
    openedUrl: "http://app.test/orders?region=cn&openruntimeSessionId=session-orders#details",
    normalizedUrl: "http://app.test/orders?region=cn#details",
    bridgeUrl: "http://localhost:17321",
    sessionId: "session-orders"
  });
  assert.deepEqual(browserCalls, [[
    "open",
    "http://app.test/orders?region=cn&openruntimeSessionId=session-orders#details"
  ]]);
});

test("opens a browser page without touching the bridge when no-bridge is set", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  const browserOptions: Array<BrowserRunOptions | undefined> = [];

  const exitCode = await runCli(["open", "http://app.test/", "--no-bridge"], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async () => {
      throw new Error("bridge should not be fetched");
    },
    bridgeStarter: {
      start: async () => {
        throw new Error("bridge should not be started");
      }
    },
    browserRunner: createBrowserRunner(async (args, options) => {
      browserCalls.push(args);
      browserOptions.push(options);
      return {
        exitCode: 0,
        stdout: "opened\n",
        stderr: ""
      };
    })
  });

  assert.equal(exitCode, 0);
  const sessionId = createOperationSessionId();
  assertOpenOutput(output.text(), {
    command: "open http://app.test/",
    url: "http://app.test/",
    openedUrl: `http://app.test/?openruntimeSessionId=${sessionId}`,
    normalizedUrl: "http://app.test/",
    bridgeUrl: null,
    sessionId
  });
  assert.deepEqual(browserCalls, [["open", `http://app.test/?openruntimeSessionId=${sessionId}`]]);
  assert.deepEqual(browserOptions, [{ ui: false }]);
});

test("opens a visible browser page when ui is set and keeps the session query", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  const browserOptions: Array<BrowserRunOptions | undefined> = [];

  const exitCode = await runCli(["open", "http://app.test/orders", "--session", "session-orders", "--ui", "--no-bridge"], {
    stdout: output.stdout,
    stderr: output.stderr,
    browserRunner: createBrowserRunner(async (args, options) => {
      browserCalls.push(args);
      browserOptions.push(options);
      return {
        exitCode: 0,
        stdout: "opened\n",
        stderr: ""
      };
    })
  });

  assert.equal(exitCode, 0);
  assertOpenOutput(output.text(), {
    command: "open http://app.test/orders",
    url: "http://app.test/orders",
    openedUrl: "http://app.test/orders?openruntimeSessionId=session-orders",
    normalizedUrl: "http://app.test/orders",
    bridgeUrl: null,
    sessionId: "session-orders"
  });
  assert.deepEqual(browserCalls, [["open", "http://app.test/orders?openruntimeSessionId=session-orders"]]);
  assert.deepEqual(browserOptions, [{ ui: true }]);
});

test("records the latest open operation by working directory and removes it on close", async () => {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "openruntime-cli-operations-"));
  const browserCalls: string[][] = [];

  try {
    for (const url of ["http://127.0.0.1:3000/orders", "http://localhost:3000/users"]) {
      const output = createOutput();
      const exitCode = await runCli([
        "open",
        url,
        "--bridge",
        "http://bridge.test",
        "--session",
        "session-orders"
      ], {
        stdout: output.stdout,
        stderr: output.stderr,
        operationLogDirectory,
        fetcher: async () => jsonResponse({ runtimes: [] }),
        browserRunner: createBrowserRunner(async (args) => {
          browserCalls.push(args);
          return {
            exitCode: 0,
            stdout: "opened\n",
            stderr: ""
          };
        })
      });

      assert.equal(exitCode, 0);
    }

    const files = readdirSync(operationLogDirectory);
    assert.equal(files.length, 1);
    const operation = JSON.parse(readFileSync(join(operationLogDirectory, files[0] as string), "utf8"));
    assert.equal(operation.command, "open");
    assert.equal(operation.cwd, process.cwd());
    assert.equal(operation.url, "http://localhost:3000/users");
    assert.equal(operation.normalizedUrl, "http://localhost:3000/users");
    assert.equal(operation.bridgeUrl, "http://bridge.test");
    assert.equal(operation.sessionId, "session-orders");
    assert.equal(operation.exitCode, 0);
    assert.deepEqual(browserCalls, [
      ["open", "http://127.0.0.1:3000/orders?openruntimeSessionId=session-orders"],
      ["open", "http://localhost:3000/users?openruntimeSessionId=session-orders"]
    ]);

    const closeOutput = createOutput();
    const closeExitCode = await runCli(["close"], {
      stdout: closeOutput.stdout,
      stderr: closeOutput.stderr,
      operationLogDirectory,
      browserRunner: createBrowserRunner(async () => ({
        exitCode: 0,
        stdout: "closed\n",
        stderr: ""
      }))
    });

    assert.equal(closeExitCode, 0);
    assert.equal(readdirSync(operationLogDirectory).length, 0);
  } finally {
    rmSync(operationLogDirectory, {
      recursive: true,
      force: true
    });
  }
});

test("uses the latest open context as the default runtime selector", async () => {
  const context = createOpenContextFixture({
    bridgeUrl: "http://bridge.test",
    sessionId: "session-open",
    url: "http://app.test/orders",
    normalizedUrl: "http://app.test/orders"
  });
  const calls: string[] = [];
  const output = createOutput();

  try {
    const exitCode = await runCli(["snapshot", "--id", "modern:route"], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory: context.operationLogDirectory,
      fetcher: async (url) => {
        calls.push(String(url));
        if (String(url) === "http://bridge.test/runtimes") {
          return jsonResponse({
            runtimes: [
              {
                runtimeId: "runtime-open",
                url: "http://app.test/orders?openruntimeSessionId=session-open",
                sessionId: "session-open",
                status: "connected",
                connectedAt: 1,
                lastSeenAt: 2
              }
            ]
          });
        }
        assert.equal(String(url), "http://bridge.test/runtimes/runtime-open/snapshot?id=modern%3Aroute");
        return jsonResponse({
          targets: {},
          latestEventId: 0,
          capturedAt: 3
        });
      }
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(calls, [
      "http://bridge.test/runtimes",
      "http://bridge.test/runtimes/runtime-open/snapshot?id=modern%3Aroute"
    ]);
    assert.deepEqual(JSON.parse(output.text()), {
      runtime: {
        runtimeId: "runtime-open",
        url: "http://app.test/orders?openruntimeSessionId=session-open",
        sessionId: "session-open",
        status: "connected",
        connectedAt: 1,
        lastSeenAt: 2
      },
      result: {
        targets: {},
        latestEventId: 0,
        capturedAt: 3
      }
    });
  } finally {
    context.cleanup();
  }
});

test("requires an open context before browser page commands", async () => {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "openruntime-cli-operations-"));
  const output = createOutput();
  try {
    const exitCode = await runCli(["click", "Refresh order"], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory,
      browserRunner: createBrowserRunner(async () => {
        throw new Error("browser should not be touched without an open context");
      })
    });

    assert.equal(exitCode, 1);
    assert.equal(output.errorText(), "");
    assert.deepEqual(JSON.parse(output.text()), errorOutput("click Refresh order", {
      code: "OPEN_CONTEXT_REQUIRED",
      kind: "validation",
      message: "No opened page context was found.",
      retryable: false,
      hint: "Run `openruntime open <url>` before `openruntime click Refresh order`.",
      details: {
        command: "click Refresh order"
      }
    }));
  } finally {
    rmSync(operationLogDirectory, {
      recursive: true,
      force: true
    });
  }
});

test("clicks interactive text with an exact page-side lookup", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  const context = createOpenContextFixture();

  try {
    const exitCode = await runCli(["click", "Refresh order"], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory: context.operationLogDirectory,
      browserRunner: createBrowserRunner(async (args) => {
        browserCalls.push(args);
        return {
          exitCode: 0,
          stdout: "{\"clicked\":true}\n",
          stderr: ""
        };
      })
    });

    assert.equal(exitCode, 0);
    assert.equal(output.text(), "clicked\n");
    assert.equal(output.errorText(), "");
    assert.equal(browserCalls.length, 1);
    assert.equal(browserCalls[0]?.[0], "eval");
    assert.match(browserCalls[0]?.[1] ?? "", /Refresh order/);
    assert.match(browserCalls[0]?.[1] ?? "", /querySelectorAll/);
  } finally {
    context.cleanup();
  }
});

test("delegates click refs and explicit selectors to next-browser", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  const context = createOpenContextFixture();

  try {
    for (const target of ["e7", "[data-testid=refresh-order]", "text=Refresh order"]) {
      const exitCode = await runCli(["click", target], {
        stdout: output.stdout,
        stderr: output.stderr,
        operationLogDirectory: context.operationLogDirectory,
        browserRunner: createBrowserRunner(async (args) => {
          browserCalls.push(args);
          return {
            exitCode: 0,
            stdout: "clicked\n",
            stderr: ""
          };
        })
      });
      assert.equal(exitCode, 0);
    }

    assert.equal(output.text(), "clicked\nclicked\nclicked\n");
    assert.deepEqual(browserCalls, [
      ["click", "e7"],
      ["click", "[data-testid=refresh-order]"],
      ["click", "text=Refresh order"]
    ]);
  } finally {
    context.cleanup();
  }
});

test("reports interactive text click errors without broad text fallback", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  const context = createOpenContextFixture();

  try {
    const exitCode = await runCli(["click", "Refresh order"], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory: context.operationLogDirectory,
      browserRunner: createBrowserRunner(async (args) => {
        browserCalls.push(args);
        return {
          exitCode: 1,
          stdout: "",
          stderr: "Multiple interactive elements matched text \"Refresh order\""
        };
      })
    });

    assert.equal(exitCode, 1);
    assert.equal(output.text(), "");
    assert.match(output.errorText(), /Multiple interactive elements matched text "Refresh order"/);
    assert.equal(browserCalls.length, 1);
    assert.equal(browserCalls[0]?.[0], "eval");
  } finally {
    context.cleanup();
  }
});

test("starts the bridge in the background and returns after it is reachable", async () => {
  const output = createOutput();
  const stateDirectory = mkdtempSync(join(tmpdir(), "openruntime-cli-state-"));
  let bridgeStarted = false;

  try {
    const exitCode = await runCli(["start", "--port", "18081"], {
      stdout: output.stdout,
      stderr: output.stderr,
      bridgeStateDirectory: stateDirectory,
      fetcher: async (url) => {
        assert.equal(String(url), "http://localhost:18081/runtimes");
        if (!bridgeStarted) {
          throw new TypeError("fetch failed");
        }
        return jsonResponse({ runtimes: [] });
      },
      bridgeStarter: {
        start: async ({ port }) => {
          assert.equal(port, 18081);
          bridgeStarted = true;
          return { pid: 12345 };
        }
      }
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(output.text()), {
      bridgeUrl: "http://localhost:18081",
      pid: 12345,
      status: "started"
    });
  } finally {
    rmSync(stateDirectory, {
      recursive: true,
      force: true
    });
  }
});

test("stops by closing the browser session before stopping the bridge", async () => {
  const stateDirectory = mkdtempSync(join(tmpdir(), "openruntime-cli-state-"));
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "openruntime-cli-operations-"));
  const order: string[] = [];
  let bridgeStarted = false;

  try {
    assert.equal(await runCli(["start", "--port", "18082"], {
      stdout: createOutput().stdout,
      stderr: createOutput().stderr,
      bridgeStateDirectory: stateDirectory,
      fetcher: async () => {
        if (!bridgeStarted) {
          throw new TypeError("fetch failed");
        }
        return jsonResponse({ runtimes: [] });
      },
      bridgeStarter: {
        start: async () => {
          bridgeStarted = true;
          return { pid: 23456 };
        }
      }
    }), 0);

    assert.equal(await runCli(["open", "http://app.test/orders", "--port", "18082"], {
      stdout: createOutput().stdout,
      stderr: createOutput().stderr,
      bridgeStateDirectory: stateDirectory,
      operationLogDirectory,
      fetcher: async () => jsonResponse({ runtimes: [] }),
      browserRunner: createBrowserRunner(async () => ({
        exitCode: 0,
        stdout: "opened\n",
        stderr: ""
      }))
    }), 0);
    assert.equal(readdirSync(operationLogDirectory).length, 1);

    const output = createOutput();
    const exitCode = await runCli(["stop", "--port", "18082"], {
      stdout: output.stdout,
      stderr: output.stderr,
      bridgeStateDirectory: stateDirectory,
      operationLogDirectory,
      browserRunner: createBrowserRunner(async (args) => {
        order.push(args.join(" "));
        return {
          exitCode: 0,
          stdout: "",
          stderr: ""
        };
      }),
      bridgeProcessController: {
        isRunning: (pid) => {
          assert.equal(pid, 23456);
          return true;
        },
        stop: (pid) => {
          assert.equal(pid, 23456);
          order.push("bridge stop");
        }
      }
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(order, ["close", "bridge stop"]);
    assert.equal(readdirSync(operationLogDirectory).length, 0);
    assert.deepEqual(JSON.parse(output.text()), {
      browser: {
        command: "close",
        exitCode: 0
      },
      bridge: {
        bridgeUrl: "http://localhost:18082",
        pid: 23456,
        stopped: true
      }
    });
  } finally {
    rmSync(stateDirectory, {
      recursive: true,
      force: true
    });
    rmSync(operationLogDirectory, {
      recursive: true,
      force: true
    });
  }
});

test("reads a window value through browser eval", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  const context = createOpenContextFixture();

  try {
    const exitCode = await runCli(["get-window", "gf_data_v1"], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory: context.operationLogDirectory,
      browserRunner: createBrowserRunner(async (args) => {
        browserCalls.push(args);
        assert.equal(args[0], "eval");
        assert.match(args[1] ?? "", /gf_data_v1/);
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            path: "gf_data_v1",
            found: true,
            value: {
              route: "route-a"
            }
          }),
          stderr: ""
        };
      })
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(output.text()), {
      path: "gf_data_v1",
      found: true,
      value: {
        route: "route-a"
      }
    });
    assert.equal(browserCalls.length, 1);
  } finally {
    context.cleanup();
  }
});

test("waits for a browser eval condition", async () => {
  const output = createOutput();
  let attempts = 0;
  const context = createOpenContextFixture();

  try {
    const exitCode = await runCli(["wait-eval", "window.gf_data_v1 != null", "--timeout", "500"], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory: context.operationLogDirectory,
      browserRunner: createBrowserRunner(async (args) => {
        assert.equal(args[0], "eval");
        assert.match(args[1] ?? "", /window\.gf_data_v1/);
        attempts += 1;
        return {
          exitCode: 0,
          stdout: attempts === 1 ? "false\n" : "true\n",
          stderr: ""
        };
      })
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(output.text()), {
      success: true,
      condition: {
        script: "window.gf_data_v1 != null"
      },
      value: true
    });
    assert.equal(attempts, 2);
  } finally {
    context.cleanup();
  }
});

test("filters browser network requests by url", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  const context = createOpenContextFixture();

  try {
    const exitCode = await runCli(["network", "--url", "/api/orders"], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory: context.operationLogDirectory,
      browserRunner: createBrowserRunner(async (args) => {
        browserCalls.push(args);
        return {
          exitCode: 0,
          stdout: [
            "# Network requests since last navigation",
            "# Columns: idx status method type ms url [next-action=...]",
            "# Use `network <idx>` for headers and body.",
            "",
            "0 200 GET fetch 12ms http://app.test/api/orders",
            "1 200 GET script 3ms http://app.test/assets/app.js",
            "2 FAIL GET xhr - http://app.test/api/orders/failed"
          ].join("\n"),
          stderr: ""
        };
      })
    });

    assert.equal(exitCode, 0);
    assert.equal(output.text(), [
      "# Network requests since last navigation",
      "# Columns: idx status method type ms url [next-action=...]",
      "",
      "0 200 GET fetch 12ms http://app.test/api/orders",
      "2 FAIL GET xhr - http://app.test/api/orders/failed",
      ""
    ].join("\n"));
    assert.deepEqual(browserCalls, [["network"]]);
  } finally {
    context.cleanup();
  }
});

test("filters browser console entries by level query and limit", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  const context = createOpenContextFixture();

  try {
    const exitCode = await runCli(["console", "--level", "error", "--query", "react", "--limit", "1"], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory: context.operationLogDirectory,
      browserRunner: createBrowserRunner(async (args) => {
        browserCalls.push(args);
        return {
          exitCode: 0,
          stdout: JSON.stringify([
            { level: "warn", args: "React warning", timestamp: 1 },
            { level: "error", args: "plain error", timestamp: 2 },
            { level: "error", args: "ReactCurrentDispatcher failed", timestamp: 3 },
            { level: "error", args: "React hydration failed", timestamp: 4 }
          ]),
          stderr: ""
        };
      })
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(output.text()), {
      entries: [
        {
          level: "error",
          args: "React hydration failed",
          timestamp: 4
        }
      ],
      summary: {
        total: 1,
        log: 0,
        info: 0,
        warn: 0,
        error: 1
      }
    });
    assert.deepEqual(browserCalls, [[
      "eval",
      [
        "(() => {",
        "  const logs = window.__NEXT_BROWSER_CONSOLE_LOGS__;",
        "  return Array.isArray(logs) ? logs : [];",
        "})()"
      ].join("\n")
    ]]);
  } finally {
    context.cleanup();
  }
});
