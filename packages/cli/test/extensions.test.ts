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
  type DivebellExtensionCommand,
  type DivebellExtensionDefinition
} from "../dist/index.js";
import {
  EXTENSION_BROWSER_RAW_FORBIDDEN_COMMANDS
} from "../dist/features/extension/api.js";
import {
  runDetectStackHooks,
  runOpenHooks
} from "../dist/features/extension/hooks.js";

import { commandData, commandOutput, createBrowserRunner, createOpenContextFixture, createOutput, errorOutput, jsonResponse } from "./helpers.js";

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

test("renders an explicitly selected Extension text presentation without changing default JSON", async () => {
  const extension = createCommandExtension({
    name: "timeline-demo",
    presentation: {
      kind: "text",
      when: (args) => args.options.get("view")?.at(-1) === "timeline",
      render: (result, options) => {
        assert.deepEqual(result, { observed: true });
        assert.equal(options.columns, 72);
        return "Page       ├────────┤ HTML 0–84 ms";
      }
    },
    run: async () => ({ observed: true })
  });
  const cli = createDivebellCli({ extensions: [extension] });

  const structured = createOutput();
  assert.equal(await cli.run(["timeline-demo"], {
    stdout: structured.stdout,
    stderr: structured.stderr
  }), 0);
  assert.deepEqual(commandData(structured.text()), { observed: true });

  let text = "";
  assert.equal(await cli.run(["timeline-demo", "--view", "timeline"], {
    stdout: {
      columns: 72,
      write(chunk) { text += chunk; }
    },
    stderr: { write() {} }
  }), 0);
  assert.equal(text, "Page       ├────────┤ HTML 0–84 ms\n");

  const caller: DivebellExtensionDefinition = {
    schemaVersion: 1,
    name: "timeline-caller",
    requires: ["timeline-demo"],
    commands: [{
      name: "timeline-caller",
      run: async ({ runExtension }) => ({
        nested: await runExtension("timeline-demo", {
          command: "timeline-demo",
          options: { view: "timeline" }
        })
      })
    }]
  };
  const nestedOutput = createOutput();
  assert.equal(await createDivebellCli({
    extensions: [extension, caller]
  }).run(["timeline-caller"], {
    stdout: nestedOutput.stdout,
    stderr: nestedOutput.stderr
  }), 0);
  assert.deepEqual(commandData(nestedOutput.text()), {
    nested: { observed: true }
  });
});

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
  const browserModes: Array<{
    ui: boolean | undefined;
    reuseInitialBlankPage: boolean | undefined;
    defaultProfile: string | undefined;
  }> = [];
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
  const browserRunner = createBrowserRunner(async (args, options) => {
    browserCalls.push(args);
    browserModes.push({
      ui: options?.ui,
      reuseInitialBlankPage: options?.reuseInitialBlankPage,
      defaultProfile: options?.defaultProfile
    });
    if (args[0] === "open") {
      return { exitCode: 0, stdout: "", stderr: "", defaultProfile: "Profile 2" };
    }
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
      "--ui",
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
    assert.deepEqual(browserModes, [
      { ui: true, reuseInitialBlankPage: true, defaultProfile: undefined },
      { ui: true, reuseInitialBlankPage: true, defaultProfile: "Profile 2" },
      { ui: true, reuseInitialBlankPage: true, defaultProfile: "Profile 2" },
      { ui: true, reuseInitialBlankPage: true, defaultProfile: "Profile 2" },
      { ui: true, reuseInitialBlankPage: true, defaultProfile: "Profile 2" }
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

test("keeps stack detections compact by dropping detector-specific fields", async () => {
  const result = await runDetectStackHooks([{
    schemaVersion: 1,
    name: "details-detector",
    hooks: {
      async detectStack() {
        return {
          id: "details",
          name: "Details",
          evidence: ["detected"],
          details: { bundlerRuntime: { publicPath: "/assets/" } }
        } as never;
      }
    }
  }], {} as never);

  assert.equal(result.failures.length, 0);
  assert.deepEqual(result.detections, [{
    id: "details",
    name: "Details",
    evidence: ["detected"],
    extension: "details-detector"
  }]);
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
  const sameVersionPackageRoot = join(tempDir, "fixture-same-version", "package");
  const sameVersionArchivePath = join(tempDir, "demo-command-1.0.0-updated.tgz");
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
  mkdirSync(sameVersionPackageRoot, { recursive: true });
  writeFileSync(join(sameVersionPackageRoot, "package.json"), `${JSON.stringify({
    name: "@demo/command-hello",
    version: "1.0.0",
    type: "module",
    divebell: {
      schemaVersion: 1,
      extensions: ["./index.mjs"]
    }
  }, null, 2)}\n`, "utf8");
  writeFileSync(join(sameVersionPackageRoot, "index.mjs"), `export default {
  schemaVersion: 1,
  name: "hello-installed",
  commands: [{
    name: "hello-installed",
    async run() { return { installed: true, sameVersionUpdated: true }; }
  }]
};\n`, "utf8");
  const sameVersionTarResult = spawnSync("tar", [
    "-czf",
    sameVersionArchivePath,
    "-C",
    join(tempDir, "fixture-same-version"),
    "package"
  ], { encoding: "utf8" });
  assert.equal(sameVersionTarResult.status, 0, sameVersionTarResult.stderr);
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
    assert.equal(commandData<{ package: { name: string } }>(addOutput.text()).package.name, "@demo/command-hello");

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

    const sameVersionOutput = createOutput();
    assert.equal(await cli.run([
      "extensions",
      "add",
      sameVersionArchivePath
    ], {
      stdout: sameVersionOutput.stdout,
      stderr: sameVersionOutput.stderr,
      extensionsDirectory,
      extensionPackageDownloader: {
        download: async () => sameVersionArchivePath
      }
    }), 0);
    assert.equal(commandData<{ status: string }>(sameVersionOutput.text()).status, "updated");
    assert.match(
      readFileSync(join(
        extensionsDirectory,
        ".packages",
        "%40demo%2Fcommand-hello",
        "1.0.0",
        "index.mjs"
      ), "utf8"),
      /sameVersionUpdated/u
    );

    const listOutput = createOutput();
    assert.equal(await cli.run(["extensions", "list"], {
      stdout: listOutput.stdout,
      stderr: listOutput.stderr,
      extensionsDirectory
    }), 0);
    assert.deepEqual(commandData<{ packages: Array<{ extensions: unknown }> }>(listOutput.text()).packages[0]?.extensions, [{
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
    assert.equal(commandData<{ packages: Array<{ version: string }> }>(afterFailedUpdateOutput.text()).packages[0]?.version, "1.0.0");

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
    assert.equal(commandData<{ package: { version: string } }>(updateOutput.text()).package.version, "1.1.0");

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
    assert.equal(commandData<{ status: string }>(removeOutput.text()).status, "removed");
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
    assert.deepEqual(commandData<{ packages: unknown[] }>(listOutput.text()).packages, []);
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
    url: "http://app.test/",
    browserRestoreDisabled: true,
    browserUi: true,
    browserReuseInitialBlankPage: true,
    browserDefaultProfile: "Profile 2"
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
      browserRunner: createBrowserRunner(async (args, browserOptions) => {
        assert.deepEqual(args, ["eval", "window.answer"]);
        assert.equal(browserOptions?.disableRestore, true);
        assert.equal(browserOptions?.ui, true);
        assert.equal(browserOptions?.reuseInitialBlankPage, true);
        assert.equal(browserOptions?.defaultProfile, "Profile 2");
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

test("exposes typed browser helpers and the raw browser entry point", async () => {
  const extension = createCommandExtension({
    name: "browser-api-demo",
    run: async ({ divebell }) => {
      return {
        snapshot: await divebell.browser.pageSnapshot(),
        clicked: await divebell.browser.click("e1"),
        filled: await divebell.browser.fill("e2", "hello"),
        focused: await divebell.browser.focus("e3"),
        pressed: await divebell.browser.press("Control+a"),
        selected: await divebell.browser.select("e4", ["cn", "sg"]),
        waited: await divebell.browser.wait(25),
        highlighted: await divebell.browser.highlight("e5"),
        screenshot: await divebell.browser.screenshot("page.png", { fullPage: true }),
        raw: await divebell.browser.raw(["hover", "@e6"])
      };
    }
  });
  const cli = createDivebellCli({ extensions: [extension] });
  const context = createOpenContextFixture({
    sessionId: "session-extension",
    browserRestoreDisabled: true,
    browserUi: true,
    browserReuseInitialBlankPage: true,
    browserDefaultProfile: "Profile 2"
  });
  const calls: string[][] = [];
  let rawRunOptions: unknown;

  try {
    const output = createOutput();
    const exitCode = await cli.run(["browser-api-demo"], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory: context.operationLogDirectory,
      browserRunner: createBrowserRunner(async (args, runOptions) => {
        calls.push(args);
        if (args[0] === "hover") rawRunOptions = runOptions;
        return {
          exitCode: 0,
          stdout: `${args.join(" ")}\n`,
          stderr: ""
        };
      })
    });

    assert.equal(exitCode, 0);
    assert.equal(output.errorText(), "");
    assert.deepEqual(calls, [
      ["snapshot"],
      ["click", "@e1"],
      ["fill", "@e2", "hello"],
      ["focus", "@e3"],
      ["press", "Control+a"],
      ["select", "@e4", "cn", "sg"],
      ["wait", "25"],
      ["highlight", "@e5"],
      ["screenshot", "page.png", "--full"],
      ["hover", "@e6"]
    ]);
    assert.deepEqual(rawRunOptions, {
      disableRestore: true,
      defaultProfile: "Profile 2",
      reuseInitialBlankPage: true,
      ui: true
    });
    assert.deepEqual(JSON.parse(output.text()), commandOutput("browser-api-demo", {
      snapshot: "snapshot",
      clicked: "click @e1",
      filled: "fill @e2 hello",
      focused: "focus @e3",
      pressed: "press Control+a",
      selected: "select @e4 cn sg",
      screenshot: "screenshot page.png --full",
      raw: {
        exitCode: 0,
        stdout: "hover @e6\n",
        stderr: ""
      }
    }));
  } finally {
    context.cleanup();
  }
});

test("requires an opened page context for Extension browser.raw even with a Runtime selector", async () => {
  let browserRunnerCalled = false;
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-browser-raw-context-"));
  const extension = createCommandExtension({
    name: "browser-raw-context-demo",
    run: async ({ divebell }) => await divebell.browser.raw(["hover", "@e1"])
  });
  const output = createOutput();

  try {
    const exitCode = await createDivebellCli({ extensions: [extension] }).run([
      "browser-raw-context-demo",
      "--url",
      "http://app.test/"
    ], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory,
      browserRunner: createBrowserRunner(async () => {
        browserRunnerCalled = true;
        return { exitCode: 0, stdout: "", stderr: "" };
      })
    });

    assert.equal(exitCode, 1);
    assert.equal(output.errorText(), "");
    assert.equal(JSON.parse(output.text()).error.code, "OPEN_CONTEXT_REQUIRED");
    assert.equal(browserRunnerCalled, false);
  } finally {
    rmSync(operationLogDirectory, { recursive: true, force: true });
  }
});

test("rejects invalid and workflow-owned commands from Extension browser.raw", async () => {
  let browserRunnerCalled = false;
  const extension = createCommandExtension({
    name: "browser-raw-boundary-demo",
    run: async ({ divebell }) => {
      const attempts = [
        ...EXTENSION_BROWSER_RAW_FORBIDDEN_COMMANDS.map((command) => [command]),
        [],
        ["--version"]
      ];
      const codes: string[] = [];
      for (const args of attempts) {
        try {
          await divebell.browser.raw(args);
        } catch (error) {
          codes.push((error as { code?: string }).code ?? "UNKNOWN");
        }
      }
      return codes;
    }
  });
  const context = createOpenContextFixture();
  const output = createOutput();

  try {
    const exitCode = await createDivebellCli({ extensions: [extension] }).run([
      "browser-raw-boundary-demo"
    ], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory: context.operationLogDirectory,
      browserRunner: createBrowserRunner(async () => {
        browserRunnerCalled = true;
        return { exitCode: 0, stdout: "", stderr: "" };
      })
    });

    assert.equal(exitCode, 0);
    assert.equal(output.errorText(), "");
    assert.deepEqual(commandData<string[]>(output.text()), [
      ...EXTENSION_BROWSER_RAW_FORBIDDEN_COMMANDS.map(() =>
        "EXTENSION_BROWSER_RAW_COMMAND_FORBIDDEN"
      ),
      "INVALID_EXTENSION_BROWSER_RAW_COMMAND",
      "INVALID_EXTENSION_BROWSER_RAW_COMMAND"
    ]);
    assert.equal(browserRunnerCalled, false);
  } finally {
    context.cleanup();
  }
});

test("exposes structured Network and Console APIs to Extensions", async () => {
  const extension = createCommandExtension({
    name: "browser-diagnostics-demo",
    run: async ({ divebell }) => ({
      requests: await divebell.browser.network.list({
        url: "/api/orders",
        resourceTypes: ["xhr", "fetch"],
        method: "GET",
        status: "2xx"
      }),
      request: await divebell.browser.network.get("123.1"),
      cleared: await divebell.browser.network.clear(),
      routed: await divebell.browser.network.route("**/api/orders", { body: { ok: true } }),
      unrouted: await divebell.browser.network.unroute("**/api/orders"),
      harStarted: await divebell.browser.network.har.start({ content: "none" }),
      har: await divebell.browser.network.har.stop("/tmp/orders.har"),
      console: await divebell.browser.console.list({ levels: ["error"], query: "orders" }),
      consoleCleared: await divebell.browser.console.clear()
    })
  });
  const context = createOpenContextFixture();
  const calls: string[][] = [];
  const output = createOutput();
  try {
    const exitCode = await createDivebellCli({ extensions: [extension] }).run([
      "browser-diagnostics-demo"
    ], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory: context.operationLogDirectory,
      browserRunner: createBrowserRunner(async (args) => {
        calls.push(args);
        if (args[0] === "network" && args[1] === "requests" && args.includes("--json")) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({ requests: [{
              requestId: "123.1",
              url: "http://app.test/api/orders",
              method: "GET",
              resourceType: "fetch",
              status: 200
            }] }),
            stderr: ""
          };
        }
        if (args[0] === "network" && args[1] === "request") {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              requestId: "123.1",
              url: "http://app.test/api/orders",
              method: "GET",
              resourceType: "fetch",
              headers: { accept: "application/json" },
              status: 200,
              responseHeaders: { "content-type": "application/json" },
              mimeType: "application/json",
              responseBody: "{\"ok\":true}"
            }),
            stderr: ""
          };
        }
        if (args[0] === "network" && args[1] === "har" && args[2] === "stop") {
          return { exitCode: 0, stdout: JSON.stringify({ path: "/tmp/orders.har" }), stderr: "" };
        }
        if (args[0] === "console" && args.includes("--json")) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({ messages: [
              { type: "error", text: "orders failed", timestamp: 1 },
              { type: "log", text: "orders ready", timestamp: 2 }
            ] }),
            stderr: ""
          };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      })
    });

    assert.equal(exitCode, 0);
    assert.equal(output.errorText(), "");
    assert.deepEqual(calls, [
      ["network", "requests", "--filter", "/api/orders", "--type", "xhr,fetch", "--method", "GET", "--status", "2xx", "--json"],
      ["network", "request", "123.1", "--json"],
      ["network", "requests", "--clear"],
      ["network", "route", "**/api/orders", "--body", "{\"ok\":true}"],
      ["network", "unroute", "**/api/orders"],
      ["network", "har", "start", "--content", "none"],
      ["network", "har", "stop", "/tmp/orders.har", "--json"],
      ["console", "--json"],
      ["console", "--clear"]
    ]);
    assert.deepEqual(JSON.parse(output.text()), commandOutput("browser-diagnostics-demo", {
      requests: [{
        id: "123.1",
        url: "http://app.test/api/orders",
        method: "GET",
        resourceType: "fetch",
        status: 200
      }],
      request: {
        id: "123.1",
        url: "http://app.test/api/orders",
        method: "GET",
        resourceType: "fetch",
        status: 200,
        request: { headers: { accept: "application/json" } },
        response: {
          status: 200,
          headers: { "content-type": "application/json" },
          mimeType: "application/json",
          body: "{\"ok\":true}"
        }
      },
      har: { path: "/tmp/orders.har" },
      console: {
        entries: [{ level: "error", args: "orders failed", timestamp: 1 }],
        summary: { total: 1, log: 0, info: 0, warn: 0, error: 1 }
      }
    }));
  } finally {
    context.cleanup();
  }
});

test("exposes structured Tabs and Debugger APIs to Extensions", async () => {
  const extension = createCommandExtension({
    name: "browser-debug-demo",
    run: async ({ divebell }) => ({
      tabs: await divebell.browser.tabs.list(),
      activated: await divebell.browser.tabs.activate("t2"),
      status: await divebell.browser.debug.status({ allTabs: true }),
      enabled: await divebell.browser.debug.enable({ tab: "t1" }),
      disabled: await divebell.browser.debug.disable({ tab: "t1", resume: true }),
      scripts: await divebell.browser.debug.scripts({ tab: "t1", filter: "app" }),
      source: await divebell.browser.debug.source("42", { tab: "t1" }),
      matches: await divebell.browser.debug.sourceSearch("needle", {
        tab: "t1",
        filter: "vendor",
        maxResults: 1000
      }),
      events: await divebell.browser.debug.events({ since: 4, wait: 100, clear: true }),
      logpoint: await divebell.browser.debug.logpoints.set({
        tab: "t1",
        scriptId: "42",
        line: 108,
        column: 3,
        expressions: ["x", "y"],
        when: "x > 0",
        mode: "after",
        maxLines: 1,
        maxUtf16Distance: 512,
        persist: true,
        tags: { observation: "o1" }
      }),
      logpoints: await divebell.browser.debug.logpoints.list(),
      removed: await divebell.browser.debug.logpoints.remove("probe-1"),
      breakpoints: await divebell.browser.debug.breakpoints.list()
    })
  });
  const context = createOpenContextFixture();
  const calls: string[][] = [];

  try {
    const output = createOutput();
    const exitCode = await createDivebellCli({ extensions: [extension] }).run([
      "browser-debug-demo"
    ], {
      stdout: output.stdout,
      stderr: output.stderr,
      operationLogDirectory: context.operationLogDirectory,
      browserRunner: createBrowserRunner(async (args) => {
        calls.push(args);
        if (args[0] === "tab" && args[1] === "--json") {
          return {
            exitCode: 0,
            stdout: JSON.stringify({ tabs: [
              { tabId: "t1", title: "App", url: "http://app.test/", active: true }
            ] }),
            stderr: ""
          };
        }
        if (args[0] === "debug" && args[1] === "scripts") {
          return { exitCode: 0, stdout: JSON.stringify({ scripts: [{ scriptId: "42" }] }), stderr: "" };
        }
        return {
          exitCode: 0,
          stdout: args.includes("--json") ? JSON.stringify({ command: args.slice(0, -1) }) : "",
          stderr: ""
        };
      })
    });

    assert.equal(exitCode, 0);
    assert.equal(output.errorText(), "");
    assert.deepEqual(calls, [
      ["tab", "--json"],
      ["tab", "t2"],
      ["debug", "status", "--all-tabs", "--json"],
      ["debug", "enable", "--tab", "t1", "--json"],
      ["debug", "disable", "--tab", "t1", "--resume", "--json"],
      ["debug", "scripts", "--tab", "t1", "--filter", "app", "--json"],
      ["debug", "source", "42", "--tab", "t1", "--json"],
      ["debug", "source", "search", "needle", "--tab", "t1", "--filter", "vendor", "--max-results", "1000", "--json"],
      ["debug", "events", "--since", "4", "--wait", "100", "--clear", "--json"],
      ["debug", "logpoint", "set", "42", "108", "--tab", "t1", "--column", "3", "--expression", "x", "--expression", "y", "--when", "x > 0", "--after", "--max-lines", "1", "--max-utf16-distance", "512", "--persist", "--tag", "observation=o1", "--json"],
      ["debug", "logpoint", "list", "--json"],
      ["debug", "logpoint", "remove", "probe-1", "--json"],
      ["debug", "breakpoint", "list", "--json"]
    ]);
    const result = commandData<Record<string, unknown>>(output.text());
    assert.deepEqual(result.tabs, [
      { tabId: "t1", title: "App", url: "http://app.test/", active: true }
    ]);
    assert.deepEqual(result.scripts, [{ scriptId: "42" }]);
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
