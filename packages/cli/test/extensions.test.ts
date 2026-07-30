import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "@rstest/core";

import {
  createDivebellCliWithExternalExtensions,
  createDivebellCli,
  runCli,
  type DivebellBrowserCommandName,
  type DivebellBrowserCommandRequest,
  type DivebellExtensionCommand,
  type DivebellExtensionDefinition
} from "../dist/index.js";
import { BROWSER_COMMAND_NAMES } from "../dist/commands/names.js";
import {
  runDetectStackHooks,
  runOpenHooks
} from "../dist/features/extension/hooks.js";

import { commandOutput, createBrowserRunner, createOpenContextFixture, createOutput, errorOutput, jsonResponse } from "./helpers.js";

function createCommandExtension(
  command: DivebellExtensionCommand,
  extensionName = command.name
): DivebellExtensionDefinition {
  return {
    schemaVersion: 1,
    name: extensionName,
    commands: [command]
  };
}

test("runs open, detectStack, and close hooks only at their matching lifecycle points", async () => {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-extension-hooks-"));
  const calls: string[] = [];
  let closeCount = 0;
  const cli = createDivebellCli({
    extensions: [{
      schemaVersion: 1,
      name: "modern-detector",
      commands: [{
        name: "modern",
        async run() {
          return { detected: true };
        }
      }],
      hooks: {
        open: async () => {
          calls.push("open");
          return { scripts: ["globalThis.__DIVEBELL_HOOK_TEST__ = true;"] };
        },
        detectStack: async ({ divebell }) => {
          calls.push("detectStack");
          const detected = await divebell.browser.eval<boolean>("globalThis._MODERNJS_ROUTE_MANIFEST != null");
          return detected ? {
            id: "modernjs",
            name: "Modern.js",
            evidence: ["window._MODERNJS_ROUTE_MANIFEST"],
            command: "modern"
          } : undefined;
        },
        close: async () => {
          calls.push("close");
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
      assert.match(readFileSync(scriptPath as string, "utf8"), /__DIVEBELL_HOOK_TEST__/);
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
    assert.equal(stackResult.data.detections[0].command, "modern");
    assert.equal(stackResult.data.cached, false);
    assert.deepEqual(calls, ["open", "detectStack"]);

    const cachedOutput = createOutput();
    assert.equal(await cli.run(["stack"], {
      stdout: cachedOutput.stdout,
      stderr: cachedOutput.stderr,
      operationLogDirectory,
      browserRunner
    }), 0);
    const cachedResult = JSON.parse(cachedOutput.text());
    assert.equal(cachedResult.data.cached, true);
    assert.equal(cachedResult.data.detections[0].command, "modern");
    assert.deepEqual(calls, ["open", "detectStack"]);

    const closeOutput = createOutput();
    assert.equal(await cli.run(["stop"], {
      stdout: closeOutput.stdout,
      stderr: closeOutput.stderr,
      operationLogDirectory,
      browserRunner
    }), 0);
    assert.equal(closeCount, 1);
    assert.deepEqual(calls, ["open", "detectStack", "close"]);
    assert.deepEqual(browserCalls.map((args) => args[0]), ["open", "eval", "eval", "eval", "close"]);
  } finally {
    rmSync(operationLogDirectory, { recursive: true, force: true });
  }
});

test("opens companion pages, waits for readiness, and returns to the requested page", async () => {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-extension-companion-"));
  const browserCalls: string[][] = [];
  let receivedBridgeUrl: string | null | undefined;
  const cli = createDivebellCli({
    extensions: [{
      schemaVersion: 1,
      name: "companion-test",
      hooks: {
        open: async (options) => {
          receivedBridgeUrl = options.bridgeUrl;
          return {
            companionPages: [{
              url: "http://localhost:17321/companion",
              label: "companion",
              waitFor: {
                script: "globalThis.companionReady === true",
                timeout: 1000
              }
            }]
          };
        }
      }
    }]
  });
  const browserRunner = createBrowserRunner(async (args) => {
    browserCalls.push(args);
    if (args[0] === "open") return { exitCode: 0, stdout: "", stderr: "" };
    if (args[0] === "tab" && args[1] === "--json") {
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          tabs: [{ tabId: "t1", url: "http://app.test/", active: true }]
        }),
        stderr: ""
      };
    }
    if (args[0] === "tab" && args[1] === "new") {
      return {
        exitCode: 0,
        stdout: JSON.stringify({ tabId: "t2" }),
        stderr: ""
      };
    }
    if (args[0] === "eval") {
      return { exitCode: 0, stdout: "true", stderr: "" };
    }
    if (args[0] === "tab" && args[1] === "t1") {
      return { exitCode: 0, stdout: JSON.stringify({ tabId: "t1" }), stderr: "" };
    }
    throw new Error(`Unexpected browser command: ${args.join(" ")}`);
  });

  try {
    const output = createOutput();
    assert.equal(await cli.run([
      "open",
      "http://app.test/",
      "--no-bridge",
      "--session",
      "companion-test"
    ], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory,
      browserRunner
    }), 0);
    assert.equal(output.errorText(), "");
    assert.equal(receivedBridgeUrl, null);
    assert.deepEqual(browserCalls, [
      ["open", "http://app.test/?divebellSessionId=companion-test"],
      ["tab", "--json"],
      ["tab", "new", "--label", "companion", "http://localhost:17321/companion"],
      ["eval", "Boolean((globalThis.companionReady === true))"],
      ["tab", "t1"]
    ]);
  } finally {
    rmSync(operationLogDirectory, { recursive: true, force: true });
  }
});

test("rejects a stack command not provided by the detecting Extension", async () => {
  const result = await runDetectStackHooks([{
    schemaVersion: 1,
    name: "broken-detector",
    commands: [{
      name: "available",
      async run() {
        return {};
      }
    }],
    hooks: {
      async detectStack() {
        return {
          id: "broken",
          name: "Broken",
          command: "missing"
        };
      }
    }
  }], {} as never);

  assert.deepEqual(result.detections, []);
  assert.equal(result.failures.length, 1);
  assert.match(
    result.failures[0]?.message ?? "",
    /command "missing" is not provided by Extension "broken-detector"/
  );
});

test("rejects the removed recommendedExtensions stack field", async () => {
  const result = await runDetectStackHooks([{
    schemaVersion: 1,
    name: "legacy-detector",
    hooks: {
      async detectStack() {
        return {
          id: "legacy",
          name: "Legacy",
          recommendedExtensions: ["legacy-tools"]
        } as never;
      }
    }
  }], {} as never);

  assert.deepEqual(result.detections, []);
  assert.equal(result.failures.length, 1);
  assert.match(
    result.failures[0]?.message ?? "",
    /recommendedExtensions is no longer supported; return command instead/
  );
});

test("returns the opened page headers unchanged to extension commands", async () => {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-extension-command-headers-"));
  const headers = JSON.stringify({
    Authorization: "Bearer secret-token",
    "Get-Svc": "1"
  });
  const cli = createDivebellCli({
    extensions: [{
      schemaVersion: 1,
      name: "goofy",
      commands: [{
        name: "goofy",
        async run({ headers: openedHeaders }) {
          return { headers: openedHeaders };
        }
      }],
      hooks: {
        async detectStack() {
          return undefined;
        }
      }
    }]
  });
  const browserRunner = createBrowserRunner(async (args) => ({
    exitCode: 0,
    stdout: args[0] === "eval" ? JSON.stringify("http://app.test/") : "",
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
    const persisted = JSON.parse(readFileSync(
      join(operationLogDirectory, files[0] as string),
      "utf8"
    ));
    assert.deepEqual(persisted.headers, {
      Authorization: "Bearer secret-token",
      "Get-Svc": "1"
    });

    assert.equal(await cli.run(["stack"], {
      stdout: createOutput().stdout,
      stderr: createOutput().stderr,
      operationLogDirectory,
      browserRunner
    }), 0);

    const goofyOutput = createOutput();
    assert.equal(await cli.run(["goofy", "status"], {
      stdout: goofyOutput.stdout,
      stderr: goofyOutput.stderr,
      operationLogDirectory,
      browserRunner
    }), 0);
    assert.deepEqual(JSON.parse(goofyOutput.text()), commandOutput("goofy status", {
      headers: {
        Authorization: "Bearer secret-token",
        "Get-Svc": "1"
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

test("provides the effective request headers to open hooks", async () => {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-extension-headers-"));
  const browserCalls: string[][] = [];
  let receivedHeaders: Readonly<Record<string, string>> | undefined;
  const headers = JSON.stringify({
    Authorization: "Bearer secret-token",
    "X-Debug-User": "agent"
  });
  const cli = createDivebellCli({
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
      "http://app.test/?divebellSessionId=session-headers",
      "--headers",
      headers
    ]]);
    assert.doesNotMatch(output.text(), /secret-token/);
  } finally {
    rmSync(operationLogDirectory, { recursive: true, force: true });
  }
});

test("runs the previous page close hook before opening its replacement", async () => {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-extension-reopen-hooks-"));
  const calls: string[] = [];
  const cli = createDivebellCli({
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
  const tempDir = mkdtempSync(join(tmpdir(), "divebell-extension-package-test-"));
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
    divebell: {
      schemaVersion: 1,
      extensions: ["./index.mjs"]
    }
  }, null, 2)}\n`, "utf8");
  writeFileSync(join(packageRoot, "index.mjs"), `export default {
  schemaVersion: 1,
  name: "hello-installed",
  commands: [{
    name: "hello-installed",
    commandReferences: [{ category: "Extensions", usage: "divebell hello-installed", description: "Runs installed command." }],
    async run(options) { return await (await import("./run.mjs")).run(options); }
  }]
};\n`, "utf8");
  writeFileSync(join(packageRoot, "run.mjs"), `
globalThis.__DIVEBELL_LAZY_EXTENSION_TEST__ = (globalThis.__DIVEBELL_LAZY_EXTENSION_TEST__ ?? 0) + 1;
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
    divebell: {
      schemaVersion: 1,
      extensions: ["./index.mjs"]
    }
  }, null, 2)}\n`, "utf8");
  writeFileSync(join(updatedPackageRoot, "index.mjs"), `export default {
  schemaVersion: 1,
  name: "hello-installed",
  commands: [{
    name: "hello-installed",
    commandReferences: [{ category: "Extensions", usage: "divebell hello-installed", description: "Runs updated command." }],
    async run() { return { installed: true, updated: true }; }
  }]
};\n`, "utf8");
  const updatedTarResult = spawnSync("tar", ["-czf", updatedArchivePath, "-C", join(tempDir, "fixture-updated"), "package"], {
    encoding: "utf8"
  });
  assert.equal(updatedTarResult.status, 0, updatedTarResult.stderr);

  try {
    const cli = createDivebellCli();
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

    const loaded = await createDivebellCliWithExternalExtensions({}, {
      ...process.env,
      DIVEBELL_EXTENSIONS_DIR: extensionsDirectory,
      DIVEBELL_DISABLE_EXTENSIONS: "0"
    });
    assert.deepEqual(loaded.cli.extensions.map((item) => item.name), ["hello-installed"]);
    assert.equal((globalThis as { __DIVEBELL_LAZY_EXTENSION_TEST__?: number }).__DIVEBELL_LAZY_EXTENSION_TEST__, undefined);
    const commandOutputBuffer = createOutput();
    assert.equal(await loaded.cli.run(["hello-installed"], {
      stdout: commandOutputBuffer.stdout,
      stderr: commandOutputBuffer.stderr
    }), 0);
    assert.deepEqual(JSON.parse(commandOutputBuffer.text()), commandOutput("hello-installed", {
      installed: true
    }));
    assert.equal((globalThis as { __DIVEBELL_LAZY_EXTENSION_TEST__?: number }).__DIVEBELL_LAZY_EXTENSION_TEST__, 1);

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

    const updated = await createDivebellCliWithExternalExtensions({}, {
      ...process.env,
      DIVEBELL_EXTENSIONS_DIR: extensionsDirectory,
      DIVEBELL_DISABLE_EXTENSIONS: "0"
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
    delete (globalThis as { __DIVEBELL_LAZY_EXTENSION_TEST__?: number }).__DIVEBELL_LAZY_EXTENSION_TEST__;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("rejects npm extension packages that declare runtime dependencies", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "divebell-extension-package-dependency-test-"));
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
    divebell: {
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
    const exitCode = await createDivebellCli().run([
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
    assert.equal(await createDivebellCli().run(["extensions", "list"], {
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
        usage: "divebell demo ping [--url <url>]",
        description: "Runs a demo command."
      }
    ],
    run: async (options) => {
      const { args, page, divebell, withLoading } = options;
      const snapshot = await withLoading(async () =>
        await divebell.snapshot({ id: "target-1" })
      );
      const browserValue = await divebell.browser.eval("window.answer");
      return {
        command: args.command,
        hasWithLoadingOption: typeof withLoading === "function",
        hasOutputOption: "output" in options,
        hasStdoutOption: "stdout" in options,
        hasStderrOption: "stderr" in options,
        hasBridgeUrlOption: "bridgeUrl" in options,
        hasRuntimeSelectorOption: "runtimeSelector" in options,
        hasEnsureBridgeApi: "ensureBridge" in divebell,
        hasScopeApi: "scope" in divebell,
        hasRuntimesApi: "runtimes" in divebell,
        hasSelectRuntimeApi: "selectRuntime" in divebell,
        page,
        snapshot: snapshot.result,
        browserValue
      };
    }
  });
  const cli = createDivebellCli({ extensions: [extension] });

  assert.match(cli.createHelpText(), /divebell demo - Runs a demo command\./);
  assert.doesNotMatch(cli.createHelpText(), /divebell demo ping/);
  assert.deepEqual(cli.getCommandReferences().at(-1), extension.commands?.[0]?.commandReferences?.[0]);

  const helpOutput = createOutput();
  assert.equal(await cli.run(["demo", "--help"], {
    stdout: helpOutput.stdout,
    stderr: helpOutput.stderr
  }), 0);
  assert.match(helpOutput.text(), /divebell demo ping \[--url <url>\] - Runs a demo command\./);
  assert.doesNotMatch(helpOutput.text(), /divebell snapshot/);

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
      hasWithLoadingOption: true,
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
        openedUrl: "http://app.test/?divebellSessionId=session-1",
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

test("exposes every browser page command through the Extension API", async () => {
  const pageCommands = BROWSER_COMMAND_NAMES.filter(
    (command): command is DivebellBrowserCommandName => command !== "open"
  );
  const requests: Partial<Record<DivebellBrowserCommandName, DivebellBrowserCommandRequest>> = {
    goto: { args: ["http://app.test/orders?region=cn#details"] },
    navigate: { args: ["http://app.test/customers"] },
    click: { args: ["e1"] },
    fill: { args: ["e2", "hello"] },
    focus: { args: ["e3"] },
    press: { args: ["Control+a"] },
    select: { args: ["e4", "cn", "sg"] },
    eval: { args: ["document.title"] },
    "wait-eval": { args: ["document.readyState === 'complete'"], options: { timeout: 100 } },
    "get-window": { args: ["location.href"] },
    screenshot: { args: ["page.png"], options: { "full-page": true } },
    coverage: { args: ["status"] },
    hover: { args: ["e8"] },
    "check-element": { args: ["e9"] },
    drag: { args: ["e10", "e11"] },
    tab: {
      args: ["new", "http://docs.test/"],
      options: { label: "docs", json: true }
    },
    video: { args: ["start", "flow.webm"] }
  };
  const extension = createCommandExtension({
    name: "browser-api-demo",
    run: async ({ divebell }) => {
      const outputs: string[] = [];
      for (const command of pageCommands) {
        outputs.push(await divebell.browser.run(command, requests[command]));
      }
      await divebell.browser.select("e20", ["cn", "sg"]);
      return {
        commands: pageCommands,
        outputCount: outputs.length
      };
    }
  });
  const cli = createDivebellCli({ extensions: [extension] });
  const context = createOpenContextFixture({ sessionId: "session-extension" });
  const calls: string[][] = [];

  try {
    const output = createOutput();
    const exitCode = await cli.run(["browser-api-demo"], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory: context.operationLogDirectory,
      browserRunner: createBrowserRunner(async (args) => {
        calls.push(args);
        return {
          exitCode: 0,
          stdout: args[0] === "eval" && args[1]?.includes("document.readyState")
            ? "true\n"
            : "ok\n",
          stderr: ""
        };
      })
    });

    assert.equal(exitCode, 0);
    assert.equal(output.errorText(), "");
    assert.deepEqual(JSON.parse(output.text()), commandOutput("browser-api-demo", {
      commands: pageCommands,
      outputCount: pageCommands.length
    }));
    assert.equal(calls.length, pageCommands.length + 1);
    assert.deepEqual(calls[pageCommands.indexOf("goto")], [
      "goto",
      "http://app.test/orders?region=cn&divebellSessionId=session-extension#details"
    ]);
    assert.deepEqual(calls[pageCommands.indexOf("navigate")], [
      "goto",
      "http://app.test/customers?divebellSessionId=session-extension"
    ]);
    assert.deepEqual(calls[pageCommands.indexOf("page-snapshot")], ["snapshot"]);
    assert.deepEqual(calls[pageCommands.indexOf("hover")], ["hover", "@e8"]);
    assert.deepEqual(calls[pageCommands.indexOf("check-element")], ["check", "@e9"]);
    assert.deepEqual(calls[pageCommands.indexOf("drag")], ["drag", "@e10", "@e11"]);
    assert.deepEqual(calls[pageCommands.indexOf("select")], ["select", "@e4", "cn", "sg"]);
    assert.deepEqual(calls[pageCommands.indexOf("screenshot")], ["screenshot", "--full", "page.png"]);
    assert.deepEqual(calls[pageCommands.indexOf("tab")], [
      "tab",
      "new",
      "http://docs.test/",
      "--label",
      "docs",
      "--json"
    ]);
    assert.deepEqual(calls[pageCommands.indexOf("video")], ["record", "start", "flow.webm"]);
    assert.deepEqual(calls[pageCommands.indexOf("coverage")], ["coverage", "status", "--json"]);
    assert.deepEqual(calls.at(-1), ["select", "@e20", "cn", "sg"]);
  } finally {
    context.cleanup();
  }
});

test("keeps browser lifecycle commands outside the Extension page API", async () => {
  const extension = createCommandExtension({
    name: "browser-lifecycle-demo",
    run: async ({ divebell }) =>
      await divebell.browser.run(
        "open" as DivebellBrowserCommandName,
        { args: ["http://app.test/"] }
      )
  });
  const output = createOutput();

  const exitCode = await createDivebellCli({ extensions: [extension] }).run([
    "browser-lifecycle-demo"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    browserRunner: createBrowserRunner(async () => {
      throw new Error("The browser runner must not receive lifecycle commands.");
    })
  });

  assert.equal(exitCode, 1);
  assert.equal(output.errorText(), "");
  assert.deepEqual(JSON.parse(output.text()), errorOutput("browser-lifecycle-demo", {
    code: "INVALID_BROWSER_COMMAND",
    kind: "validation",
    message: "Browser command \"open\" is not available through the Extension page API.",
    retryable: false,
    hint: "Use a browser page command listed by `divebell --help`; open and stop remain owned by the outer workflow."
  }));
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

  const exitCode = await createDivebellCli({ extensions: [extension] }).run([
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

test("lets a command call declared Extension commands with shared page context", async () => {
  const calls: unknown[] = [];
  const target: DivebellExtensionDefinition = {
    schemaVersion: 1,
    name: "shared-tools",
    commands: [{
      name: "shared-lookup",
      run: async ({ args, page, runExtension }) => {
        calls.push({
          command: args.command,
          format: args.options.get("format"),
          tags: args.options.get("tag"),
          bridge: args.options.get("bridge"),
          session: args.options.get("session"),
          url: args.options.get("url"),
          page,
          hasRunExtension: typeof runExtension === "function"
        });
        return { value: args.command[1] };
      }
    }]
  };
  const caller: DivebellExtensionDefinition = {
    schemaVersion: 1,
    name: "workflow",
    requires: ["shared-tools"],
    commands: [{
      name: "inspect-shared",
      run: async ({ args, page, runExtension }) => {
        const first = await runExtension<{ value: string }>("shared-tools", {
          command: "shared-lookup",
          args: ["item-1"],
          options: {
            format: "json",
            tag: ["smoke", "checkout"]
          }
        });
        const second = await runExtension<{ value: string }>("shared-tools", {
          command: "shared-lookup",
          args: ["item-2"]
        });
        return {
          command: args.command,
          page,
          first,
          second
        };
      }
    }]
  };
  const cli = createDivebellCli({ extensions: [caller, target] });
  const context = createOpenContextFixture();

  try {
    const output = createOutput();
    assert.equal(await cli.run(["inspect-shared"], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory: context.operationLogDirectory
    }), 0);
    assert.deepEqual(JSON.parse(output.text()), commandOutput("inspect-shared", {
      command: ["inspect-shared"],
      page: {
        url: "http://app.test/",
        openedUrl: "http://app.test/?divebellSessionId=session-open",
        normalizedUrl: "http://app.test/",
        bridgeUrl: "http://bridge.test",
        sessionId: "session-open",
        openedAt: 1
      },
      first: { value: "item-1" },
      second: { value: "item-2" }
    }));
    assert.deepEqual(calls, [
      {
        command: ["shared-lookup", "item-1"],
        format: ["json"],
        tags: ["smoke", "checkout"],
        bridge: ["http://bridge.test"],
        session: ["session-open"],
        url: ["http://app.test/"],
        page: {
          url: "http://app.test/",
          openedUrl: "http://app.test/?divebellSessionId=session-open",
          normalizedUrl: "http://app.test/",
          bridgeUrl: "http://bridge.test",
          sessionId: "session-open",
          openedAt: 1
        },
        hasRunExtension: true
      },
      {
        command: ["shared-lookup", "item-2"],
        format: undefined,
        tags: undefined,
        bridge: ["http://bridge.test"],
        session: ["session-open"],
        url: ["http://app.test/"],
        page: {
          url: "http://app.test/",
          openedUrl: "http://app.test/?divebellSessionId=session-open",
          normalizedUrl: "http://app.test/",
          bridgeUrl: "http://bridge.test",
          sessionId: "session-open",
          openedAt: 1
        },
        hasRunExtension: true
      }
    ]);
  } finally {
    context.cleanup();
  }
});

test("detects missing Extension dependencies when the Extension list loads", () => {
  assert.throws(() => createDivebellCli({
    extensions: [{
      schemaVersion: 1,
      name: "dependent-workflow",
      requires: ["missing-tools"],
      commands: [{
        name: "dependent-command",
        run: async () => ({ ready: true })
      }]
    }]
  }), /requires Extension "missing-tools".*not installed or loaded/);
});

test("rejects undeclared Extension calls and nested command cycles", async () => {
  const target: DivebellExtensionDefinition = {
    schemaVersion: 1,
    name: "target-tools",
    requires: ["caller-tools"],
    commands: [{
      name: "target-command",
      run: async ({ runExtension }) =>
        await runExtension("caller-tools", { command: "cycle-command" })
    }]
  };
  const caller: DivebellExtensionDefinition = {
    schemaVersion: 1,
    name: "caller-tools",
    requires: ["target-tools"],
    commands: [{
      name: "cycle-command",
      run: async ({ runExtension }) =>
        await runExtension("target-tools", { command: "target-command" })
    }]
  };
  const undeclaredCaller: DivebellExtensionDefinition = {
    schemaVersion: 1,
    name: "undeclared-caller",
    commands: [{
      name: "undeclared-command",
      run: async ({ runExtension }) =>
        await runExtension("target-tools", { command: "target-command" })
    }]
  };
  const cli = createDivebellCli({
    extensions: [caller, target, undeclaredCaller]
  });

  const undeclaredOutput = createOutput();
  assert.equal(await cli.run(["undeclared-command"], {
    stdout: undeclaredOutput.stdout,
    stderr: undeclaredOutput.stderr
  }), 1);
  assert.equal(
    JSON.parse(undeclaredOutput.text()).error.code,
    "EXTENSION_DEPENDENCY_UNDECLARED"
  );

  const cycleOutput = createOutput();
  assert.equal(await cli.run(["cycle-command"], {
    stdout: cycleOutput.stdout,
    stderr: cycleOutput.stderr
  }), 1);
  const cycleResult = JSON.parse(cycleOutput.text());
  assert.equal(cycleResult.error.code, "EXTENSION_COMMAND_CYCLE");
  assert.deepEqual(cycleResult.error.details.extensionCallChain, [
    { extension: "caller-tools", command: "cycle-command" },
    { extension: "target-tools", command: "target-command" },
    { extension: "caller-tools", command: "cycle-command" }
  ]);
});

test("enforces requiresOpenHook for direct and composed commands", async () => {
  const openAware: DivebellExtensionDefinition = {
    schemaVersion: 1,
    name: "open-aware",
    commands: [{
      name: "open-aware-command",
      requiresOpenHook: true,
      run: async () => ({ ready: true })
    }],
    hooks: {
      open: async () => {}
    }
  };
  const caller: DivebellExtensionDefinition = {
    schemaVersion: 1,
    name: "open-aware-caller",
    requires: ["open-aware"],
    commands: [{
      name: "call-open-aware",
      run: async ({ runExtension }) =>
        await runExtension("open-aware", { command: "open-aware-command" })
    }]
  };
  const cli = createDivebellCli({ extensions: [caller, openAware] });
  const inactiveContext = createOpenContextFixture();
  const activeContext = createOpenContextFixture({
    activeExtensions: ["open-aware"]
  });

  try {
    const inactiveOutput = createOutput();
    assert.equal(await cli.run(["call-open-aware"], {
      stdout: inactiveOutput.stdout,
      stderr: inactiveOutput.stderr,
      operationLogDirectory: inactiveContext.operationLogDirectory
    }), 1);
    assert.equal(
      JSON.parse(inactiveOutput.text()).error.code,
      "EXTENSION_OPEN_HOOK_REQUIRED"
    );

    const activeOutput = createOutput();
    assert.equal(await cli.run(["call-open-aware"], {
      stdout: activeOutput.stdout,
      stderr: activeOutput.stderr,
      operationLogDirectory: activeContext.operationLogDirectory
    }), 0);
    assert.deepEqual(
      JSON.parse(activeOutput.text()),
      commandOutput("call-open-aware", { ready: true })
    );
  } finally {
    inactiveContext.cleanup();
    activeContext.cleanup();
  }
});

test("runs unordered hooks in parallel and ordered hooks in dependency batches", async () => {
  const calls: string[] = [];
  const result = await runOpenHooks([{
    schemaVersion: 1,
    name: "base-hook",
    hooks: {
      open: async () => {
        calls.push("base:start");
        await Promise.resolve();
        calls.push("base:end");
      }
    }
  }, {
    schemaVersion: 1,
    name: "peer-hook",
    hooks: {
      open: async () => {
        calls.push("peer:start");
        await Promise.resolve();
        calls.push("peer:end");
      }
    }
  }, {
    schemaVersion: 1,
    name: "dependent-hook",
    hooks: {
      open: {
        after: ["base-hook"],
        run: async () => {
          calls.push("dependent");
        }
      }
    }
  }], {
    args: { command: ["open"], options: new Map() },
    url: "http://app.test/",
    openedUrl: "http://app.test/",
    bridgeUrl: null
  });

  assert.deepEqual(calls, [
    "base:start",
    "peer:start",
    "base:end",
    "peer:end",
    "dependent"
  ]);
  assert.deepEqual(result.activeExtensions, [
    "base-hook",
    "peer-hook",
    "dependent-hook"
  ]);
  assert.deepEqual(result.failures, []);
});

test("isolates hook failures and ordering cycles", async () => {
  const calls: string[] = [];
  const result = await runOpenHooks([{
    schemaVersion: 1,
    name: "failing-hook",
    hooks: {
      open: async () => {
        calls.push("failing");
        throw new Error("failed");
      }
    }
  }, {
    schemaVersion: 1,
    name: "soft-after",
    hooks: {
      open: {
        after: ["failing-hook"],
        run: async () => {
          calls.push("soft");
        }
      }
    }
  }, {
    schemaVersion: 1,
    name: "cycle-a",
    hooks: {
      open: {
        after: ["cycle-b"],
        run: async () => {
          calls.push("cycle-a");
        }
      }
    }
  }, {
    schemaVersion: 1,
    name: "cycle-b",
    hooks: {
      open: {
        after: ["cycle-a"],
        run: async () => {
          calls.push("cycle-b");
        }
      }
    }
  }, {
    schemaVersion: 1,
    name: "independent-hook",
    hooks: {
      open: async () => {
        calls.push("independent");
      }
    }
  }], {
    args: { command: ["open"], options: new Map() },
    url: "http://app.test/",
    openedUrl: "http://app.test/",
    bridgeUrl: null
  });

  assert.deepEqual(calls, ["failing", "independent", "soft"]);
  assert.deepEqual(result.activeExtensions, ["independent-hook", "soft-after"]);
  assert.deepEqual(
    result.failures.map((failure) => failure.extension).sort(),
    ["cycle-a", "cycle-b", "failing-hook"].sort()
  );
});

test("runs close hooks in reverse open order", async () => {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-ordered-close-"));
  const calls: string[] = [];
  const cli = createDivebellCli({
    extensions: [{
      schemaVersion: 1,
      name: "base-close",
      hooks: {
        open: async () => {
          calls.push("open:base");
        },
        close: async () => {
          calls.push("close:base");
        }
      }
    }, {
      schemaVersion: 1,
      name: "peer-close",
      hooks: {
        open: async () => {
          calls.push("open:peer");
        },
        close: async () => {
          calls.push("close:peer");
        }
      }
    }, {
      schemaVersion: 1,
      name: "dependent-close",
      hooks: {
        open: {
          after: ["base-close"],
          run: async () => {
            calls.push("open:dependent");
          }
        },
        close: async () => {
          calls.push("close:dependent");
        }
      }
    }]
  });
  const browserRunner = createBrowserRunner(async () => ({
    exitCode: 0,
    stdout: "",
    stderr: ""
  }));

  try {
    assert.equal(await cli.run(["open", "http://app.test", "--no-bridge"], {
      stdout: createOutput().stdout,
      stderr: createOutput().stderr,
      operationLogDirectory,
      browserRunner
    }), 0);
    assert.equal(await cli.run(["stop"], {
      stdout: createOutput().stdout,
      stderr: createOutput().stderr,
      operationLogDirectory,
      browserRunner
    }), 0);
    assert.deepEqual(calls, [
      "open:base",
      "open:peer",
      "open:dependent",
      "close:dependent",
      "close:base",
      "close:peer"
    ]);
  } finally {
    rmSync(operationLogDirectory, { recursive: true, force: true });
  }
});

test("isolates page initialization scripts returned by open hooks", async () => {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-hook-scripts-"));
  const cli = createDivebellCli({
    extensions: [{
      schemaVersion: 1,
      name: "throwing-script",
      hooks: {
        open: async () => ({
          scripts: ["throw new Error('script failed');"]
        })
      }
    }, {
      schemaVersion: 1,
      name: "working-script",
      hooks: {
        open: async () => ({
          scripts: ["globalThis.__DIVEBELL_SCRIPT_ISOLATION__ = 'worked';"]
        })
      }
    }]
  });
  const originalConsoleError = console.error;

  try {
    console.error = () => {};
    assert.equal(await cli.run(["open", "http://app.test", "--no-bridge"], {
      stdout: createOutput().stdout,
      stderr: createOutput().stderr,
      operationLogDirectory,
      browserRunner: createBrowserRunner(async (args) => {
        const scriptPath = args.at(-1);
        assert.equal(args.at(-2), "--init-script");
        assert.equal(typeof scriptPath, "string");
        const script = readFileSync(scriptPath as string, "utf8");
        new Function(script)();
        return { exitCode: 0, stdout: "", stderr: "" };
      })
    }), 0);
    assert.equal(
      (globalThis as { __DIVEBELL_SCRIPT_ISOLATION__?: string })
        .__DIVEBELL_SCRIPT_ISOLATION__,
      "worked"
    );
  } finally {
    console.error = originalConsoleError;
    delete (globalThis as { __DIVEBELL_SCRIPT_ISOLATION__?: string })
      .__DIVEBELL_SCRIPT_ISOLATION__;
    rmSync(operationLogDirectory, { recursive: true, force: true });
  }
});

test("exposes memory capture commands to CLI extensions", async () => {
  const extension = createCommandExtension({
    name: "memory-demo",
    run: async ({ divebell }) => {
      return {
        metrics: await divebell.browser.memory.metrics(),
        status: await divebell.browser.memory.status(),
        started: await divebell.browser.memory.sampling.start({ samplingInterval: 1024 }),
        stopped: await divebell.browser.memory.sampling.stop({
          path: "/tmp/divebell.heapprofile",
          top: 10,
          maxSize: 4096
        }),
        snapshot: await divebell.browser.memory.snapshot({
          path: "/tmp/divebell.heapsnapshot",
          collectGarbage: false,
          timeout: 5000,
          maxSize: 8192
        }),
        garbageCollected: await divebell.browser.memory.collectGarbage(),
        cancelled: await divebell.browser.memory.cancel()
      };
    }
  });
  const cli = createDivebellCli({ extensions: [extension] });
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
      ["memory", "sampling", "stop", "/tmp/divebell.heapprofile", "--top", "10", "--max-size", "4096", "--json"],
      ["memory", "snapshot", "/tmp/divebell.heapsnapshot", "--no-gc", "--timeout", "5000", "--max-size", "8192", "--json"],
      ["memory", "collect-garbage", "--json"],
      ["memory", "cancel", "--json"]
    ]);
    assert.deepEqual(JSON.parse(output.text()), commandOutput("memory-demo", {
      metrics: { name: "memory metrics" },
      status: { name: "memory status" },
      started: { name: "memory sampling start --sampling-interval 1024" },
      stopped: { name: "memory sampling stop /tmp/divebell.heapprofile --top 10 --max-size 4096" },
      snapshot: { name: "memory snapshot /tmp/divebell.heapsnapshot --no-gc --timeout 5000 --max-size 8192" },
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
    run: async ({ divebell }) => {
      return {
        status: await divebell.browser.coverage.status(),
        started: await divebell.browser.coverage.start({ callCount: true }),
        taken: await divebell.browser.coverage.take({
          path: "/tmp/first.coverage.json",
          label: "first-screen",
          maxSize: 4096
        }),
        stopped: await divebell.browser.coverage.stop({
          path: "/tmp/orders.coverage.json",
          label: "orders"
        }),
        cancelled: await divebell.browser.coverage.cancel()
      };
    }
  });
  const cli = createDivebellCli({ extensions: [extension] });
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
  const tempDir = mkdtempSync(join(tmpdir(), "divebell-extension-skill-"));
  const skillPath = join(tempDir, "SKILL.md");
  writeFileSync(skillPath, "# Demo skill\n", "utf8");
  let runCount = 0;

  try {
    const cli = createDivebellCli({
      extensions: [
        createCommandExtension({
          name: "demo",
          skill: { path: skillPath },
          commandReferences: [
            {
              category: "Extensions",
              usage: "divebell demo ping",
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
              usage: "divebell plain ping",
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
    assert.match(help, /divebell demo - Runs demo\./);
    assert.match(help, /divebell plain - Runs without a skill\./);
    assert.doesNotMatch(help, /divebell demo ping/);
    assert.doesNotMatch(help, /divebell plain ping/);
    assert.match(help, /Skill: available for demo\./);
    assert.match(help, /Skill usage: `divebell <command> --skill`/);
    assert.doesNotMatch(help, /Examples:/);

    const commandHelpOutput = createOutput();
    assert.equal(await cli.run(["demo", "--help"], {
      stdout: commandHelpOutput.stdout,
      stderr: commandHelpOutput.stderr
    }), 0);
    assert.match(commandHelpOutput.text(), /divebell demo ping - Runs demo\./);
    assert.match(commandHelpOutput.text(), /Skill: available via `divebell demo --skill`\./);
    assert.doesNotMatch(commandHelpOutput.text(), /divebell plain/);
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
        usage: "divebell demo wait",
        description: "Waits for a demo target."
      }
    ],
    run: async ({ divebell }) => {
      const result = await divebell.waitFor("business:demo", "ready", {
        timeout: 250
      });
      return {
        result
      };
    }
  });
  const cli = createDivebellCli({ extensions: [extension] });
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
                url: "http://app.test/?divebellSessionId=session-1",
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
          url: "http://app.test/?divebellSessionId=session-1",
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
  const tempDir = mkdtempSync(join(tmpdir(), "divebell-external-extensions-"));
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
      "    usage: 'divebell foo ping',",
      "    description: 'Runs Foo.'",
      "  }],",
      "  exampleReferences: [{",
      "    command: 'divebell foo ping',",
      "    description: 'Runs Foo example.'",
      "  }],",
      "  async run({ args, divebell }) {",
      "    const value = await divebell.browser.eval('window.foo');",
      "    return { command: args.command, value };",
      "  }",
      "  }],",
      "};",
      ""
    ].join("\n"));

    const loaded = await createDivebellCliWithExternalExtensions({}, {
      ...process.env,
      DIVEBELL_DISABLE_EXTENSIONS: "0",
      DIVEBELL_EXTENSIONS_DIR: tempDir
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
    assert.match(loaded.cli.createHelpText(), /divebell foo - Runs Foo\./);
    assert.doesNotMatch(loaded.cli.createHelpText(), /divebell foo ping/);
    assert.doesNotMatch(loaded.cli.createHelpText(), /\[external: foo\]/);
    assert.match(loaded.cli.createHelpText(), /Runs Foo\./);
    assert.doesNotMatch(loaded.cli.createHelpText(), /Runs Foo example\./);
    assert.match(loaded.cli.createHelpText(), /Skill: available for foo\./);
    assert.match(loaded.cli.createHelpText(), /Skill usage: `divebell <command> --skill`/);

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
    assert.match(helpOutput.text(), /divebell foo - Runs Foo\./);
    assert.doesNotMatch(helpOutput.text(), /divebell foo ping/);
    assert.match(helpOutput.text(), /Skill: available for foo\./);
    assert.doesNotMatch(helpOutput.text(), /Examples:/);

    const commandHelpOutput = createOutput();
    const commandHelpExitCode = await loaded.cli.run(["foo", "--help"], {
      stdout: commandHelpOutput.stdout,
      stderr: commandHelpOutput.stderr
    });
    assert.equal(commandHelpExitCode, 0);
    assert.equal(commandHelpOutput.errorText(), "");
    assert.match(commandHelpOutput.text(), /divebell foo ping - Runs Foo\./);
    assert.match(commandHelpOutput.text(), /Skill: available via `divebell foo --skill`\./);
    assert.doesNotMatch(commandHelpOutput.text(), /divebell extensions/);
  } finally {
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
    context.cleanup();
  }
});

test("skips external Extensions whose declared dependencies are unavailable", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "divebell-external-dependencies-"));
  try {
    writeFileSync(join(tempDir, "dependent.mjs"), [
      "export default {",
      "  schemaVersion: 1,",
      "  name: 'dependent-tools',",
      "  requires: ['missing-tools'],",
      "  commands: [{ name: 'dependent-command', async run() { return 0; } }],",
      "};",
      ""
    ].join("\n"));

    const loaded = await createDivebellCliWithExternalExtensions({}, {
      ...process.env,
      DIVEBELL_DISABLE_EXTENSIONS: "0",
      DIVEBELL_EXTENSIONS_DIR: tempDir
    });

    assert.deepEqual(loaded.cli.extensions, []);
    assert.equal(loaded.extensionLoadRecords[0]?.status, "skipped");
    assert.match(
      loaded.extensionLoadRecords[0]?.reason ?? "",
      /requires Extension "missing-tools".*not installed or loaded/
    );
  } finally {
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});

test("skips conflicting or invalid external extensions without crashing", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "divebell-external-extensions-conflict-"));
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

    const loaded = await createDivebellCliWithExternalExtensions({}, {
      ...process.env,
      DIVEBELL_DISABLE_EXTENSIONS: "0",
      DIVEBELL_EXTENSIONS_DIR: tempDir
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
  const tempDir = mkdtempSync(join(tmpdir(), "divebell-external-extensions-disabled-"));
  try {
    writeFileSync(join(tempDir, "foo.mjs"), [
      "export default {",
      "  schemaVersion: 1,",
      "  name: 'foo',",
      "  hooks: { async detectStack() {} },",
      "};",
      ""
    ].join("\n"));

    const loaded = await createDivebellCliWithExternalExtensions({}, {
      ...process.env,
      DIVEBELL_DISABLE_EXTENSIONS: "1",
      DIVEBELL_EXTENSIONS_DIR: tempDir
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
  const tempDir = mkdtempSync(join(tmpdir(), "divebell-external-extensions-warning-"));
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
        DIVEBELL_DISABLE_EXTENSIONS: "0",
        DIVEBELL_EXTENSIONS_DIR: tempDir
      }
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /Skipped external Divebell extension/);
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
    () => createDivebellCli({
      extensions: [
        createCommandExtension({
          name: "setup",
          run: async () => 0
        })
      ]
    }),
    /conflicts with a built-in command/
  );
});

test("rejects duplicate command names", () => {
  assert.throws(
    () => createDivebellCli({
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
