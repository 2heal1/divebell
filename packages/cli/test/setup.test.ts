import assert from "node:assert/strict";
import { test } from "@rstest/core";

import { runCli } from "../dist/index.js";
import {
  createBrowserInstallArgs,
  isSupportedNodeVersion,
  runSetupCommand,
  SUPPORTED_NODE_RANGE
} from "../dist/commands/setup.js";
import type {
  BrowserRunOptions,
  BrowserRunResult
} from "../dist/features/browser/runner.js";
import {
  commandOutput,
  createBrowserRunner,
  createOutput,
  jsonResponse
} from "./helpers.js";

const CHROME_USER_AGENT = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/150.0.0.0 Safari/537.36";

test("does not expose the removed check command", async () => {
  const output = createOutput();

  const exitCode = await runCli(["check"], {
    stdout: output.stdout,
    stderr: output.stderr,
    env: {}
  });

  assert.equal(exitCode, 1);
  const parsed = JSON.parse(output.text());
  assert.equal(parsed.error.code, "CLI_UNKNOWN_COMMAND");
  assert.match(parsed.message, /Unknown command "check"/);
});

test("checks an isolated Bridge, browser open, and page control path", async () => {
  const output = createOutput();
  const browserCalls: Array<{
    args: string[];
    options: BrowserRunOptions | undefined;
  }> = [];
  const lifecycle: string[] = [];

  const exitCode = await runCli(["setup"], createSetupRunOptions({
    output,
    lifecycle,
    browserRun: async (args, options) => {
      browserCalls.push({ args, options });
      if (args[0] === "open") {
        assert.equal(
          args[1],
          "data:text/html,%3Ctitle%3EDivebell%20Setup%3C/title%3E"
        );
        assert.equal(args[2], "--init-script");
        assert.match(args[3] ?? "", /divebell-bridge-init\/bridge-[a-f0-9]+\.js$/);
        lifecycle.push("browser open");
        return success("opened");
      }
      if (args[0] === "eval") {
        assert.match(args[1] ?? "", /__DIVEBELL_BRIDGE_MANAGER__/);
        lifecycle.push("browser control");
        return success(JSON.stringify({
          controlled: true,
          bridgeInjected: true,
          userAgent: CHROME_USER_AGENT
        }));
      }
      if (args[0] === "close") {
        lifecycle.push("browser close");
        return success("closed");
      }
      throw new Error(`unexpected browser command: ${args.join(" ")}`);
    }
  }));

  assert.equal(exitCode, 0);
  assert.equal(output.errorText(), "");
  assert.deepEqual(JSON.parse(output.text()), commandOutput("setup", {
    ready: true,
    fixed: false,
    environment: expectedEnvironment(),
    checks: [
      {
        id: "node",
        status: "passed"
      },
      {
        id: "bridge",
        status: "passed"
      },
      {
        id: "browser.open",
        status: "passed"
      },
      {
        id: "browser.control",
        status: "passed"
      }
    ]
  }, "Divebell is ready."));
  assert.deepEqual(lifecycle, [
    "bridge start",
    "browser open",
    "browser control",
    "browser close",
    "bridge stop"
  ]);
  assert.equal(browserCalls.length, 3);
  const sessions = new Set(browserCalls.map((call) => call.options?.session));
  assert.equal(sessions.size, 1);
  assert.match(String([...sessions][0]), /^divebell-setup-[a-f0-9]+$/);
  assert.deepEqual(
    browserCalls.map((call) => call.options?.disableRestore),
    [true, true, true]
  );
  assert.deepEqual(
    browserCalls.map((call) => call.options?.headless),
    [true, true, true]
  );
  assert.deepEqual(
    browserCalls.map((call) => call.options?.idleTimeoutMs),
    [5000, 5000, 5000]
  );
  assert.equal(
    browserCalls.every((call) => call.options?.reuseInitialBlankPage === undefined),
    true
  );
});

test("installs browser requirements only when Chrome is missing", async () => {
  const output = createOutput();
  const calls: string[][] = [];
  let openAttempts = 0;

  const exitCode = await runCli(["setup"], createSetupRunOptions({
    output,
    browserRun: async (args) => {
      calls.push(args);
      if (args[0] === "open") {
        openAttempts += 1;
        return openAttempts === 1
          ? failure("Chrome not found. Checked:\nRun `agent-browser install` to download Chrome.")
          : success("opened");
      }
      if (args[0] === "install") return success("installed");
      if (args[0] === "eval") {
        return success(JSON.stringify({
          controlled: true,
          bridgeInjected: true,
          userAgent: CHROME_USER_AGENT
        }));
      }
      if (args[0] === "close") return success("closed");
      throw new Error(`unexpected browser command: ${args.join(" ")}`);
    }
  }));

  assert.equal(exitCode, 0);
  assert.deepEqual(calls.map((args) => args[0]), [
    "open",
    "close",
    "install",
    "open",
    "eval",
    "close"
  ]);
  assert.deepEqual(calls[2], createBrowserInstallArgs(process.platform));
  assert.deepEqual(JSON.parse(output.text()), commandOutput("setup", {
    ready: true,
    fixed: true,
    environment: expectedEnvironment(),
    checks: [
      {
        id: "node",
        status: "passed"
      },
      {
        id: "bridge",
        status: "passed"
      },
      {
        id: "browser.open",
        status: "passed"
      },
      {
        id: "browser.control",
        status: "passed"
      }
    ],
    fix: {
      attempted: true,
      status: "applied",
      methods: [
        "install-managed-browser"
      ],
      initialFailure: "Chrome not found. Checked:\nRun `agent-browser install` to download Chrome."
    }
  }, "Divebell is ready. Browser requirements were installed."));
});

test("opens Chrome remote-debugging settings and connects instead of downloading over an existing Chrome", async () => {
  const output = createOutput();
  const calls: Array<{
    args: string[];
    options: BrowserRunOptions | undefined;
  }> = [];
  let connectAttempts = 0;
  let settingsOpenCount = 0;

  const exitCode = await runCli(["setup"], createSetupRunOptions({
    output,
    remoteDebuggingPageOpener: {
      open: async () => {
        settingsOpenCount += 1;
        return {
          opened: true
        };
      }
    },
    browserRun: async (args, options) => {
      calls.push({ args, options });
      if (args[0] === "open") {
        return failure("Chrome exited early without writing DevToolsActivePort");
      }
      if (args[0] === "close") return success("closed");
      if (args[0] === "tab" && args[1] === "new") {
        connectAttempts += 1;
        return connectAttempts === 1
          ? failure("No running Chrome instance found")
          : success("opened tab");
      }
      if (args[0] === "eval" && /const BRIDGE_URL/.test(args[1] ?? "")) {
        return success("undefined");
      }
      if (args[0] === "eval") {
        return success(JSON.stringify({
          controlled: true,
          bridgeInjected: true,
          userAgent: CHROME_USER_AGENT
        }));
      }
      if (args[0] === "tab" && args[1] === "close") {
        return success("closed tab");
      }
      throw new Error(`unexpected browser command: ${args.join(" ")}`);
    }
  }));

  assert.equal(exitCode, 0);
  assert.equal(settingsOpenCount, 1);
  assert.equal(calls.some((call) => call.args[0] === "install"), false);
  assert.deepEqual(calls.map((call) => call.args[0]), [
    "open",
    "close",
    "tab",
    "tab",
    "eval",
    "eval",
    "tab"
  ]);
  const existingCalls = calls.filter((call) => call.args[0] === "tab" || call.options?.autoConnect);
  assert.equal(existingCalls.every((call) => call.options?.autoConnect === true), true);
  assert.equal(existingCalls.every((call) => call.options?.idleTimeoutMs === 5000), true);
  assert.equal(existingCalls.every((call) => call.options?.session?.endsWith("-existing")), true);
  assert.deepEqual(JSON.parse(output.text()), commandOutput("setup", {
    ready: true,
    fixed: true,
    environment: expectedEnvironment({
      kind: "auto-connect"
    }),
    checks: [
      {
        id: "node",
        status: "passed"
      },
      {
        id: "bridge",
        status: "passed"
      },
      {
        id: "browser.open",
        status: "passed"
      },
      {
        id: "browser.control",
        status: "passed"
      }
    ],
    fix: {
      attempted: true,
      status: "applied",
      methods: [
        "connect-existing-chrome"
      ],
      openedRemoteDebuggingSettings: true,
      initialFailure: "Chrome exited early without writing DevToolsActivePort"
    }
  }, "Divebell is ready. Connected to the existing Chrome session."));
});

test("reports required user approval when Chrome remote debugging is not enabled in time", async () => {
  const output = createOutput();
  const calls: string[][] = [];
  let settingsOpenCount = 0;

  const exitCode = await runCli(["setup"], createSetupRunOptions({
    output,
    remoteDebuggingPageOpener: {
      open: async () => {
        settingsOpenCount += 1;
        return {
          opened: true
        };
      }
    },
    browserRun: async (args) => {
      calls.push(args);
      if (args[0] === "open") {
        return failure("Chrome exited early without writing DevToolsActivePort");
      }
      if (args[0] === "close") return success("closed");
      if (args[0] === "tab" && args[1] === "new") {
        return failure("No running Chrome instance found");
      }
      throw new Error(`unexpected browser command: ${args.join(" ")}`);
    }
  }));

  assert.equal(exitCode, 1);
  assert.equal(settingsOpenCount, 1);
  assert.equal(
    calls.filter((args) => args[0] === "tab" && args[1] === "new").length,
    31
  );
  assert.equal(calls.some((args) => args[0] === "install"), false);
  const parsed = JSON.parse(output.text());
  assert.equal(
    parsed.error.code,
    "DIVEBELL_SETUP_REMOTE_DEBUGGING_REQUIRED"
  );
  assert.equal(parsed.error.kind, "needs_input");
  assert.equal(parsed.error.retryable, true);
  assert.match(parsed.error.hint, /did not receive permission/);
  assert.deepEqual(parsed.data.fix, {
    attempted: true,
    status: "failed",
    methods: [
      "connect-existing-chrome"
    ],
    openedRemoteDebuggingSettings: true,
    initialFailure: "Chrome exited early without writing DevToolsActivePort"
  });
});

test("does not install anything when a configured Chrome debugging port is unavailable", async () => {
  const output = createOutput();
  const calls: string[][] = [];

  const exitCode = await runCli(["setup"], createSetupRunOptions({
    output,
    env: {
      AGENT_BROWSER_CDP: "9222"
    },
    browserRun: async (args) => {
      calls.push(args);
      if (args[0] === "tab" && args[1] === "new") {
        return failure("Failed to connect to CDP");
      }
      throw new Error(`unexpected browser command: ${args.join(" ")}`);
    }
  }));

  assert.equal(exitCode, 1);
  assert.deepEqual(calls.map((args) => args[0]), ["tab"]);
  const parsed = JSON.parse(output.text());
  assert.equal(parsed.status, "error");
  assert.equal(parsed.error.code, "DIVEBELL_SETUP_DEBUG_CONNECTION_REQUIRED");
  assert.equal(parsed.error.kind, "needs_input");
  assert.match(parsed.message, /Chrome DevTools port 9222/);
  assert.match(parsed.error.hint, /--remote-debugging-port=9222/);
  assert.match(parsed.error.hint, /--user-data-dir/);
  assert.equal(parsed.data.ready, false);
  assert.equal(parsed.data.fixed, false);
  assert.deepEqual(parsed.data.environment, expectedEnvironment({
    kind: "cdp",
    port: "9222"
  }, null, null));
});

test("reports browser control failures without trying to reinstall Chrome", async () => {
  const output = createOutput();
  const calls: string[][] = [];

  const exitCode = await runCli(["setup"], createSetupRunOptions({
    output,
    browserRun: async (args) => {
      calls.push(args);
      if (args[0] === "open") return success("opened");
      if (args[0] === "eval") return failure("Bridge initialization was missing");
      if (args[0] === "close") return success("closed");
      throw new Error(`unexpected browser command: ${args.join(" ")}`);
    }
  }));

  assert.equal(exitCode, 1);
  assert.deepEqual(calls.map((args) => args[0]), ["open", "eval", "close"]);
  const parsed = JSON.parse(output.text());
  assert.equal(parsed.error.code, "DIVEBELL_SETUP_CONTROL_FAILED");
  assert.deepEqual(parsed.data.checks, [
    {
      id: "node",
      status: "passed"
    },
    {
      id: "bridge",
      status: "passed"
    },
    {
      id: "browser.open",
      status: "passed"
    },
    {
      id: "browser.control",
      status: "failed",
      message: "Bridge initialization was missing"
    }
  ]);
});

test("keeps browser installer errors in the setup result", async () => {
  const output = createOutput();

  const exitCode = await runCli(["setup"], createSetupRunOptions({
    output,
    browserRun: async (args) => {
      if (args[0] === "open") {
        return failure("Chrome not found. Checked:\nRun `agent-browser install` to download Chrome.");
      }
      if (args[0] === "close") return success("closed");
      if (args[0] === "install") throw new Error("installer was blocked");
      throw new Error(`unexpected browser command: ${args.join(" ")}`);
    }
  }));

  assert.equal(exitCode, 1);
  const parsed = JSON.parse(output.text());
  assert.equal(parsed.error.code, "DIVEBELL_SETUP_REPAIR_FAILED");
  assert.match(parsed.message, /installer was blocked/);
  assert.deepEqual(parsed.data.fix, {
    attempted: true,
    status: "failed",
    methods: [
      "install-managed-browser"
    ],
    initialFailure: "Chrome not found. Checked:\nRun `agent-browser install` to download Chrome."
  });
});

test("reports Chrome download timeouts as retryable network failures", async () => {
  const output = createOutput();

  const exitCode = await runCli(["setup"], createSetupRunOptions({
    output,
    browserRun: async (args) => {
      if (args[0] === "open") {
        return failure("Chrome not found. Checked:\nRun `agent-browser install` to download Chrome.");
      }
      if (args[0] === "close") return success("closed");
      if (args[0] === "install") {
        return failure("Failed to fetch version info: operation timed out");
      }
      throw new Error(`unexpected browser command: ${args.join(" ")}`);
    }
  }));

  assert.equal(exitCode, 1);
  const parsed = JSON.parse(output.text());
  assert.equal(parsed.error.code, "DIVEBELL_SETUP_BROWSER_DOWNLOAD_FAILED");
  assert.equal(parsed.error.retryable, true);
  assert.match(parsed.error.hint, /googlechromelabs\.github\.io/);
  assert.match(parsed.error.hint, /storage\.googleapis\.com/);
});

test("checks auto-connected Chrome in a temporary tab without closing the browser", async () => {
  const output = createOutput();
  const calls: string[][] = [];

  const exitCode = await runCli(["setup"], createSetupRunOptions({
    output,
    env: {
      AGENT_BROWSER_AUTO_CONNECT: "1"
    },
    browserRun: async (args) => {
      calls.push(args);
      if (args[0] === "tab" && args[1] === "new") {
        return success("opened tab");
      }
      if (args[0] === "eval" && /const BRIDGE_URL/.test(args[1] ?? "")) {
        return success("undefined");
      }
      if (args[0] === "eval") {
        return success(JSON.stringify({
          controlled: true,
          bridgeInjected: true,
          userAgent: CHROME_USER_AGENT
        }));
      }
      if (args[0] === "tab" && args[1] === "close") {
        return success("closed tab");
      }
      throw new Error(`unexpected browser command: ${args.join(" ")}`);
    }
  }));

  assert.equal(exitCode, 0);
  assert.deepEqual(calls.map((args) => args[0]), [
    "tab",
    "eval",
    "eval",
    "tab"
  ]);
  assert.deepEqual(calls[0], [
    "tab",
    "new",
    "data:text/html,%3Ctitle%3EDivebell%20Setup%3C/title%3E"
  ]);
  assert.match(calls[1]?.[1] ?? "", /const BRIDGE_URL/);
  assert.match(calls[2]?.[1] ?? "", /__DIVEBELL_BRIDGE_MANAGER__/);
  assert.deepEqual(calls[3], ["tab", "close"]);
  assert.equal(calls.some((args) => args[0] === "close"), false);
  const parsed = JSON.parse(output.text());
  assert.equal(parsed.data.environment.browser.source.kind, "auto-connect");
});

test("stops before touching the browser when the local Bridge cannot start", async () => {
  const output = createOutput();
  let browserTouched = false;

  const exitCode = await runCli(["setup"], {
    stdout: output.stdout,
    stderr: output.stderr,
    env: {},
    bridgeStarter: {
      start: async () => {
        throw new Error("local ports are blocked");
      }
    },
    browserRunner: createBrowserRunner(async () => {
      browserTouched = true;
      return success("unexpected");
    })
  });

  assert.equal(exitCode, 1);
  assert.equal(browserTouched, false);
  const parsed = JSON.parse(output.text());
  assert.equal(parsed.error.code, "DIVEBELL_SETUP_BRIDGE_FAILED");
  assert.deepEqual(parsed.data.checks, [
    {
      id: "node",
      status: "passed"
    },
    {
      id: "bridge",
      status: "failed",
      message: "local ports are blocked"
    },
    {
      id: "browser.open",
      status: "skipped"
    },
    {
      id: "browser.control",
      status: "skipped"
    }
  ]);
});

test("adds Linux system dependencies only to the explicit browser repair", () => {
  assert.deepEqual(createBrowserInstallArgs("linux"), [
    "install",
    "--with-deps"
  ]);
  assert.deepEqual(createBrowserInstallArgs("darwin"), ["install"]);
  assert.deepEqual(createBrowserInstallArgs("win32"), ["install"]);
});

test("reports unsupported Node before starting the Bridge or browser", async () => {
  const output = createOutput();
  let bridgeTouched = false;
  let browserTouched = false;

  const exitCode = await runSetupCommand({
    args: {
      command: ["setup"],
      options: new Map()
    },
    stdout: output.stdout,
    env: {},
    nodeVersion: "22.14.0",
    fetcher: async () => {
      throw new Error("fetch should not run");
    },
    bridgeStarter: {
      start: async () => {
        bridgeTouched = true;
        throw new Error("bridge should not start");
      }
    },
    browserRunner: createBrowserRunner(async () => {
      browserTouched = true;
      return success("browser should not start");
    }),
    remoteDebuggingPageOpener: {
      open: async () => ({
        opened: false
      })
    }
  });

  assert.equal(exitCode, 1);
  assert.equal(bridgeTouched, false);
  assert.equal(browserTouched, false);
  const parsed = JSON.parse(output.text());
  assert.equal(parsed.error.code, "DIVEBELL_SETUP_NODE_UNSUPPORTED");
  assert.deepEqual(parsed.data.environment, {
    node: {
      version: "22.14.0",
      requirement: SUPPORTED_NODE_RANGE,
      supported: false
    },
    browser: {
      source: {
        kind: "managed"
      },
      name: null,
      version: null
    }
  });
  assert.deepEqual(parsed.data.checks, [
    {
      id: "node",
      status: "failed",
      message: `Node.js 22.14.0 does not satisfy ${SUPPORTED_NODE_RANGE}.`
    },
    {
      id: "bridge",
      status: "skipped"
    },
    {
      id: "browser.open",
      status: "skipped"
    },
    {
      id: "browser.control",
      status: "skipped"
    }
  ]);
});

test("recognizes only Node.js 24 as supported", () => {
  assert.equal(isSupportedNodeVersion("24.0.0"), true);
  assert.equal(isSupportedNodeVersion("24.13.1"), true);
  assert.equal(isSupportedNodeVersion("v24.13.1"), true);
  assert.equal(isSupportedNodeVersion("23.11.1"), false);
  assert.equal(isSupportedNodeVersion("25.0.0"), false);
  assert.equal(isSupportedNodeVersion("24"), false);
});

test("does not install over a configured browser executable", async () => {
  const output = createOutput();
  const calls: string[][] = [];

  const exitCode = await runCli(["setup"], createSetupRunOptions({
    output,
    env: {
      AGENT_BROWSER_EXECUTABLE_PATH: "/opt/custom/chrome"
    },
    browserRun: async (args) => {
      calls.push(args);
      if (args[0] === "open") return failure("Configured Chrome could not start");
      if (args[0] === "close") return success("closed");
      throw new Error(`unexpected browser command: ${args.join(" ")}`);
    }
  }));

  assert.equal(exitCode, 1);
  assert.deepEqual(calls.map((args) => args[0]), ["open", "close"]);
  const parsed = JSON.parse(output.text());
  assert.equal(parsed.error.code, "DIVEBELL_SETUP_CONFIGURED_BROWSER_FAILED");
  assert.deepEqual(parsed.data.environment.browser, {
    source: {
      kind: "executable"
    },
    name: null,
    version: null
  });
});

function expectedEnvironment(
  source: Record<string, string> = {
    kind: "managed"
  },
  name: string | null = "Chrome",
  version: string | null = "150.0.0.0"
) {
  return {
    node: {
      version: process.versions.node,
      requirement: SUPPORTED_NODE_RANGE,
      supported: true
    },
    browser: {
      source,
      name,
      version
    }
  };
}

function createSetupRunOptions(options: {
  output: ReturnType<typeof createOutput>;
  browserRun(
    args: string[],
    runOptions?: BrowserRunOptions
  ): Promise<BrowserRunResult>;
  lifecycle?: string[];
  env?: NodeJS.ProcessEnv;
  remoteDebuggingPageOpener?: {
    open(): Promise<{
      opened: boolean;
      reason?: string;
    }>;
  };
}) {
  let bridgeStarted = false;
  const bridgePid = 41321;
  const bridgePort = 18131;
  const bridgeUrl = `http://localhost:${bridgePort}`;
  return {
    stdout: options.output.stdout,
    stderr: options.output.stderr,
    env: options.env ?? {},
    fetcher: async (url: string | URL | Request) => {
      assert.equal(String(url), `${bridgeUrl}/runtimes`);
      if (!bridgeStarted) throw new TypeError("fetch failed");
      return jsonResponse({ runtimes: [] });
    },
    bridgeStarter: {
      start: async ({ port }: { port: number }) => {
        assert.equal(port, 0);
        bridgeStarted = true;
        options.lifecycle?.push("bridge start");
        return {
          pid: bridgePid,
          port: bridgePort,
          bridgeUrl
        };
      }
    },
    bridgeProcessController: {
      isRunning: (pid: number) => {
        assert.equal(pid, bridgePid);
        return true;
      },
      stop: (pid: number) => {
        assert.equal(pid, bridgePid);
        options.lifecycle?.push("bridge stop");
      }
    },
    browserRunner: createBrowserRunner(options.browserRun),
    remoteDebuggingPageOpener: options.remoteDebuggingPageOpener ?? {
      open: async () => ({
        opened: false,
        reason: "test did not open Chrome"
      })
    },
    setupWaiter: async () => {}
  };
}

function success(stdout: string): BrowserRunResult {
  return {
    exitCode: 0,
    stdout,
    stderr: ""
  };
}

function failure(stderr: string): BrowserRunResult {
  return {
    exitCode: 1,
    stdout: "",
    stderr
  };
}
