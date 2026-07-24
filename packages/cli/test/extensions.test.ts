import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "@rstest/core";

import {
  createOpenRuntimeCliWithExternalExtensions,
  createOpenRuntimeCli,
  runCli,
  type OpenRuntimeExtensionCommand,
  type OpenRuntimeExtensionDefinition
} from "../dist/index.js";

import { commandOutput, createBrowserRunner, createOpenContextFixture, createOutput, jsonResponse } from "./helpers.js";

function createCommandExtension(
  command: OpenRuntimeExtensionCommand,
  extensionName = command.name
): OpenRuntimeExtensionDefinition {
  return {
    schemaVersion: 1,
    name: extensionName,
    commands: [command]
  };
}

test("runs open, detectStack, and close hooks only at their matching lifecycle points", async () => {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "openruntime-extension-hooks-"));
  const calls: string[] = [];
  let detectOpenContext: unknown;
  let closeOpenContext: unknown;
  let closeCount = 0;
  const cli = createOpenRuntimeCli({
    extensions: [{
      schemaVersion: 1,
      name: "modern-detector",
      hooks: {
        open: async () => {
          calls.push("open");
          return {
            scripts: ["globalThis.__OPENRUNTIME_HOOK_TEST__ = true;"],
            context: { diagnosticsEnabled: true, source: "open-hook" }
          };
        },
        detectStack: async ({ openruntime, openContext }) => {
          calls.push("detectStack");
          detectOpenContext = openContext;
          const detected = await openruntime.browser.eval<boolean>("globalThis._MODERNJS_ROUTE_MANIFEST != null");
          return detected ? {
            id: "modernjs",
            name: "Modern.js",
            evidence: ["window._MODERNJS_ROUTE_MANIFEST"]
          } : undefined;
        },
        close: async ({ openContext }) => {
          calls.push("close");
          closeOpenContext = openContext;
          closeCount += 1;
        }
      }
    }]
  });
  const browserCalls: string[][] = [];
  const browserRunner = createBrowserRunner(async (args) => {
    browserCalls.push(args);
    if (args[0] === "open") {
      const scriptPath = args[3];
      assert.equal(args[2], "--init-script");
      assert.equal(typeof scriptPath, "string");
      assert.match(readFileSync(scriptPath as string, "utf8"), /__OPENRUNTIME_HOOK_TEST__/);
      return { exitCode: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "eval") {
      if (args[1] === "globalThis.location.href") {
        return { exitCode: 0, stdout: JSON.stringify("http://app.test/"), stderr: "" };
      }
      return { exitCode: 0, stdout: "true", stderr: "" };
    }
    if (args[0] === "close") {
      return { exitCode: 0, stdout: "closed", stderr: "" };
    }
    throw new Error(`Unexpected browser command: ${args.join(" ")}`);
  });

  try {
    const openOutput = createOutput();
    assert.equal(await cli.run(["open", "http://app.test", "--no-bridge"], {
      stdout: openOutput.stdout,
      stderr: openOutput.stderr,
      operationLogDirectory,
      browserRunner
    }), 0);
    assert.deepEqual(calls, ["open"]);

    const stackOutput = createOutput();
    assert.equal(await cli.run(["stack"], {
      stdout: stackOutput.stdout,
      stderr: stackOutput.stderr,
      operationLogDirectory,
      browserRunner
    }), 0);
    const stackResult = JSON.parse(stackOutput.text());
    assert.equal(stackResult.data.detections[0].id, "modernjs");
    assert.equal(stackResult.data.detections[0].extension, "modern-detector");
    assert.equal(stackResult.data.cached, false);
    assert.deepEqual(detectOpenContext, {
      diagnosticsEnabled: true,
      source: "open-hook"
    });
    assert.deepEqual(calls, ["open", "detectStack"]);

    const cachedOutput = createOutput();
    assert.equal(await cli.run(["stack"], {
      stdout: cachedOutput.stdout,
      stderr: cachedOutput.stderr,
      operationLogDirectory,
      browserRunner
    }), 0);
    assert.equal(JSON.parse(cachedOutput.text()).data.cached, true);
    assert.deepEqual(calls, ["open", "detectStack"]);

    const closeOutput = createOutput();
    assert.equal(await cli.run(["stop"], {
      stdout: closeOutput.stdout,
      stderr: closeOutput.stderr,
      operationLogDirectory,
      browserRunner
    }), 0);
    assert.equal(closeCount, 1);
    assert.deepEqual(closeOpenContext, {
      diagnosticsEnabled: true,
      source: "open-hook"
    });
    assert.deepEqual(calls, ["open", "detectStack", "close"]);
    assert.deepEqual(browserCalls.map((args) => args[0]), ["open", "eval", "eval", "eval", "close"]);
  } finally {
    rmSync(operationLogDirectory, { recursive: true, force: true });
  }
});

test("returns each extension's saved open context to its commands", async () => {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "openruntime-extension-context-"));
  const headers = JSON.stringify({
    Authorization: "Bearer secret-token",
    "Get-Svc": "1"
  });
  const cli = createOpenRuntimeCli({
    extensions: [
      {
        schemaVersion: 1,
        name: "goofy",
        commands: [{
          name: "goofy",
          async run({ openContext }) {
            return { openContext };
          }
        }],
        hooks: {
          async open({ headers: openHeaders }) {
            const diagnosticsEnabled = Object.entries(openHeaders ?? {}).some(
              ([name, value]) => name.toLowerCase() === "get-svc" && value === "1"
            );
            return diagnosticsEnabled ? {
              context: {
                diagnosticsEnabled: true
              }
            } : undefined;
          }
        }
      },
      {
        schemaVersion: 1,
        name: "other",
        commands: [{
          name: "other",
          async run({ openContext }) {
            return { openContext };
          }
        }],
        hooks: {
          async open() {
            return {
              context: {
                owner: "other"
              }
            };
          }
        }
      }
    ]
  });
  const browserRunner = createBrowserRunner(async () => ({
    exitCode: 0,
    stdout: "",
    stderr: ""
  }));

  try {
    const openOutput = createOutput();
    assert.equal(await cli.run([
      "open",
      "http://app.test",
      "--headers",
      headers,
      "--no-bridge"
    ], {
      stdout: openOutput.stdout,
      stderr: openOutput.stderr,
      operationLogDirectory,
      browserRunner
    }), 0);
    assert.doesNotMatch(openOutput.text(), /secret-token/);

    const files = readdirSync(operationLogDirectory);
    assert.equal(files.length, 1);
    const persistedText = readFileSync(join(operationLogDirectory, files[0] as string), "utf8");
    assert.doesNotMatch(persistedText, /secret-token|Authorization|Get-Svc/);
    assert.deepEqual(JSON.parse(persistedText).extensionContexts, {
      goofy: {
        diagnosticsEnabled: true
      },
      other: {
        owner: "other"
      }
    });

    const goofyOutput = createOutput();
    assert.equal(await cli.run(["goofy", "status"], {
      stdout: goofyOutput.stdout,
      stderr: goofyOutput.stderr,
      operationLogDirectory,
      browserRunner
    }), 0);
    assert.deepEqual(JSON.parse(goofyOutput.text()), commandOutput("goofy status", {
      openContext: {
        diagnosticsEnabled: true
      }
    }));

    const otherOutput = createOutput();
    assert.equal(await cli.run(["other", "status"], {
      stdout: otherOutput.stdout,
      stderr: otherOutput.stderr,
      operationLogDirectory,
      browserRunner
    }), 0);
    assert.deepEqual(JSON.parse(otherOutput.text()), commandOutput("other status", {
      openContext: {
        owner: "other"
      }
    }));

    assert.equal(await cli.run(["open", "http://other.test", "--no-bridge"], {
      stdout: createOutput().stdout,
      stderr: createOutput().stderr,
      operationLogDirectory,
      browserRunner
    }), 0);
    const reopenedGoofyOutput = createOutput();
    assert.equal(await cli.run(["goofy", "status"], {
      stdout: reopenedGoofyOutput.stdout,
      stderr: reopenedGoofyOutput.stderr,
      operationLogDirectory,
      browserRunner
    }), 0);
    assert.deepEqual(JSON.parse(reopenedGoofyOutput.text()), commandOutput("goofy status", {}));
  } finally {
    rmSync(operationLogDirectory, { recursive: true, force: true });
  }
});

test("ignores invalid open context without blocking the page", async () => {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "openruntime-invalid-extension-context-"));
  const cli = createOpenRuntimeCli({
    extensions: [{
      schemaVersion: 1,
      name: "invalid-context",
      hooks: {
        async open() {
          return {
            context: {
              diagnosticsEnabled: undefined
            } as never
          };
        }
      }
    }]
  });

  try {
    const output = createOutput();
    assert.equal(await cli.run(["open", "http://app.test", "--no-bridge"], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory,
      browserRunner: createBrowserRunner(async () => ({
        exitCode: 0,
        stdout: "",
        stderr: ""
      }))
    }), 0);
    assert.match(
      output.errorText(),
      /Open hook context must be a JSON object containing only serializable values/
    );
    const files = readdirSync(operationLogDirectory);
    const persisted = JSON.parse(readFileSync(join(operationLogDirectory, files[0] as string), "utf8"));
    assert.equal(persisted.extensionContexts, undefined);
  } finally {
    rmSync(operationLogDirectory, { recursive: true, force: true });
  }
});

test("provides the effective request headers to open hooks", async () => {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "openruntime-extension-headers-"));
  const browserCalls: string[][] = [];
  let receivedHeaders: Readonly<Record<string, string>> | undefined;
  const headers = JSON.stringify({
    Authorization: "Bearer secret-token",
    "X-Debug-User": "agent"
  });
  const cli = createOpenRuntimeCli({
    extensions: [{
      schemaVersion: 1,
      name: "header-aware",
      hooks: {
        open: async (options) => {
          receivedHeaders = options.headers;
        }
      }
    }]
  });

  try {
    const output = createOutput();
    assert.equal(await cli.run([
      "open",
      "http://app.test",
      "--headers",
      JSON.stringify({ "X-Ignored": "first" }),
      "--headers",
      headers,
      "--session",
      "session-headers",
      "--no-bridge"
    ], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory,
      browserRunner: createBrowserRunner(async (args) => {
        browserCalls.push(args);
        return { exitCode: 0, stdout: "", stderr: "" };
      })
    }), 0);

    assert.deepEqual(receivedHeaders, {
      Authorization: "Bearer secret-token",
      "X-Debug-User": "agent"
    });
    assert.equal(Object.isFrozen(receivedHeaders), true);
    assert.deepEqual(browserCalls, [[
      "open",
      "http://app.test/?openruntimeSessionId=session-headers",
      "--headers",
      headers
    ]]);
    assert.doesNotMatch(output.text(), /secret-token/);
  } finally {
    rmSync(operationLogDirectory, { recursive: true, force: true });
  }
});

test("runs the previous page close hook before opening its replacement", async () => {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "openruntime-extension-reopen-hooks-"));
  const calls: string[] = [];
  const cli = createOpenRuntimeCli({
    extensions: [{
      schemaVersion: 1,
      name: "page-lifecycle",
      hooks: {
        open: async ({ url }) => {
          calls.push(`open:${url}`);
        },
        close: async ({ page }) => {
          calls.push(`close:${page.url}`);
        }
      }
    }]
  });
  const browserRunner = createBrowserRunner(async (args) => {
    if (args[0] === "open" || args[0] === "close") {
      return { exitCode: 0, stdout: "", stderr: "" };
    }
    throw new Error(`Unexpected browser command: ${args.join(" ")}`);
  });

  try {
    assert.equal(await cli.run(["open", "http://first.test", "--no-bridge"], {
      stdout: createOutput().stdout,
      stderr: createOutput().stderr,
      operationLogDirectory,
      browserRunner
    }), 0);
    assert.equal(await cli.run(["open", "http://second.test", "--no-bridge"], {
      stdout: createOutput().stdout,
      stderr: createOutput().stderr,
      operationLogDirectory,
      browserRunner
    }), 0);
    assert.deepEqual(calls, [
      "open:http://first.test",
      "close:http://first.test",
      "open:http://second.test"
    ]);

    assert.equal(await cli.run(["stop"], {
      stdout: createOutput().stdout,
      stderr: createOutput().stderr,
      operationLogDirectory,
      browserRunner
    }), 0);
    assert.deepEqual(calls, [
      "open:http://first.test",
      "close:http://first.test",
      "open:http://second.test",
      "close:http://second.test"
    ]);
  } finally {
    rmSync(operationLogDirectory, { recursive: true, force: true });
  }
});

test("installs, loads, lists, and removes a self-contained npm extension package", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-extension-package-test-"));
  const extensionsDirectory = join(tempDir, "extensions");
  const packageRoot = join(tempDir, "fixture", "package");
  const archivePath = join(tempDir, "demo-command-1.0.0.tgz");
  const updatedPackageRoot = join(tempDir, "fixture-updated", "package");
  const updatedArchivePath = join(tempDir, "demo-command-1.1.0.tgz");
  mkdirSync(packageRoot, { recursive: true });
  writeFileSync(join(packageRoot, "package.json"), `${JSON.stringify({
    name: "@demo/command-hello",
    version: "1.0.0",
    type: "module",
    openruntime: {
      schemaVersion: 1,
      extensions: ["./index.mjs"]
    }
  }, null, 2)}\n`, "utf8");
  writeFileSync(join(packageRoot, "index.mjs"), `export default {
  schemaVersion: 1,
  name: "hello-installed",
  commands: [{
    name: "hello-installed",
    commandReferences: [{ category: "Extensions", usage: "openruntime hello-installed", description: "Runs installed command." }],
    async run(options) { return await (await import("./run.mjs")).run(options); }
  }]
};\n`, "utf8");
  writeFileSync(join(packageRoot, "run.mjs"), `
globalThis.__OPENRUNTIME_LAZY_EXTENSION_TEST__ = (globalThis.__OPENRUNTIME_LAZY_EXTENSION_TEST__ ?? 0) + 1;
export async function run() { return { installed: true }; }
`, "utf8");
  const tarResult = spawnSync("tar", ["-czf", archivePath, "-C", join(tempDir, "fixture"), "package"], {
    encoding: "utf8"
  });
  assert.equal(tarResult.status, 0, tarResult.stderr);
  mkdirSync(updatedPackageRoot, { recursive: true });
  writeFileSync(join(updatedPackageRoot, "package.json"), `${JSON.stringify({
    name: "@demo/command-hello",
    version: "1.1.0",
    type: "module",
    openruntime: {
      schemaVersion: 1,
      extensions: ["./index.mjs"]
    }
  }, null, 2)}\n`, "utf8");
  writeFileSync(join(updatedPackageRoot, "index.mjs"), `export default {
  schemaVersion: 1,
  name: "hello-installed",
  commands: [{
    name: "hello-installed",
    commandReferences: [{ category: "Extensions", usage: "openruntime hello-installed", description: "Runs updated command." }],
    async run() { return { installed: true, updated: true }; }
  }]
};\n`, "utf8");
  const updatedTarResult = spawnSync("tar", ["-czf", updatedArchivePath, "-C", join(tempDir, "fixture-updated"), "package"], {
    encoding: "utf8"
  });
  assert.equal(updatedTarResult.status, 0, updatedTarResult.stderr);

  try {
    const cli = createOpenRuntimeCli();
    const addOutput = createOutput();
    const addExitCode = await cli.run([
      "extensions",
      "add",
      "@demo/command-hello"
    ], {
      stdout: addOutput.stdout,
      stderr: addOutput.stderr,
      extensionsDirectory,
      extensionPackageDownloader: {
        download: async () => archivePath
      }
    });
    assert.equal(addExitCode, 0);
    assert.equal(JSON.parse(addOutput.text()).package.name, "@demo/command-hello");

    const loaded = await createOpenRuntimeCliWithExternalExtensions({}, {
      ...process.env,
      OPENRUNTIME_EXTENSIONS_DIR: extensionsDirectory,
      OPENRUNTIME_DISABLE_EXTENSIONS: "0"
    });
    assert.deepEqual(loaded.cli.extensions.map((item) => item.name), ["hello-installed"]);
    assert.equal((globalThis as { __OPENRUNTIME_LAZY_EXTENSION_TEST__?: number }).__OPENRUNTIME_LAZY_EXTENSION_TEST__, undefined);
    const commandOutputBuffer = createOutput();
    assert.equal(await loaded.cli.run(["hello-installed"], {
      stdout: commandOutputBuffer.stdout,
      stderr: commandOutputBuffer.stderr
    }), 0);
    assert.deepEqual(JSON.parse(commandOutputBuffer.text()), commandOutput("hello-installed", {
      installed: true
    }));
    assert.equal((globalThis as { __OPENRUNTIME_LAZY_EXTENSION_TEST__?: number }).__OPENRUNTIME_LAZY_EXTENSION_TEST__, 1);

    const listOutput = createOutput();
    assert.equal(await cli.run(["extensions", "list"], {
      stdout: listOutput.stdout,
      stderr: listOutput.stderr,
      extensionsDirectory
    }), 0);
    assert.deepEqual(JSON.parse(listOutput.text()).packages[0].extensions, [{
      name: "hello-installed",
      commands: ["hello-installed"],
      hooks: []
    }]);

    const failedUpdateOutput = createOutput();
    assert.equal(await cli.run(["extensions", "update", "@demo/command-hello"], {
      stdout: failedUpdateOutput.stdout,
      stderr: failedUpdateOutput.stderr,
      extensionsDirectory,
      extensionPackageDownloader: {
        download: async (spec) => {
          assert.equal(spec, "@demo/command-hello@latest");
          throw new Error("simulated download failure");
        }
      }
    }), 1);
    const afterFailedUpdateOutput = createOutput();
    assert.equal(await cli.run(["extensions", "list"], {
      stdout: afterFailedUpdateOutput.stdout,
      stderr: afterFailedUpdateOutput.stderr,
      extensionsDirectory
    }), 0);
    assert.equal(JSON.parse(afterFailedUpdateOutput.text()).packages[0].version, "1.0.0");

    const updateOutput = createOutput();
    assert.equal(await cli.run(["extensions", "update", "@demo/command-hello"], {
      stdout: updateOutput.stdout,
      stderr: updateOutput.stderr,
      extensionsDirectory,
      extensionPackageDownloader: {
        download: async (spec) => {
          assert.equal(spec, "@demo/command-hello@latest");
          return updatedArchivePath;
        }
      }
    }), 0);
    assert.equal(JSON.parse(updateOutput.text()).package.version, "1.1.0");

    const updated = await createOpenRuntimeCliWithExternalExtensions({}, {
      ...process.env,
      OPENRUNTIME_EXTENSIONS_DIR: extensionsDirectory,
      OPENRUNTIME_DISABLE_EXTENSIONS: "0"
    });
    const updatedOutput = createOutput();
    assert.equal(await updated.cli.run(["hello-installed"], {
      stdout: updatedOutput.stdout,
      stderr: updatedOutput.stderr
    }), 0);
    assert.deepEqual(JSON.parse(updatedOutput.text()), commandOutput("hello-installed", {
      installed: true,
      updated: true
    }));

    const removeOutput = createOutput();
    assert.equal(await cli.run(["extensions", "remove", "@demo/command-hello"], {
      stdout: removeOutput.stdout,
      stderr: removeOutput.stderr,
      extensionsDirectory
    }), 0);
    assert.equal(JSON.parse(removeOutput.text()).status, "removed");
  } finally {
    delete (globalThis as { __OPENRUNTIME_LAZY_EXTENSION_TEST__?: number }).__OPENRUNTIME_LAZY_EXTENSION_TEST__;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("rejects npm extension packages that declare runtime dependencies", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-extension-package-dependency-test-"));
  const extensionsDirectory = join(tempDir, "extensions");
  const packageRoot = join(tempDir, "fixture", "package");
  const archivePath = join(tempDir, "dependent-command-1.0.0.tgz");
  mkdirSync(packageRoot, { recursive: true });
  writeFileSync(join(packageRoot, "package.json"), `${JSON.stringify({
    name: "@demo/command-dependent",
    version: "1.0.0",
    type: "module",
    dependencies: {
      "left-pad": "1.3.0"
    },
    openruntime: {
      schemaVersion: 1,
      extensions: ["./index.mjs"]
    }
  }, null, 2)}\n`, "utf8");
  writeFileSync(join(packageRoot, "index.mjs"), `export default {
  schemaVersion: 1,
  name: "dependent",
  commands: [{ name: "dependent", async run() { return 0; } }]
};\n`, "utf8");
  const tarResult = spawnSync("tar", ["-czf", archivePath, "-C", join(tempDir, "fixture"), "package"], {
    encoding: "utf8"
  });
  assert.equal(tarResult.status, 0, tarResult.stderr);

  try {
    const output = createOutput();
    const exitCode = await createOpenRuntimeCli().run([
      "extensions",
      "add",
      "@demo/command-dependent"
    ], {
      stdout: output.stdout,
      stderr: output.stderr,
      extensionsDirectory,
      extensionPackageDownloader: {
        download: async () => archivePath
      }
    });
    assert.equal(exitCode, 1);
    assert.match(output.text(), /must not declare dependencies/);
    assert.equal(output.errorText(), "");

    const listOutput = createOutput();
    assert.equal(await createOpenRuntimeCli().run(["extensions", "list"], {
      stdout: listOutput.stdout,
      stderr: listOutput.stderr,
      extensionsDirectory
    }), 0);
    assert.deepEqual(JSON.parse(listOutput.text()).packages, []);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("registers a command and merges its help entries", async () => {
  const extension = createCommandExtension({
    name: "demo",
    commandReferences: [
      {
        category: "Extensions",
        usage: "openruntime demo ping [--url <url>]",
        description: "Runs a demo command."
      }
    ],
    run: async (options) => {
      const { args, page, openruntime } = options;
      const snapshot = await openruntime.snapshot({ id: "target-1" });
      const browserValue = await openruntime.browser.eval("window.answer");
      return {
        command: args.command,
        hasOutputOption: "output" in options,
        hasStdoutOption: "stdout" in options,
        hasStderrOption: "stderr" in options,
        hasBridgeUrlOption: "bridgeUrl" in options,
        hasRuntimeSelectorOption: "runtimeSelector" in options,
        hasEnsureBridgeApi: "ensureBridge" in openruntime,
        hasScopeApi: "scope" in openruntime,
        hasRuntimesApi: "runtimes" in openruntime,
        hasSelectRuntimeApi: "selectRuntime" in openruntime,
        page,
        snapshot: snapshot.result,
        browserValue
      };
    }
  });
  const cli = createOpenRuntimeCli({ extensions: [extension] });

  assert.match(cli.createHelpText(), /openruntime demo - Runs a demo command\./);
  assert.doesNotMatch(cli.createHelpText(), /openruntime demo ping/);
  assert.deepEqual(cli.getCommandReferences().at(-1), extension.commands?.[0]?.commandReferences?.[0]);

  const helpOutput = createOutput();
  assert.equal(await cli.run(["demo", "--help"], {
    stdout: helpOutput.stdout,
    stderr: helpOutput.stderr
  }), 0);
  assert.match(helpOutput.text(), /openruntime demo ping \[--url <url>\] - Runs a demo command\./);
  assert.doesNotMatch(helpOutput.text(), /openruntime snapshot/);

  const context = createOpenContextFixture({
    bridgeUrl: "http://bridge.test",
    sessionId: "session-1",
    url: "http://app.test/"
  });
  try {
    const output = createOutput();
    const exitCode = await cli.run([
      "demo",
      "ping",
      "--bridge",
      "http://bridge.test",
      "--session",
      "session-1",
      "--url",
      "http://app.test/"
    ], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory: context.operationLogDirectory,
      fetcher: async (url) => {
        if (String(url).endsWith("/runtimes")) {
          return jsonResponse({
            runtimes: [
              {
                runtimeId: "runtime-1",
                url: "http://app.test/",
                sessionId: "session-1",
                status: "connected",
                connectedAt: 1,
                lastSeenAt: 2
              }
            ]
          });
        }
        assert.equal(String(url), "http://bridge.test/runtimes/runtime-1/snapshot?id=target-1");
        return jsonResponse({
          targets: {
            "target-1": {
              id: "target-1",
              type: "business.demo",
              status: "ready",
              updatedAt: 3
            }
          },
          latestEventId: 4,
          capturedAt: 5
        });
      },
      browserRunner: createBrowserRunner(async (args) => {
        assert.deepEqual(args, ["eval", "window.answer"]);
        return {
          exitCode: 0,
          stdout: "42\n",
          stderr: ""
        };
      })
    });

    assert.equal(exitCode, 0);
    assert.equal(output.errorText(), "");
    assert.deepEqual(JSON.parse(output.text()), commandOutput("demo ping", {
      command: ["demo", "ping"],
      hasOutputOption: false,
      hasStdoutOption: false,
      hasStderrOption: false,
      hasBridgeUrlOption: false,
      hasRuntimeSelectorOption: false,
      hasEnsureBridgeApi: false,
      hasScopeApi: false,
      hasRuntimesApi: false,
      hasSelectRuntimeApi: false,
      page: {
        url: "http://app.test/",
        openedUrl: "http://app.test/?openruntimeSessionId=session-1",
        normalizedUrl: "http://app.test/",
        bridgeUrl: "http://bridge.test",
        sessionId: "session-1",
        openedAt: 1
      },
      snapshot: {
        targets: {
          "target-1": {
            id: "target-1",
            type: "business.demo",
            status: "ready",
            updatedAt: 3
          }
        },
        latestEventId: 4,
        capturedAt: 5
      },
      browserValue: 42
    }));
  } finally {
    context.cleanup();
  }
});

test("formats errors thrown by extension commands", async () => {
  const extension = createCommandExtension({
    name: "failing-demo",
    run: async () => {
      throw Object.assign(new Error("Demo command failed."), {
        name: "CommandError",
        code: "DEMO_FAILED",
        kind: "runtime",
        retryable: false
      });
    }
  });
  const output = createOutput();

  const exitCode = await createOpenRuntimeCli({ extensions: [extension] }).run([
    "failing-demo"
  ], {
    stdout: output.stdout,
    stderr: output.stderr
  });

  assert.equal(exitCode, 1);
  assert.equal(output.errorText(), "");
  const result = JSON.parse(output.text());
  assert.equal(result.status, "error");
  assert.equal(result.error.code, "DEMO_FAILED");
  assert.equal(result.message, "Demo command failed.");
});

test("exposes memory capture commands to CLI extensions", async () => {
  const extension = createCommandExtension({
    name: "memory-demo",
    run: async ({ openruntime }) => {
      return {
        metrics: await openruntime.browser.memory.metrics(),
        status: await openruntime.browser.memory.status(),
        started: await openruntime.browser.memory.sampling.start({ samplingInterval: 1024 }),
        stopped: await openruntime.browser.memory.sampling.stop({
          path: "/tmp/openruntime.heapprofile",
          top: 10,
          maxSize: 4096
        }),
        snapshot: await openruntime.browser.memory.snapshot({
          path: "/tmp/openruntime.heapsnapshot",
          collectGarbage: false,
          timeout: 5000,
          maxSize: 8192
        }),
        garbageCollected: await openruntime.browser.memory.collectGarbage(),
        cancelled: await openruntime.browser.memory.cancel()
      };
    }
  });
  const cli = createOpenRuntimeCli({ extensions: [extension] });
  const context = createOpenContextFixture();
  const calls: string[][] = [];

  try {
    const output = createOutput();
    const exitCode = await cli.run(["memory-demo"], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory: context.operationLogDirectory,
      browserRunner: createBrowserRunner(async (args) => {
        calls.push(args);
        return {
          exitCode: 0,
          stdout: JSON.stringify({ name: args.slice(0, -1).join(" ") }),
          stderr: ""
        };
      })
    });

    assert.equal(exitCode, 0);
    assert.equal(output.errorText(), "");
    assert.deepEqual(calls, [
      ["memory", "collect-garbage", "--json"],
      ["memory", "metrics", "--json"],
      ["memory", "status", "--json"],
      ["memory", "sampling", "start", "--sampling-interval", "1024", "--json"],
      ["memory", "sampling", "stop", "/tmp/openruntime.heapprofile", "--top", "10", "--max-size", "4096", "--json"],
      ["memory", "snapshot", "/tmp/openruntime.heapsnapshot", "--no-gc", "--timeout", "5000", "--max-size", "8192", "--json"],
      ["memory", "collect-garbage", "--json"],
      ["memory", "cancel", "--json"]
    ]);
    assert.deepEqual(JSON.parse(output.text()), commandOutput("memory-demo", {
      metrics: { name: "memory metrics" },
      status: { name: "memory status" },
      started: { name: "memory sampling start --sampling-interval 1024" },
      stopped: { name: "memory sampling stop /tmp/openruntime.heapprofile --top 10 --max-size 4096" },
      snapshot: { name: "memory snapshot /tmp/openruntime.heapsnapshot --no-gc --timeout 5000 --max-size 8192" },
      garbageCollected: { name: "memory collect-garbage" },
      cancelled: { name: "memory cancel" }
    }));
  } finally {
    context.cleanup();
  }
});

test("exposes coverage commands to CLI extensions", async () => {
  const extension = createCommandExtension({
    name: "coverage-demo",
    run: async ({ openruntime }) => {
      return {
        status: await openruntime.browser.coverage.status(),
        started: await openruntime.browser.coverage.start({ callCount: true }),
        taken: await openruntime.browser.coverage.take({
          path: "/tmp/first.coverage.json",
          label: "first-screen",
          maxSize: 4096
        }),
        stopped: await openruntime.browser.coverage.stop({
          path: "/tmp/orders.coverage.json",
          label: "orders"
        }),
        cancelled: await openruntime.browser.coverage.cancel()
      };
    }
  });
  const cli = createOpenRuntimeCli({ extensions: [extension] });
  const context = createOpenContextFixture();
  const calls: string[][] = [];

  try {
    const output = createOutput();
    const exitCode = await cli.run(["coverage-demo"], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory: context.operationLogDirectory,
      browserRunner: createBrowserRunner(async (args) => {
        calls.push(args);
        return {
          exitCode: 0,
          stdout: JSON.stringify({ name: args.slice(0, -1).join(" ") }),
          stderr: ""
        };
      })
    });

    assert.equal(exitCode, 0);
    assert.equal(output.errorText(), "");
    assert.deepEqual(calls, [
      ["coverage", "status", "--json"],
      ["coverage", "start", "--call-count", "--json"],
      ["coverage", "take", "/tmp/first.coverage.json", "--label", "first-screen", "--max-size", "4096", "--json"],
      ["coverage", "stop", "/tmp/orders.coverage.json", "--label", "orders", "--json"],
      ["coverage", "cancel", "--json"]
    ]);
    assert.deepEqual(JSON.parse(output.text()), commandOutput("coverage-demo", {
      status: { name: "coverage status" },
      started: { name: "coverage start --call-count" },
      taken: { name: "coverage take /tmp/first.coverage.json --label first-screen --max-size 4096" },
      stopped: { name: "coverage stop /tmp/orders.coverage.json --label orders" },
      cancelled: { name: "coverage cancel" }
    }));
  } finally {
    context.cleanup();
  }
});

test("shows and resolves command skills without running commands", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-extension-skill-"));
  const skillPath = join(tempDir, "SKILL.md");
  writeFileSync(skillPath, "# Demo skill\n", "utf8");
  let runCount = 0;

  try {
    const cli = createOpenRuntimeCli({
      extensions: [
        createCommandExtension({
          name: "demo",
          skill: { path: skillPath },
          commandReferences: [
            {
              category: "Extensions",
              usage: "openruntime demo ping",
              description: "Runs demo."
            }
          ],
          run: async () => {
            runCount += 1;
            return 0;
          }
        }),
        createCommandExtension({
          name: "plain",
          commandReferences: [
            {
              category: "Extensions",
              usage: "openruntime plain ping",
              description: "Runs without a skill."
            }
          ],
          run: async () => {
            runCount += 1;
            return 0;
          }
        })
      ]
    });

    const help = cli.createHelpText();
    assert.match(help, /openruntime demo - Runs demo\./);
    assert.match(help, /openruntime plain - Runs without a skill\./);
    assert.doesNotMatch(help, /openruntime demo ping/);
    assert.doesNotMatch(help, /openruntime plain ping/);
    assert.match(help, /Skill: available for demo\./);
    assert.match(help, /Skill usage: `openruntime <command> --skill`/);
    assert.doesNotMatch(help, /Examples:/);

    const commandHelpOutput = createOutput();
    assert.equal(await cli.run(["demo", "--help"], {
      stdout: commandHelpOutput.stdout,
      stderr: commandHelpOutput.stderr
    }), 0);
    assert.match(commandHelpOutput.text(), /openruntime demo ping - Runs demo\./);
    assert.match(commandHelpOutput.text(), /Skill: available via `openruntime demo --skill`\./);
    assert.doesNotMatch(commandHelpOutput.text(), /openruntime plain/);
    assert.equal(runCount, 0);

    const skillOutput = createOutput();
    const skillExitCode = await cli.run(["demo", "--skill"], {
      stdout: skillOutput.stdout,
      stderr: skillOutput.stderr
    });
    assert.equal(skillExitCode, 0);
    assert.equal(skillOutput.text(), `${skillPath}\n`);
    assert.equal(skillOutput.errorText(), "");
    assert.equal(runCount, 0);

    const unavailableOutput = createOutput();
    const unavailableExitCode = await cli.run(["plain", "--skill"], {
      stdout: unavailableOutput.stdout,
      stderr: unavailableOutput.stderr
    });
    assert.equal(unavailableExitCode, 1);
    assert.equal(JSON.parse(unavailableOutput.text()).error.code, "CLI_COMMAND_SKILL_UNAVAILABLE");
    assert.equal(runCount, 0);

    const invalidUsageOutput = createOutput();
    const invalidUsageExitCode = await cli.run(["demo", "ping", "--skill"], {
      stdout: invalidUsageOutput.stdout,
      stderr: invalidUsageOutput.stderr
    });
    assert.equal(invalidUsageExitCode, 1);
    assert.equal(JSON.parse(invalidUsageOutput.text()).error.code, "CLI_COMMAND_SKILL_USAGE_INVALID");
    assert.equal(runCount, 0);
  } finally {
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});

test("commands can wait for targets in the opened page context", async () => {
  const extension = createCommandExtension({
    name: "demo",
    commandReferences: [
      {
        category: "Extensions",
        usage: "openruntime demo wait",
        description: "Waits for a demo target."
      }
    ],
    run: async ({ openruntime }) => {
      const result = await openruntime.waitFor("business:demo", "ready", {
        timeout: 250
      });
      return {
        result
      };
    }
  });
  const cli = createOpenRuntimeCli({ extensions: [extension] });
  const context = createOpenContextFixture({
    bridgeUrl: "http://bridge.test",
    sessionId: "session-1",
    url: "http://app.test/"
  });
  const calls: Array<{ url: string; method?: string; body?: unknown }> = [];

  try {
    const output = createOutput();
    const exitCode = await cli.run(["demo", "wait"], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory: context.operationLogDirectory,
      fetcher: async (url, init) => {
        const call: { url: string; method?: string; body?: unknown } = {
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
                runtimeId: "runtime-1",
                url: "http://app.test/?openruntimeSessionId=session-1",
                sessionId: "session-1",
                status: "connected",
                connectedAt: 1,
                lastSeenAt: 2
              }
            ]
          });
        }

        assert.equal(String(url), "http://bridge.test/runtimes/runtime-1/wait-for");
        return jsonResponse({
          success: true,
          condition: {
            id: "business:demo",
            status: "ready"
          },
          snapshot: {
            targets: {},
            latestEventId: 0,
            capturedAt: 3
          }
        });
      }
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(calls, [
      {
        url: "http://bridge.test/runtimes"
      },
      {
        url: "http://bridge.test/runtimes/runtime-1/wait-for",
        method: "POST",
        body: {
          targetId: "business:demo",
          status: "ready",
          timeout: 250
        }
      }
    ]);
    assert.deepEqual(JSON.parse(output.text()), commandOutput("demo wait", {
      result: {
        runtime: {
          runtimeId: "runtime-1",
          url: "http://app.test/?openruntimeSessionId=session-1",
          sessionId: "session-1",
          status: "connected",
          connectedAt: 1,
          lastSeenAt: 2
        },
        result: {
          success: true,
          condition: {
            id: "business:demo",
            status: "ready"
          },
          snapshot: {
            targets: {},
            latestEventId: 0,
            capturedAt: 3
          }
        }
      }
    }));
  } finally {
    context.cleanup();
  }
});

test("loads external extensions from the configured directory", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-external-extensions-"));
  const context = createOpenContextFixture();
  const skillPath = join(tempDir, "SKILL.md");
  try {
    writeFileSync(skillPath, "# Foo skill\n", "utf8");
    writeFileSync(join(tempDir, "foo.mjs"), [
      "export default {",
      "  schemaVersion: 1,",
      "  name: 'foo',",
      "  displayName: 'Foo',",
      "  description: 'Foo extension',",
      "  commands: [{",
      "  name: 'foo',",
      `  skill: { path: ${JSON.stringify(skillPath)} },`,
      "  commandReferences: [{",
      "    category: 'Extensions',",
      "    usage: 'openruntime foo ping',",
      "    description: 'Runs Foo.'",
      "  }],",
      "  exampleReferences: [{",
      "    command: 'openruntime foo ping',",
      "    description: 'Runs Foo example.'",
      "  }],",
      "  async run({ args, openruntime }) {",
      "    const value = await openruntime.browser.eval('window.foo');",
      "    return { command: args.command, value };",
      "  }",
      "  }],",
      "};",
      ""
    ].join("\n"));

    const loaded = await createOpenRuntimeCliWithExternalExtensions({}, {
      ...process.env,
      OPENRUNTIME_DISABLE_EXTENSIONS: "0",
      OPENRUNTIME_EXTENSIONS_DIR: tempDir
    });

    assert.deepEqual(loaded.extensionLoadRecords.map((record) => ({
      name: record.name,
      source: record.source,
      status: record.status
    })), [
      {
        name: "foo",
        source: "external",
        status: "loaded"
      }
    ]);
    assert.match(loaded.cli.createHelpText(), /External Extensions/);
    assert.match(loaded.cli.createHelpText(), /openruntime foo - Runs Foo\./);
    assert.doesNotMatch(loaded.cli.createHelpText(), /openruntime foo ping/);
    assert.doesNotMatch(loaded.cli.createHelpText(), /\[external: foo\]/);
    assert.match(loaded.cli.createHelpText(), /Runs Foo\./);
    assert.doesNotMatch(loaded.cli.createHelpText(), /Runs Foo example\./);
    assert.match(loaded.cli.createHelpText(), /Skill: available for foo\./);
    assert.match(loaded.cli.createHelpText(), /Skill usage: `openruntime <command> --skill`/);

    const output = createOutput();
    const exitCode = await loaded.cli.run(["foo", "ping"], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory: context.operationLogDirectory,
      browserRunner: createBrowserRunner(async (args) => {
        assert.deepEqual(args, ["eval", "window.foo"]);
        return {
          exitCode: 0,
          stdout: JSON.stringify({ ok: true }),
          stderr: ""
        };
      })
    });

    assert.equal(exitCode, 0);
    assert.equal(output.errorText(), "");
    assert.deepEqual(JSON.parse(output.text()), commandOutput("foo ping", {
      command: ["foo", "ping"],
      value: {
        ok: true
      }
    }));

    const skillOutput = createOutput();
    const skillExitCode = await loaded.cli.run(["foo", "--skill"], {
      stdout: skillOutput.stdout,
      stderr: skillOutput.stderr
    });
    assert.equal(skillExitCode, 0);
    assert.equal(skillOutput.text(), `${skillPath}\n`);
    assert.equal(skillOutput.errorText(), "");

    const helpOutput = createOutput();
    const helpExitCode = await loaded.cli.run(["--help"], {
      stdout: helpOutput.stdout,
      stderr: helpOutput.stderr
    });

    assert.equal(helpExitCode, 0);
    assert.equal(helpOutput.errorText(), "");
    assert.match(helpOutput.text(), /External Extensions:/);
    assert.match(helpOutput.text(), /openruntime foo - Runs Foo\./);
    assert.doesNotMatch(helpOutput.text(), /openruntime foo ping/);
    assert.match(helpOutput.text(), /Skill: available for foo\./);
    assert.doesNotMatch(helpOutput.text(), /Examples:/);

    const commandHelpOutput = createOutput();
    const commandHelpExitCode = await loaded.cli.run(["foo", "--help"], {
      stdout: commandHelpOutput.stdout,
      stderr: commandHelpOutput.stderr
    });
    assert.equal(commandHelpExitCode, 0);
    assert.equal(commandHelpOutput.errorText(), "");
    assert.match(commandHelpOutput.text(), /openruntime foo ping - Runs Foo\./);
    assert.match(commandHelpOutput.text(), /Skill: available via `openruntime foo --skill`\./);
    assert.doesNotMatch(commandHelpOutput.text(), /openruntime extensions/);
  } finally {
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
    context.cleanup();
  }
});

test("skips conflicting or invalid external extensions without crashing", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-external-extensions-conflict-"));
  try {
    writeFileSync(join(tempDir, "snapshot.mjs"), [
      "export default {",
      "  schemaVersion: 1,",
      "  name: 'snapshot-extension',",
      "  commands: [{ name: 'snapshot', async run() { return 0; } }],",
      "};",
      ""
    ].join("\n"));
    writeFileSync(join(tempDir, "broken.mjs"), "export default { schemaVersion: 1, name: 'broken' };\n");

    const loaded = await createOpenRuntimeCliWithExternalExtensions({}, {
      ...process.env,
      OPENRUNTIME_DISABLE_EXTENSIONS: "0",
      OPENRUNTIME_EXTENSIONS_DIR: tempDir
    });

    assert.equal(loaded.cli.extensions.length, 0);
    assert.deepEqual(loaded.extensionLoadRecords.map((record) => ({
      name: record.name,
      source: record.source,
      status: record.status
    })).sort((left, right) => left.name.localeCompare(right.name)), [
      {
        name: "broken",
        source: "external",
        status: "failed"
      },
      {
        name: "snapshot-extension",
        source: "external",
        status: "skipped"
      }
    ]);
  } finally {
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});

test("honors disabled external extensions", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-external-extensions-disabled-"));
  try {
    writeFileSync(join(tempDir, "foo.mjs"), [
      "export default {",
      "  schemaVersion: 1,",
      "  name: 'foo',",
      "  hooks: { async detectStack() {} },",
      "};",
      ""
    ].join("\n"));

    const loaded = await createOpenRuntimeCliWithExternalExtensions({}, {
      ...process.env,
      OPENRUNTIME_DISABLE_EXTENSIONS: "1",
      OPENRUNTIME_EXTENSIONS_DIR: tempDir
    });

    assert.equal(loaded.cli.extensions.length, 0);
    assert.deepEqual(loaded.extensionLoadRecords, []);
  } finally {
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});

test("warns when runCli skips an external extension", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-external-extensions-warning-"));
  try {
    writeFileSync(join(tempDir, "snapshot.mjs"), [
      "export default {",
      "  schemaVersion: 1,",
      "  name: 'snapshot-extension',",
      "  commands: [{ name: 'snapshot', async run() { return 0; } }],",
      "};",
      ""
    ].join("\n"));

    const result = spawnSync(process.execPath, [join(process.cwd(), "dist", "index.js"), "--help"], {
      encoding: "utf8",
      env: {
        ...process.env,
        OPENRUNTIME_DISABLE_EXTENSIONS: "0",
        OPENRUNTIME_EXTENSIONS_DIR: tempDir
      }
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /Skipped external OpenRuntime extension/);
    assert.match(result.stderr, /conflicts with an existing command/);
  } finally {
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});

test("rejects commands that conflict with built-in commands", () => {
  assert.throws(
    () => createOpenRuntimeCli({
      extensions: [
        createCommandExtension({
          name: "snapshot",
          run: async () => 0
        })
      ]
    }),
    /conflicts with a built-in command/
  );
});

test("rejects duplicate command names", () => {
  assert.throws(
    () => createOpenRuntimeCli({
      extensions: [
        createCommandExtension({
          name: "demo",
          run: async () => 0
        }, "one"),
        createCommandExtension({
          name: "demo",
          run: async () => 0
        }, "two")
      ]
    }),
    /registered more than once/
  );
});
