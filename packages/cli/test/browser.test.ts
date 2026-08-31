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

import { assertOpenOutput, commandData, createBrowserRunner, createOpenContextFixture, createOutput, errorOutput, jsonResponse } from "./helpers.js";

const WEBMCP_BROWSER_ARGUMENTS = [
  "--enable-features=WebMCP",
  "--enable-features=WebMCPTesting",
  "--enable-features=DevToolsWebMCPSupport"
].join("\n");

test("opens a browser page and auto-starts the bridge when needed", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-cli-operations-"));
  let bridgeStarted = false;

  const exitCode = await runCli(["open", "http://app.test/", "--port", "18080"], {
    stdout: output.stdout,
    stderr: output.stderr,
    operationLogDirectory,
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
  rmSync(operationLogDirectory, { recursive: true, force: true });
});

test("opens a browser page with a stable Divebell session", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-cli-operations-"));

  const exitCode = await runCli(["open", "http://app.test/orders?region=cn#details", "--session", "session-orders"], {
    stdout: output.stdout,
    stderr: output.stderr,
    operationLogDirectory,
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
  rmSync(operationLogDirectory, { recursive: true, force: true });
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

test("forwards supported agent-browser launch options through Divebell open", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  const browserOptions: Array<BrowserRunOptions | undefined> = [];
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-cli-operations-"));

  const exitCode = await runCli([
    "open",
    "http://app.test/",
    "--no-bridge",
    "--init-script",
    "boot.js",
    "--enable",
    "react-devtools",
    "--restore-save",
    "always",
    "--restore-initial-save",
    "false",
    "--restore-periodic-save",
    "--restore-close-save",
    "--restore-periodic-save-interval-ms",
    "45000",
    "--proxy",
    "http://proxy.test:8080",
    "--ignore-https-errors",
    "--allowed-domains",
    "app.test",
    "--engine",
    "chrome",
    "--screenshot-format",
    "jpeg"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    operationLogDirectory,
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
  assert.deepEqual(browserCalls, [[
    "--restore-save",
    "always",
    "--restore-initial-save",
    "false",
    "--restore-periodic-save",
    "--restore-close-save",
    "--restore-periodic-save-interval-ms",
    "45000",
    "--init-script",
    "boot.js",
    "--enable",
    "react-devtools",
    "--proxy",
    "http://proxy.test:8080",
    "--ignore-https-errors",
    "--screenshot-format",
    "jpeg",
    "--allowed-domains",
    "app.test",
    "--engine",
    "chrome",
    "open",
    `http://app.test/?divebellSessionId=${createOperationSessionId()}`
  ]]);
  assert.equal(browserOptions[0]?.disableRestore, true);
  rmSync(operationLogDirectory, { recursive: true, force: true });
});

test("enables WebMCP launch and CDP features for local Chrome by default", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  const browserOptions: Array<BrowserRunOptions | undefined> = [];
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-cli-operations-"));
  const browserRunner = createBrowserRunner(async (args, options) => {
    browserCalls.push(args);
    browserOptions.push(options);
    return {
      exitCode: 0,
      stdout: args[0] === "webmcp"
        ? JSON.stringify({ apiVersion: 1, tools: [], count: 0 })
        : "opened\n",
      stderr: ""
    };
  });

  const exitCode = await runCli([
    "open",
    "https://app.test/",
    "--no-default-profile",
    "--args=--start-maximized",
    "--no-bridge"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    operationLogDirectory,
    browserRunner
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(browserCalls, [[
    "open",
    `https://app.test/?divebellSessionId=${createOperationSessionId()}`
  ]]);
  assert.equal(
    browserOptions[0]?.browserArguments,
    `--start-maximized\n${WEBMCP_BROWSER_ARGUMENTS}`
  );

  const listOutput = createOutput();
  assert.equal(await runCli(["webmcp", "list", "--json"], {
    stdout: listOutput.stdout,
    stderr: listOutput.stderr,
    operationLogDirectory,
    browserRunner
  }), 0);
  assert.deepEqual(browserCalls[1], ["webmcp", "list", "--json"]);
  assert.equal(browserOptions[1]?.browserArguments, browserOptions[0]?.browserArguments);
  rmSync(operationLogDirectory, { recursive: true, force: true });
});

test("leaves external browser launch flags unchanged without failing open", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  const browserOptions: Array<BrowserRunOptions | undefined> = [];
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-cli-operations-"));

  try {
    const exitCode = await runCli([
      "open",
      "https://app.test/",
      "--cdp",
      "9222",
      "--no-bridge"
    ], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory,
      browserRunner: createBrowserRunner(async (args, options) => {
        browserCalls.push(args);
        browserOptions.push(options);
        return { exitCode: 0, stdout: "opened\n", stderr: "" };
      })
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(browserCalls, [[
      "--cdp",
      "9222",
      "open",
      `https://app.test/?divebellSessionId=${createOperationSessionId()}`
    ]]);
    assert.equal(browserOptions[0]?.browserArguments, undefined);
    assert.match(output.errorText(), /opening it anyway/);
    assert.match(output.errorText(), /webmcp_unsupported/);
    assert.match(output.errorText(), /WEBMCP_UNSUPPORTED/);
  } finally {
    rmSync(operationLogDirectory, { recursive: true, force: true });
  }
});

test("allows local Chrome WebMCP launch features to be disabled", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  const browserOptions: Array<BrowserRunOptions | undefined> = [];
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-cli-operations-"));

  try {
    assert.equal(await runCli([
      "open",
      "https://app.test/",
      "--no-webmcp",
      "--no-bridge"
    ], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory,
      browserRunner: createBrowserRunner(async (args, options) => {
        browserCalls.push(args);
        browserOptions.push(options);
        return { exitCode: 0, stdout: "opened\n", stderr: "" };
      })
    }), 0);

    assert.deepEqual(browserCalls, [[
      "open",
      `https://app.test/?divebellSessionId=${createOperationSessionId()}`
    ]]);
    assert.equal(browserOptions[0]?.browserArguments, undefined);
    assert.equal(output.errorText(), "");
  } finally {
    rmSync(operationLogDirectory, { recursive: true, force: true });
  }
});

test("does not inject Chrome WebMCP features into a non-Chrome engine", async () => {
  const output = createOutput();
  const browserOptions: Array<BrowserRunOptions | undefined> = [];
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-cli-operations-"));

  try {
    assert.equal(await runCli([
      "open",
      "https://app.test/",
      "--engine",
      "lightpanda",
      "--no-bridge"
    ], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory,
      browserRunner: createBrowserRunner(async (_args, options) => {
        browserOptions.push(options);
        return { exitCode: 0, stdout: "opened\n", stderr: "" };
      })
    }), 0);

    assert.equal(browserOptions[0]?.browserArguments, undefined);
  } finally {
    rmSync(operationLogDirectory, { recursive: true, force: true });
  }
});

test("does not inject Chrome WebMCP features into a non-Chrome configured engine", async () => {
  const output = createOutput();
  const browserOptions: Array<BrowserRunOptions | undefined> = [];
  const tempDirectory = mkdtempSync(join(tmpdir(), "divebell-webmcp-config-"));
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-cli-operations-"));
  const configPath = join(tempDirectory, "agent-browser.json");
  writeFileSync(configPath, `${JSON.stringify({ engine: "lightpanda" })}\n`, "utf8");

  try {
    assert.equal(await runCli([
      "open",
      "https://app.test/",
      "--config",
      configPath,
      "--no-bridge"
    ], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory,
      browserRunner: createBrowserRunner(async (_args, options) => {
        browserOptions.push(options);
        return { exitCode: 0, stdout: "opened\n", stderr: "" };
      })
    }), 0);

    assert.equal(browserOptions[0]?.browserArguments, undefined);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
    rmSync(operationLogDirectory, { recursive: true, force: true });
  }
});

test("inherits repeatable user init scripts across open commands", async () => {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-cli-operations-"));
  const browserCalls: string[][] = [];
  const browserRunner = createBrowserRunner(async (args) => {
    browserCalls.push(args);
    return { exitCode: 0, stdout: "opened\n", stderr: "" };
  });
  const run = async (args: string[]): Promise<number> => await runCli(args, {
    stdout: createOutput().stdout,
    stderr: createOutput().stderr,
    operationLogDirectory,
    fetcher: async () => jsonResponse({ runtimes: [] }),
    browserRunner
  });

  try {
    assert.equal(await run([
      "open",
      "http://app.test/first",
      "--bridge",
      "http://bridge.test",
      "--init-script",
      "first.js",
      "--init-script",
      "second.js"
    ]), 0);
    assert.equal(await run(["open", "http://app.test/second"]), 0);

    assert.equal(browserCalls.length, 2);
    for (const call of browserCalls) {
      assert.deepEqual(call.slice(0, 4), [
        "--init-script",
        "first.js",
        "--init-script",
        "second.js"
      ]);
    }
    assert.equal(browserCalls[0]?.at(-2), "--init-script");
    assert.equal(browserCalls[1]?.at(-2), "--init-script");
    assert.equal(browserCalls[1]?.at(-1), browserCalls[0]?.at(-1));

    const [operationFile] = readdirSync(operationLogDirectory);
    assert.notEqual(operationFile, undefined);
    const openContext = JSON.parse(readFileSync(
      join(operationLogDirectory, operationFile as string),
      "utf8"
    ));
    assert.deepEqual(openContext.browserInitScripts, ["first.js", "second.js"]);
  } finally {
    rmSync(operationLogDirectory, { recursive: true, force: true });
  }
});

test("disables the default Chrome profile with an open flag", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  const browserOptions: Array<BrowserRunOptions | undefined> = [];

  const exitCode = await runCli([
    "open",
    "http://app.test/",
    "--no-default-profile",
    "--no-bridge"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    browserRunner: createBrowserRunner(async (args, options) => {
      browserCalls.push(args);
      browserOptions.push(options);
      return { exitCode: 0, stdout: "opened\n", stderr: "" };
    })
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(browserCalls, [[
    "open",
    `http://app.test/?divebellSessionId=${createOperationSessionId()}`
  ]]);
  assert.equal(browserOptions[0]?.disableDefaultProfile, true);
  assert.equal(browserOptions[0]?.disableRestore, undefined);
});

test("preserves command-level restore save policy for a reused daemon and stop", async () => {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-cli-operations-"));
  const browserCalls: string[][] = [];
  const browserRunner = createBrowserRunner(async (args) => {
    browserCalls.push(args);
    return { exitCode: 0, stdout: "ok\n", stderr: "" };
  });
  const run = async (args: string[]): Promise<number> => await runCli(args, {
    stdout: createOutput().stdout,
    stderr: createOutput().stderr,
    operationLogDirectory,
    browserRunner
  });

  try {
    assert.equal(await run([
      "open",
      "http://app.test/",
      "--no-bridge",
      "--restore-save",
      "never",
      "--restore-initial-save",
      "false",
      "--restore-periodic-save",
      "--restore-close-save",
      "--restore-periodic-save-interval-ms",
      "45000",
      "--config",
      "browser-policy.json"
    ]), 0);
    assert.equal(await run(["wait", "5000"]), 0);
    assert.equal(await run(["stop"]), 0);

    const policyArgs = [
      "--restore-save",
      "never",
      "--restore-initial-save",
      "false",
      "--restore-periodic-save",
      "--restore-close-save",
      "--restore-periodic-save-interval-ms",
      "45000",
      "--config",
      "browser-policy.json"
    ];
    assert.deepEqual(browserCalls, [
      [...policyArgs, "open", `http://app.test/?divebellSessionId=${createOperationSessionId()}`],
      ["wait", "5000", ...policyArgs],
      ["close", ...policyArgs]
    ]);
  } finally {
    rmSync(operationLogDirectory, { recursive: true, force: true });
  }
});

test("preserves state-backed browser restore mode across page commands and stop", async () => {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-cli-operations-"));
  const browserCalls: string[][] = [];
  const browserOptions: Array<BrowserRunOptions | undefined> = [];
  const browserRunner = createBrowserRunner(async (args, options) => {
    browserCalls.push(args);
    browserOptions.push(options);
    return {
      exitCode: 0,
      stdout: args[0] === "get" ? "http://app.test/\n" : "ok\n",
      stderr: ""
    };
  });

  const run = async (args: string[]): Promise<number> => {
    const output = createOutput();
    const exitCode = await runCli(args, {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory,
      browserRunner
    });
    assert.equal(output.errorText(), "");
    return exitCode;
  };

  try {
    assert.equal(await run([
      "open",
      "http://app.test/",
      "--state",
      "riff-state.json",
      "--ui",
      "--no-bridge"
    ]), 0);

    const [contextFile] = readdirSync(operationLogDirectory);
    assert.notEqual(contextFile, undefined);
    const context = JSON.parse(readFileSync(
      join(operationLogDirectory, contextFile as string),
      "utf8"
    ));
    assert.equal(context.schemaVersion, 1);
    assert.equal(context.browserUi, true);
    assert.equal(context.browserReuseInitialBlankPage, true);
    assert.equal(context.browserRestoreDisabled, true);
    assert.equal(context.browserDefaultProfileDisabled, true);

    assert.equal(await run(["wait", "5000"]), 0);
    assert.equal(await run(["get", "url"]), 0);
    assert.equal(await run(["screenshot"]), 0);
    assert.equal(await run(["stop"]), 0);

    assert.deepEqual(browserCalls, [
      ["--state", "riff-state.json", "open", `http://app.test/?divebellSessionId=${createOperationSessionId()}`],
      ["wait", "5000"],
      ["get", "url"],
      ["screenshot"],
      ["close"]
    ]);
    assert.equal(browserOptions[0]?.ui, true);
    assert.equal(browserOptions[0]?.reuseInitialBlankPage, true);
    assert.deepEqual(
      browserOptions.map((options) => options?.disableRestore),
      [true, true, true, true, true]
    );
    assert.deepEqual(
      browserOptions.map((options) => options?.disableDefaultProfile),
      [true, true, true, true, true]
    );
    assert.deepEqual(
      browserOptions.map((options) => options?.ui),
      [true, true, true, true, true]
    );
    assert.deepEqual(
      browserOptions.map((options) => options?.reuseInitialBlankPage),
      [true, true, true, true, true]
    );
  } finally {
    rmSync(operationLogDirectory, { recursive: true, force: true });
  }
});

test("keeps the default Chrome profile disabled for an explicit restore context", async () => {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-cli-operations-"));
  const browserCalls: string[][] = [];
  const browserOptions: Array<BrowserRunOptions | undefined> = [];
  const browserRunner = createBrowserRunner(async (args, options) => {
    browserCalls.push(args);
    browserOptions.push(options);
    return { exitCode: 0, stdout: "ok\n", stderr: "" };
  });
  const run = async (args: string[]): Promise<number> => await runCli(args, {
    stdout: createOutput().stdout,
    stderr: createOutput().stderr,
    operationLogDirectory,
    browserRunner
  });

  try {
    assert.equal(await run([
      "open",
      "http://app.test/",
      "--restore",
      "shared-login",
      "--no-bridge"
    ]), 0);
    assert.equal(await run(["wait", "10"]), 0);
    assert.equal(await run(["stop"]), 0);

    assert.deepEqual(browserCalls, [
      ["--restore", "shared-login", "open", `http://app.test/?divebellSessionId=${createOperationSessionId()}`],
      ["wait", "10", "--restore", "shared-login"],
      ["close", "--restore", "shared-login"]
    ]);
    assert.deepEqual(
      browserOptions.map((options) => options?.disableDefaultProfile),
      [true, true, true]
    );
    assert.deepEqual(
      browserOptions.map((options) => options?.disableRestore),
      [undefined, undefined, undefined]
    );
  } finally {
    rmSync(operationLogDirectory, { recursive: true, force: true });
  }
});

test("pins an automatically selected Chrome profile to the open context", async () => {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-cli-operations-"));
  const browserOptions: Array<BrowserRunOptions | undefined> = [];
  const browserRunner = createBrowserRunner(async (args, options) => {
    browserOptions.push(options);
    return {
      exitCode: 0,
      stdout: "ok\n",
      stderr: "",
      ...(args.includes("open") ? { defaultProfile: "Profile 2" } : {})
    };
  });
  const run = async (args: string[]): Promise<number> => await runCli(args, {
    stdout: createOutput().stdout,
    stderr: createOutput().stderr,
    operationLogDirectory,
    browserRunner
  });

  try {
    assert.equal(await run(["open", "http://app.test/", "--no-bridge"]), 0);
    const [contextFile] = readdirSync(operationLogDirectory);
    assert.notEqual(contextFile, undefined);
    const context = JSON.parse(readFileSync(
      join(operationLogDirectory, contextFile as string),
      "utf8"
    ));
    assert.equal(context.browserDefaultProfile, "Profile 2");
    assert.equal(context.browserUi, false);
    assert.equal(context.browserReuseInitialBlankPage, true);

    assert.equal(await run(["wait", "10"]), 0);
    assert.equal(await run(["stop"]), 0);
    assert.equal(browserOptions[0]?.defaultProfile, undefined);
    assert.equal(browserOptions[1]?.defaultProfile, "Profile 2");
    assert.equal(browserOptions[2]?.defaultProfile, "Profile 2");
    assert.deepEqual(browserOptions.map((options) => options?.ui), [false, false, false]);
    assert.deepEqual(
      browserOptions.map((options) => options?.reuseInitialBlankPage),
      [true, true, true]
    );
  } finally {
    rmSync(operationLogDirectory, { recursive: true, force: true });
  }
});

test("assigns one Bridge port per directory and reuses it across open commands", async () => {
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
    assert.equal(reopened.bridgePort, opened.bridgePort);
    assert.equal(reopened.bridgeUrl, opened.bridgeUrl);
    assert.equal(reopened.injectedScriptPath, opened.injectedScriptPath);
    assert.equal(await bridgeIsAvailable(opened.bridgeUrl), true);

    const failedOpenOutput = createOutput();
    assert.equal(await runCli(["open", "http://app.test/failed"], {
      stdout: failedOpenOutput.stdout,
      stderr: failedOpenOutput.stderr,
      bridgeStateDirectory: stateDirectory,
      operationLogDirectory,
      bridgeStarter: createDetachedBridgeStarter(
        pathToFileURL(join(process.cwd(), "dist", "bin.js")).href
      ),
      browserRunner: createBrowserRunner(async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "navigation failed"
      }))
    }), 1);
    assert.equal(JSON.parse(failedOpenOutput.text()).error.code, "PAGE_OPEN_FAILED");
    assert.equal(await bridgeIsAvailable(opened.bridgeUrl), true);

    const [operationFile] = readdirSync(operationLogDirectory);
    assert.notEqual(operationFile, undefined);
    const openContext = JSON.parse(readFileSync(
      join(operationLogDirectory, operationFile as string),
      "utf8"
    ));
    assert.equal(openContext.url, "http://app.test/next");
    assert.equal(openContext.bridgeUrl, opened.bridgeUrl);

    const runtimeOutput = createOutput();
    assert.equal(await runCli(["runtimes"], {
      stdout: runtimeOutput.stdout,
      stderr: runtimeOutput.stderr,
      bridgeStateDirectory: stateDirectory,
      operationLogDirectory,
      browserRunner
    }), 0);
    assert.equal(commandData<{ bridgeUrl: string }>(runtimeOutput.text()).bridgeUrl, reopened.bridgeUrl);

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

async function bridgeIsAvailable(bridgeUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${bridgeUrl}/runtimes`);
    return response.ok;
  } catch {
    return false;
  }
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
  assert.deepEqual(browserOptions, [{
    ui: false,
    reuseInitialBlankPage: true,
    browserArguments: WEBMCP_BROWSER_ARGUMENTS
  }]);
});

test("forwards a page navigation timeout when opening", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];

  const exitCode = await runCli([
    "open",
    "http://app.test/",
    "--timeout",
    "42000",
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
  const sessionId = createOperationSessionId();
  assert.deepEqual(browserCalls, [[
    "open",
    `http://app.test/?divebellSessionId=${sessionId}`,
    "--timeout",
    "42000"
  ]]);
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
  assert.deepEqual(browserOptions, [{
    ui: true,
    reuseInitialBlankPage: true,
    browserArguments: WEBMCP_BROWSER_ARGUMENTS
  }]);
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
    assert.deepEqual(commandData(output.text()), {
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
    assert.equal(commandData(output.text()), "clicked");
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

    assert.equal((output.text().match(/"data": "clicked"/gu) ?? []).length, 3);
    assert.equal((output.text().match(/"status": "ok"/gu) ?? []).length, 3);
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

test("delegates additional agent-browser page commands without changing recorded commands", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  const context = createOpenContextFixture();

  try {
    for (const command of [
      ["hover", "e8"],
      ["tap", "e8"],
      ["swipe", "up", "500"],
      ["check-element", "e9"],
      ["drag", "e10", "e11"],
      ["wait", "--url", "**/orders", "--load", "networkidle"],
      ["get", "text", "e12"],
      ["is", "visible", "e13"],
      ["network", "har", "start", "--content", "none"],
      ["video", "start", "flow.webm"],
      ["tab", "new", "--label", "docs", "http://docs.test/"],
      ["device", "list"],
      ["confirm", "pending-1"],
      ["eval", "--base64", "ZG9jdW1lbnQudGl0bGU="]
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
      ["hover", "@e8"],
      ["tap", "@e8"],
      ["swipe", "up", "500"],
      ["check", "@e9"],
      ["drag", "@e10", "@e11"],
      ["wait", "--url", "**/orders", "--load", "networkidle"],
      ["get", "text", "@e12"],
      ["is", "visible", "@e13"],
      ["network", "har", "start", "--content", "none"],
      ["record", "start", "flow.webm"],
      ["tab", "new", "http://docs.test/", "--label", "docs"],
      ["device", "list"],
      ["confirm", "pending-1"],
      ["eval", "--base64", "ZG9jdW1lbnQudGl0bGU="]
    ]);
  } finally {
    context.cleanup();
  }
});

test("navigates the current page and keeps its Divebell session", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  const context = createOpenContextFixture({ sessionId: "session-recording" });

  try {
    const exitCode = await runCli(["goto", "http://app.test/orders?region=cn#details"], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory: context.operationLogDirectory,
      browserRunner: createBrowserRunner(async (args) => {
        browserCalls.push(args);
        return {
          exitCode: 0,
          stdout: "navigated\n",
          stderr: ""
        };
      })
    });

    assert.equal(exitCode, 0);
    assert.equal(commandData(output.text()), "navigated");
    assert.deepEqual(browserCalls, [[
      "goto",
      "http://app.test/orders?region=cn&divebellSessionId=session-recording#details"
    ]]);
  } finally {
    context.cleanup();
  }
});

test("forwards eval scripts from standard input", async () => {
  const output = createOutput();
  const browserCalls: Array<{ args: string[]; options: BrowserRunOptions | undefined }> = [];
  const context = createOpenContextFixture();

  try {
    const exitCode = await runCli(["eval", "--stdin"], {
      stdout: output.stdout,
      stderr: output.stderr,
      stdin: createInput("document.title\n"),
      operationLogDirectory: context.operationLogDirectory,
      browserRunner: createBrowserRunner(async (args, options) => {
        browserCalls.push({ args, options });
        return {
          exitCode: 0,
          stdout: "Recording Replay\n",
          stderr: ""
        };
      })
    });

    assert.equal(exitCode, 0);
    assert.equal(commandData(output.text()), "Recording Replay");
    assert.deepEqual(browserCalls, [{
      args: ["eval", "--stdin"],
      options: {
        input: "document.title\n",
        ui: false,
        reuseInitialBlankPage: false
      }
    }]);
  } finally {
    context.cleanup();
  }
});

test("requires a Divebell-opened page before navigation", async () => {
  const output = createOutput();
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-no-open-"));
  try {
    const exitCode = await runCli(["goto", "http://app.test/orders"], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory,
      browserRunner: createBrowserRunner(async () => {
        throw new Error("browser should not be called");
      })
    });

    assert.equal(exitCode, 1);
    assert.equal(JSON.parse(output.text()).error.code, "OPEN_CONTEXT_REQUIRED");
  } finally {
    rmSync(operationLogDirectory, { recursive: true, force: true });
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
    const parsed = JSON.parse(output.text());
    assert.equal(parsed.status, "error");
    assert.equal(parsed.error.code, "COMMAND_FAILED");
    assert.match(parsed.message, /Multiple interactive elements matched text "Refresh order"/);
    assert.equal(output.errorText(), "");
    assert.equal(browserCalls.length, 1);
    assert.equal(browserCalls[0]?.[0], "eval");
  } finally {
    context.cleanup();
  }
});

function createInput(value: string): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator]() {
      yield value;
    }
  };
}

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
    assert.deepEqual(commandData(output.text()), {
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
    assert.deepEqual(commandData(output.text()), {
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
    assert.deepEqual(commandData(output.text()), {
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
    assert.deepEqual(commandData(output.text()), {
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
    assert.equal(commandData(output.text()), [
      "[123.1] GET http://app.test/api/orders (fetch) 200",
      "[123.3] GET http://app.test/api/orders/failed (xhr)"
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
    assert.deepEqual(commandData(output.text()), {
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
      assert.deepEqual(commandData(output.text()), { command });
    }
    assert.deepEqual(calls, commands.map((command) => [...command, "--json"]));
  } finally {
    context.cleanup();
  }
});

test("forwards WebMCP list and call commands to agent-browser", async () => {
  const context = createOpenContextFixture();
  const calls: string[][] = [];

  try {
    for (const command of [
      ["webmcp", "list", "--json"],
      [
        "webmcp",
        "call",
        "getProductCount",
        "--input",
        "{}",
        "--frame-id",
        "frame-a",
        "--timeout",
        "5000",
        "--json"
      ]
    ]) {
      const output = createOutput();
      const exitCode = await runCli(command, {
        stdout: output.stdout,
        stderr: output.stderr,
        operationLogDirectory: context.operationLogDirectory,
        browserRunner: createBrowserRunner(async (args) => {
          calls.push(args);
          return {
            exitCode: 0,
            stdout: JSON.stringify({ apiVersion: 1, command: args }),
            stderr: ""
          };
        })
      });
      assert.equal(exitCode, 0);
      assert.deepEqual(commandData(output.text()), { apiVersion: 1, command });
    }
    assert.deepEqual(calls, [
      ["webmcp", "list", "--json"],
      [
        "webmcp",
        "call",
        "getProductCount",
        "--input",
        "{}",
        "--frame-id",
        "frame-a",
        "--timeout",
        "5000",
        "--json"
      ]
    ]);
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
