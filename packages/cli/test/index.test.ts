import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "@rstest/core";

import { cliPackageInfo, getCliCommandName, runCli } from "../dist/index.js";
import type { BrowserRunner } from "../dist/browser.js";
import { isEntryPoint } from "../dist/entry.js";

test("exposes the cli package marker", () => {
  assert.equal(getCliCommandName(), "open-runtime");
  assert.deepEqual(cliPackageInfo, {
    name: "@openruntime/cli",
    phase: "phase-0",
    role: "agent command line"
  });
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

test("selects the latest matching runtime for read commands", async () => {
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

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-new/snapshot");
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
    "http://bridge.test/runtimes/runtime-new/snapshot"
  ]);
  assert.deepEqual(JSON.parse(output.text()), {
    runtime: {
      runtimeId: "runtime-new",
      url: "http://app.test/",
      status: "connected",
      connectedAt: 3,
      lastSeenAt: 4
    },
    result: {
      targets: {},
      latestEventId: 0,
      capturedAt: 10
    }
  });
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
    if (textUrl.includes("/actions/route.pick/options")) {
      return jsonResponse([{ value: "hangzhou" }]);
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
    "input-options",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://app.test/",
    "--action",
    "route.pick",
    "--input",
    "city",
    "--payload",
    "{\"region\":\"zhejiang\"}",
    "--timeout",
    "20"
  ], {
    stdout: createOutput().stdout,
    stderr: createOutput().stderr,
    fetcher
  }), 0);

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
    "--where",
    "matches.pathname=/orders",
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
      url: "http://bridge.test/runtimes/runtime-1/actions/route.pick/options?input=city&payload=%7B%22region%22%3A%22zhejiang%22%7D&timeout=20"
    },
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
          }
        ]
      }
    }
  ]);
});

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
  assert.equal(output.text(), "opened\n");
  assert.equal(output.errorText(), "");
  assert.deepEqual(browserCalls, [["open", "http://app.test/"]]);
});

test("opens a browser page without touching the bridge when no-bridge is set", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];

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
  assert.equal(output.text(), "opened\n");
  assert.deepEqual(browserCalls, [["open", "http://app.test/"]]);
});

test("reads a window value through browser eval", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];

  const exitCode = await runCli(["get-window", "gf_data_v1"], {
    stdout: output.stdout,
    stderr: output.stderr,
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
});

test("waits for a browser eval condition", async () => {
  const output = createOutput();
  let attempts = 0;

  const exitCode = await runCli(["wait-eval", "window.gf_data_v1 != null", "--timeout", "500"], {
    stdout: output.stdout,
    stderr: output.stderr,
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
    "ready"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      assert.equal(String(url), "http://bridge.test/runtimes");
      return jsonResponse({ runtimes: [] });
    }
  });

  assert.equal(exitCode, 1);
  assert.equal(
    output.errorText(),
    "No connected runtime matched URL \"http://app.test/route-a\".\nUse --open to open the page before waiting.\n"
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
  assert.deepEqual(calls, [
    {
      url: "http://bridge.test/runtimes"
    },
    {
      url: "http://bridge.test/runtimes"
    },
    {
      url: "http://bridge.test/runtimes"
    },
    {
      url: "http://bridge.test/runtimes/runtime-1/wait-for",
      method: "POST",
      body: {
        targetId: "modern:route",
        status: "ready",
        timeout: 500,
        where: [
          {
            path: "pathname",
            equals: "/route-a"
          }
        ]
      }
    }
  ]);
  assert.equal(JSON.parse(output.text()).result.success, true);
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
  assert.equal(output.errorText(), "--payload must be valid JSON.\n");
});

test("recognizes a bin symlink as the cli entrypoint", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-cli-"));
  try {
    const entry = join(process.cwd(), "dist", "index.js");
    const bin = join(tempDir, "open-runtime");
    symlinkSync(entry, bin);

    assert.equal(isEntryPoint(bin, pathToFileURL(entry).href), true);
  } finally {
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});

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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
}

function createBrowserRunner(
  run: (args: string[]) => Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>
): BrowserRunner {
  return {
    run
  };
}
