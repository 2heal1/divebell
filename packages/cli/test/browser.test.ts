import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "@rstest/core";

import { runCli } from "../dist/index.js";
import { type BrowserRunOptions } from "../dist/features/browser/runner.js";
import { createDetachedBridgeStarter } from "../dist/features/bridge/process.js";
import { createOperationSessionId } from "../dist/utils/operation-log.js";

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
    openedUrl: `http://app.test/?divebellSessionId=${sessionId}`,
    normalizedUrl: "http://app.test/",
    bridgeUrl: "http://localhost:18080",
    bridgePort: 18080,
    sessionId
  });
  const parsed = JSON.parse(output.text());
  assert.equal(parsed.data.injectedScriptPath, browserCalls[0]?.[3]);
  assert.match(
    readFileSync(parsed.data.injectedScriptPath, "utf8"),
    /http:\/\/localhost:18080/
  );
  assert.equal(output.errorText(), "");
  assertBridgeOpenCalls(browserCalls, `http://app.test/?divebellSessionId=${sessionId}`, "http://localhost:18080");
});

test("opens a browser page with a stable Divebell session", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];

  const exitCode = await runCli(["open", "http://app.test/orders?region=cn#details", "--session", "session-orders"], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async () => jsonResponse({ runtimes: [] }),
    bridgeStarter: {
      start: async ({ port }) => {
        assert.equal(port, 0);
        return {
          pid: 12345,
          port: 18123,
          bridgeUrl: "http://localhost:18123"
        };
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
  assertOpenOutput(output.text(), {
    command: "open http://app.test/orders?region=cn#details",
    url: "http://app.test/orders?region=cn#details",
    openedUrl: "http://app.test/orders?region=cn&divebellSessionId=session-orders#details",
    normalizedUrl: "http://app.test/orders?region=cn#details",
    bridgeUrl: "http://localhost:18123",
    bridgePort: 18123,
    sessionId: "session-orders"
  });
  assertBridgeOpenCalls(
    browserCalls,
    "http://app.test/orders?region=cn&divebellSessionId=session-orders#details",
    "http://localhost:18123"
  );
});

test("forwards headers alongside the Bridge initialization script", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  const headers = JSON.stringify({ Authorization: "Bearer secret-token" });

  const exitCode = await runCli([
    "open",
    "http://app.test/orders",
    "--headers",
    headers,
    "--bridge",
    "http://bridge.test",
    "--session",
    "session-headers"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
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
  assert.equal(browserCalls.length, 1);
  assert.deepEqual(browserCalls[0]?.slice(0, 2), [
    "open",
    "http://app.test/orders?divebellSessionId=session-headers"
  ]);
  assert.equal(browserCalls[0]?.[2], "--init-script");
  assert.match(browserCalls[0]?.[3] ?? "", /divebell-bridge-init\/bridge-[a-f0-9]+\.js$/);
  assert.deepEqual(browserCalls[0]?.slice(4), ["--headers", headers]);
  assert.doesNotMatch(output.text(), /secret-token/);
});

test("assigns a dedicated bridge port and reuses it for directory commands", async () => {
  const stateDirectory = mkdtempSync(join(tmpdir(), "divebell-cli-state-"));
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-cli-operations-"));
  const browserRunner = createBrowserRunner(async () => ({
    exitCode: 0,
    stdout: "ok\n",
    stderr: ""
  }));
  let closed = false;

  try {
    const openOutput = createOutput();
    const openExitCode = await runCli(["open", "http://app.test/"], {
      stdout: openOutput.stdout,
      stderr: openOutput.stderr,
      bridgeStateDirectory: stateDirectory,
      operationLogDirectory,
      bridgeStarter: createDetachedBridgeStarter(
        pathToFileURL(join(process.cwd(), "dist", "bin.js")).href
      ),
      browserRunner
    });
    assert.equal(openExitCode, 0, `${openOutput.text()}\n${openOutput.errorText()}`);

    const opened = JSON.parse(openOutput.text()).data;
    assert.equal(typeof opened.bridgePort, "number");
    assert.equal(opened.bridgePort > 0, true);
    assert.equal(opened.bridgeUrl, `http://localhost:${opened.bridgePort}`);

    const secondOpenOutput = createOutput();
    assert.equal(await runCli(["open", "http://app.test/next"], {
      stdout: secondOpenOutput.stdout,
      stderr: secondOpenOutput.stderr,
      bridgeStateDirectory: stateDirectory,
      operationLogDirectory,
      bridgeStarter: createDetachedBridgeStarter(
        pathToFileURL(join(process.cwd(), "dist", "bin.js")).href
      ),
      browserRunner
    }), 0);
    const reopened = JSON.parse(secondOpenOutput.text()).data;
    assert.notEqual(reopened.bridgePort, opened.bridgePort);
    assert.equal(await waitForBridgeToStop(opened.bridgeUrl), true);

    const runtimeOutput = createOutput();
    assert.equal(await runCli(["runtimes"], {
      stdout: runtimeOutput.stdout,
      stderr: runtimeOutput.stderr,
      bridgeStateDirectory: stateDirectory,
      operationLogDirectory,
      browserRunner
    }), 0);
    assert.equal(JSON.parse(runtimeOutput.text()).bridgeUrl, reopened.bridgeUrl);

    assert.equal(await runCli(["stop"], {
      stdout: createOutput().stdout,
      stderr: createOutput().stderr,
      bridgeStateDirectory: stateDirectory,
      operationLogDirectory,
      browserRunner
    }), 0);
    closed = true;
    assert.equal(readdirSync(operationLogDirectory).length, 0);
  } finally {
    if (!closed && readdirSync(operationLogDirectory).length > 0) {
      await runCli(["stop"], {
        stdout: createOutput().stdout,
        stderr: createOutput().stderr,
        bridgeStateDirectory: stateDirectory,
        operationLogDirectory,
        browserRunner
      });
    }
    rmSync(stateDirectory, { recursive: true, force: true });
    rmSync(operationLogDirectory, { recursive: true, force: true });
  }
});

async function waitForBridgeToStop(bridgeUrl: string): Promise<boolean> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await fetch(`${bridgeUrl}/runtimes`);
    } catch {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

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
    openedUrl: `http://app.test/?divebellSessionId=${sessionId}`,
    normalizedUrl: "http://app.test/",
    bridgeUrl: null,
    bridgePort: null,
    sessionId
  });
  assert.equal(
    Object.hasOwn(JSON.parse(output.text()).data, "injectedScriptPath"),
    false
  );
  assert.deepEqual(browserCalls, [["open", `http://app.test/?divebellSessionId=${sessionId}`]]);
  assert.deepEqual(browserOptions, [{ ui: false, reuseInitialBlankPage: true }]);
});

test("points browser startup failures to the readiness check", async () => {
  const output = createOutput();
  const exitCode = await runCli([
    "open",
    "http://app.test/",
    "--no-bridge"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    browserRunner: createBrowserRunner(async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "Chrome exited early (unknown code)"
    }))
  });

  assert.equal(exitCode, 1);
  const sessionId = createOperationSessionId();
  assert.deepEqual(JSON.parse(output.text()), errorOutput("open http://app.test/", {
    code: "PAGE_OPEN_FAILED",
    kind: "browser",
    message: "Chrome exited early (unknown code)",
    retryable: true,
    hint: "Run `divebell setup` to prepare browser startup.",
    details: {
      url: "http://app.test/",
      openedUrl: `http://app.test/?divebellSessionId=${sessionId}`,
      stderr: "Chrome exited early (unknown code)"
    }
  }));
});

test("forwards origin-scoped headers to the first page request", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  const headers = JSON.stringify({
    Authorization: "Bearer secret-token",
    "X-Debug-User": "agent"
  });

  const exitCode = await runCli([
    "open",
    "http://app.test/orders",
    "--headers",
    headers,
    "--session",
    "session-headers",
    "--no-bridge"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
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
  assert.deepEqual(browserCalls, [[
    "open",
    "http://app.test/orders?divebellSessionId=session-headers",
    "--headers",
    headers
  ]]);
  assert.doesNotMatch(output.text(), /secret-token/);
});

test("rejects headers that cannot be provided to the browser and extensions", async () => {
  for (const [headers, expected] of [
    ["{", {
      code: "CLI_HEADERS_INVALID_JSON",
      message: "--headers must be valid JSON."
    }],
    [JSON.stringify({ "X-Debug-User": 1 }), {
      code: "CLI_HEADERS_INVALID_SHAPE",
      message: "--headers must be a JSON object with string values."
    }]
  ] as const) {
    const output = createOutput();
    let browserTouched = false;
    const exitCode = await runCli([
      "open",
      "http://app.test/orders",
      "--headers",
      headers,
      "--no-bridge"
    ], {
      stdout: output.stdout,
      stderr: output.stderr,
      browserRunner: createBrowserRunner(async () => {
        browserTouched = true;
        return { exitCode: 0, stdout: "", stderr: "" };
      })
    });

    assert.equal(exitCode, 1);
    assert.equal(browserTouched, false);
    assert.deepEqual(JSON.parse(output.text()), errorOutput("open http://app.test/orders", {
      code: expected.code,
      kind: "validation",
      message: expected.message,
      retryable: false,
      hint: "Pass --headers as a JSON object with string values."
    }));
  }
});

test("keeps headers on the first navigation when cookies are staged before opening", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  const headers = JSON.stringify({ Authorization: "Bearer secret-token" });

  const exitCode = await runCli([
    "open",
    "http://app.test/orders",
    "--headers",
    headers,
    "--cookies",
    "Cookie: session=test",
    "--session",
    "session-headers",
    "--no-bridge"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    browserRunner: createBrowserRunner(async (args) => {
      browserCalls.push(args);
      return {
        exitCode: 0,
        stdout: "ok\n",
        stderr: ""
      };
    })
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(browserCalls, [
    ["open"],
    ["cookies", "set", "--curl", "Cookie: session=test"],
    [
      "goto",
      "http://app.test/orders?divebellSessionId=session-headers",
      "--headers",
      headers
    ]
  ]);
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
    openedUrl: "http://app.test/orders?divebellSessionId=session-orders",
    normalizedUrl: "http://app.test/orders",
    bridgeUrl: null,
    bridgePort: null,
    sessionId: "session-orders"
  });
  assert.deepEqual(browserCalls, [["open", "http://app.test/orders?divebellSessionId=session-orders"]]);
  assert.deepEqual(browserOptions, [{ ui: true, reuseInitialBlankPage: true }]);
});

test("records the latest open operation by working directory and removes it on stop", async () => {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-cli-operations-"));
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
    assert.equal(operation.bridgePort, 80);
    assert.equal(operation.sessionId, "session-orders");
    assert.equal(operation.exitCode, 0);
    assertBridgeOpenCalls(
      browserCalls.slice(0, 1),
      "http://127.0.0.1:3000/orders?divebellSessionId=session-orders",
      "http://bridge.test"
    );
    assertBridgeOpenCalls(
      browserCalls.slice(1),
      "http://localhost:3000/users?divebellSessionId=session-orders",
      "http://bridge.test"
    );

    const closeOutput = createOutput();
    const closeExitCode = await runCli(["stop"], {
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

function assertBridgeOpenCalls(calls: string[][], openedUrl: string, bridgeUrl: string): void {
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.[0], "open");
  assert.equal(calls[0]?.[1], openedUrl);
  assert.equal(calls[0]?.[2], "--init-script");
  assert.match(calls[0]?.[3] ?? "", /divebell-bridge-init\/bridge-[a-f0-9]+\.js$/);
  assert.equal(typeof bridgeUrl, "string");
}

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
                url: "http://app.test/orders?divebellSessionId=session-open",
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
        url: "http://app.test/orders?divebellSessionId=session-open",
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

test("keeps directory context written by the previous operation schema", async () => {
  const context = createOpenContextFixture({
    bridgeUrl: "http://bridge.test:18422"
  });
  const [contextFile] = readdirSync(context.operationLogDirectory);
  assert.notEqual(contextFile, undefined);
  const contextPath = join(context.operationLogDirectory, contextFile as string);
  const legacyContext = JSON.parse(readFileSync(contextPath, "utf8"));
  legacyContext.schemaVersion = 2;
  delete legacyContext.bridgePort;
  writeFileSync(contextPath, `${JSON.stringify(legacyContext, null, 2)}\n`, "utf8");

  try {
    const output = createOutput();
    assert.equal(await runCli(["runtimes"], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory: context.operationLogDirectory,
      fetcher: async (url) => {
        assert.equal(String(url), "http://bridge.test:18422/runtimes");
        return jsonResponse({ runtimes: [] });
      }
    }), 0);
    assert.equal(JSON.parse(output.text()).bridgeUrl, "http://bridge.test:18422");
  } finally {
    context.cleanup();
  }
});

test("requires an open context before browser page commands", async () => {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-cli-operations-"));
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
      hint: "Run `divebell open <url>` before `divebell click Refresh order`.",
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

test("delegates refs and explicit selectors to agent-browser", async () => {
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
      ["click", "@e7"],
      ["click", "[data-testid=refresh-order]"],
      ["click", "text=Refresh order"]
    ]);
  } finally {
    context.cleanup();
  }
});

test("delegates recorded focus, keyboard, and select actions to agent-browser", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  const context = createOpenContextFixture();

  try {
    for (const command of [
      ["focus", "e4"],
      ["press", "Control+a"],
      ["select", "#region", "cn"]
    ]) {
      const exitCode = await runCli(command, {
        stdout: output.stdout,
        stderr: output.stderr,
        operationLogDirectory: context.operationLogDirectory,
        browserRunner: createBrowserRunner(async (args) => {
          browserCalls.push(args);
          return {
            exitCode: 0,
            stdout: "ok\n",
            stderr: ""
          };
        })
      });
      assert.equal(exitCode, 0);
    }

    assert.deepEqual(browserCalls, [
      ["focus", "@e4"],
      ["press", "Control+a"],
      ["select", "#region", "cn"]
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
  const stateDirectory = mkdtempSync(join(tmpdir(), "divebell-cli-state-"));
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
  const stateDirectory = mkdtempSync(join(tmpdir(), "divebell-cli-state-"));
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-cli-operations-"));
  const order: string[] = [];
  let bridgeStarted = false;

  try {
    assert.equal(await runCli(["open", "http://app.test/orders", "--port", "18082"], {
      stdout: createOutput().stdout,
      stderr: createOutput().stderr,
      bridgeStateDirectory: stateDirectory,
      operationLogDirectory,
      fetcher: async () => {
        if (!bridgeStarted) {
          throw new TypeError("fetch failed");
        }
        return jsonResponse({ runtimes: [] });
      },
      bridgeStarter: {
        start: async ({ port }) => {
          assert.equal(port, 18082);
          bridgeStarted = true;
          return { pid: 23456 };
        }
      },
      browserRunner: createBrowserRunner(async () => ({
        exitCode: 0,
        stdout: "opened\n",
        stderr: ""
      }))
    }), 0);
    assert.equal(readdirSync(operationLogDirectory).length, 1);

    const output = createOutput();
    const exitCode = await runCli(["stop"], {
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
        command: "stop",
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
            "[123.1] GET http://app.test/api/orders (fetch) 200",
            "[123.2] GET http://app.test/assets/app.js (script) 200",
            "[123.3] GET http://app.test/api/orders/failed (xhr)"
          ].join("\n"),
          stderr: ""
        };
      })
    });

    assert.equal(exitCode, 0);
    assert.equal(output.text(), [
      "[123.1] GET http://app.test/api/orders (fetch) 200",
      "[123.3] GET http://app.test/api/orders/failed (xhr)",
      ""
    ].join("\n"));
    assert.deepEqual(browserCalls, [["network", "requests"]]);
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
          stdout: JSON.stringify({ messages: [
            { type: "warn", text: "React warning", timestamp: 1 },
            { type: "error", text: "plain error", timestamp: 2 },
            { type: "error", text: "ReactCurrentDispatcher failed", timestamp: 3 },
            { type: "error", text: "React hydration failed", timestamp: 4 }
          ] }),
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
    assert.deepEqual(browserCalls, [["console", "--json"]]);
  } finally {
    context.cleanup();
  }
});

test("forwards supported coverage commands as JSON requests", async () => {
  const context = createOpenContextFixture();
  const commands = [
    ["coverage", "status"],
    ["coverage", "start"],
    ["coverage", "take"],
    ["coverage", "stop"],
    ["coverage", "cancel"]
  ];
  const calls: string[][] = [];

  try {
    for (const command of commands) {
      const output = createOutput();
      const exitCode = await runCli(command, {
        stdout: output.stdout,
        stderr: output.stderr,
        operationLogDirectory: context.operationLogDirectory,
        browserRunner: createBrowserRunner(async (args) => {
          calls.push(args);
          return { exitCode: 0, stdout: JSON.stringify({ command: args.slice(0, -1) }), stderr: "" };
        })
      });
      assert.equal(exitCode, 0);
      assert.equal(output.errorText(), "");
      assert.deepEqual(JSON.parse(output.text()), { command });
    }
    assert.deepEqual(calls, commands.map((command) => [...command, "--json"]));
  } finally {
    context.cleanup();
  }
});

test("forwards coverage paths, labels, call counts, and limits", async () => {
  const context = createOpenContextFixture();
  const calls: string[][] = [];
  const commands = [
    {
      cli: ["coverage", "start", "--call-count"],
      browser: ["coverage", "start", "--call-count", "--json"]
    },
    {
      cli: ["coverage", "take", "/tmp/first.coverage.json", "--label", "first-screen", "--max-size", "4096"],
      browser: ["coverage", "take", "/tmp/first.coverage.json", "--label", "first-screen", "--max-size", "4096", "--json"]
    },
    {
      cli: ["coverage", "stop", "/tmp/orders.coverage.json", "--label", "orders"],
      browser: ["coverage", "stop", "/tmp/orders.coverage.json", "--label", "orders", "--json"]
    }
  ];

  try {
    for (const command of commands) {
      const output = createOutput();
      const exitCode = await runCli(command.cli, {
        stdout: output.stdout,
        stderr: output.stderr,
        operationLogDirectory: context.operationLogDirectory,
        browserRunner: createBrowserRunner(async (args) => {
          calls.push(args);
          return { exitCode: 0, stdout: "{}", stderr: "" };
        })
      });
      assert.equal(exitCode, 0);
      assert.equal(output.errorText(), "");
    }
    assert.deepEqual(calls, commands.map((command) => command.browser));
  } finally {
    context.cleanup();
  }
});
