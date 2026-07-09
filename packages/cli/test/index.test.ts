import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { test } from "@rstest/core";

import {
  cliPackageInfo,
  createOpenRuntimeCliWithExternalExtensions,
  createOpenRuntimeCli,
  defineCommand,
  getCliCommandName,
  runCli,
  validateCommand,
  type OpenRuntimeCliExtension
} from "../dist/index.js";
import { createDefaultBrowserProfileDirectory, createNextBrowserEnvironment, type BrowserRunOptions, type BrowserRunner } from "../dist/browser.js";
import { isEntryPoint } from "../dist/entry.js";
import { createCliReferenceMarkdown } from "../dist/help.js";
import { createOperationLogKey, createOperationSessionId } from "../dist/operation-log.js";
import { convertAuthConnectorPayloadToStorageState, exportAuthProfileWithConnector, writeAuthConnectorExtension } from "../dist/auth-connector.js";
import { AUTH_STATE_FILE_NAME, exportAuthStateProfile } from "../dist/profile.js";

process.env.OPENRUNTIME_DISABLE_COMMANDS = "1";

test("exposes the cli package marker", () => {
  assert.equal(getCliCommandName(), "openruntime");
  assert.deepEqual(cliPackageInfo, {
    name: "@openruntime/cli",
    phase: "phase-0",
    role: "agent command line"
  });
});

test("exposes only canonical cli binaries", () => {
  const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));

  assert.deepEqual(Object.keys(packageJson.bin), ["openruntime", "opr"]);
});

test("defines and validates command exports", () => {
  const command = defineCommand({
    schemaVersion: 1,
    name: "demo",
    commandReferences: [
      {
        category: "Commands",
        usage: "openruntime demo ping",
        description: "Runs demo."
      }
    ],
    async run() {
      return 0;
    }
  });

  assert.equal(command.name, "demo");
  assert.equal(validateCommand(command).name, "demo");
  assert.throws(
    () => validateCommand({
      schemaVersion: 1,
      name: "broken"
    }),
    /must export a run\(options\) function/
  );
});

test("prints explicit runtime resource help", async () => {
  const output = createOutput();
  const exitCode = await runCli(["--help"], {
    stdout: output.stdout,
    stderr: output.stderr
  });

  assert.equal(exitCode, 0);
  assert.equal(output.errorText(), "");
  assert.match(output.text(), /openruntime snapshot .*--id <id>/);
  assert.match(output.text(), /openruntime events .*--target-id <id>.*--limit <n>.*--query <keyword>/);
  assert.match(output.text(), /openruntime actions .*--name <name>/);
  assert.match(output.text(), /openruntime open <url> .*--ui/);
  assert.match(output.text(), /openruntime auth export --url <url>/);
  assert.match(output.text(), /openruntime auth import <content-or-path> \| --input <path>/);
  assert.match(output.text(), /openruntime auth list/);
  assert.match(output.text(), /openruntime auth clear \[--url <url>\]/);
  assert.doesNotMatch(output.text(), /openruntime export-profile /);
  assert.doesNotMatch(output.text(), /openruntime import-profile /);
  assert.doesNotMatch(output.text(), /openruntime profile /);
  assert.match(output.text(), /openruntime network \[--url <query>\]/);
  assert.match(output.text(), /openruntime console \[--level <level>\] \[--query <keyword>\] \[--limit <n>\]/);
  assert.match(output.text(), /openruntime verify .*<target-id> <status>/);
  assert.match(output.text(), /openruntime wait-for .*--next/);
  assert.match(output.text(), /openruntime snapshot .* - 读取当前 runtime snapshot 状态。/);
  assert.match(output.text(), /openruntime wait-for .* - 等待 target 到达指定状态/);
  assert.doesNotMatch(output.text(), /openruntime commands list/);
  assert.doesNotMatch(output.text(), /openruntime goto /);
  assert.doesNotMatch(output.text(), /openruntime close/);
  assert.doesNotMatch(output.text(), /\[--open\]/);
  assert.doesNotMatch(output.text(), /openruntime vmok /);
  assert.doesNotMatch(output.text(), /open[-]runtime/);
});

test("prints help for command help without executing the command", async () => {
  for (const command of ["start", "open", "events"]) {
    let touchedSideEffect = false;
    const output = createOutput();
    const exitCode = await runCli([command, "--help"], {
      stdout: output.stdout,
      stderr: output.stderr,
      fetcher: async () => {
        touchedSideEffect = true;
        throw new Error("fetcher should not be called");
      },
      bridgeStarter: {
        start: async () => {
          touchedSideEffect = true;
          throw new Error("bridge should not be started");
        }
      },
      browserRunner: createBrowserRunner(async () => {
        touchedSideEffect = true;
        return {
          exitCode: 1,
          stdout: "",
          stderr: "browser should not be opened"
        };
      })
    });

    assert.equal(exitCode, 0);
    assert.equal(output.errorText(), "");
    assert.match(output.text(), /Usage:/);
    assert.equal(touchedSideEffect, false);
  }
});

test("generates CLI reference markdown from the help table", () => {
  const markdown = createCliReferenceMarkdown();

  assert.match(markdown, /openruntime open <url>/);
  assert.match(markdown, /openruntime auth export --url <url>/);
  assert.match(markdown, /openruntime auth import <content-or-path>/);
  assert.match(markdown, /openruntime auth list/);
  assert.match(markdown, /openruntime auth clear \[--url <url>\]/);
  assert.doesNotMatch(markdown, /openruntime export-profile /);
  assert.doesNotMatch(markdown, /openruntime import-profile /);
  assert.doesNotMatch(markdown, /openruntime profile /);
  assert.match(markdown, /openruntime get-window <path>/);
  assert.match(markdown, /openruntime network \[--url <query>\]/);
  assert.match(markdown, /openruntime verify .*<target-id> <status>/);
  assert.match(markdown, /openruntime wait-for .*<target-id> <status>.*--next/);
  assert.doesNotMatch(markdown, /openruntime commands list/);
  assert.doesNotMatch(markdown, /openruntime goto /);
  assert.doesNotMatch(markdown, /openruntime close/);
  assert.doesNotMatch(markdown, /\[--open\]/);
  assert.doesNotMatch(markdown, /openruntime vmok /);
  assert.doesNotMatch(markdown, /open[-]runtime/);
});

test("registers a command and merges its help entries", async () => {
  const extension: OpenRuntimeCliExtension = {
    name: "demo",
    commandReferences: [
      {
        category: "Commands",
        usage: "openruntime demo ping [--url <url>]",
        description: "Runs a demo command."
      }
    ],
    exampleReferences: [
      {
        command: "openruntime demo ping",
        description: "Runs the demo command."
      }
    ],
    run: async (options) => {
      const { args, page, openruntime, output } = options;
      const snapshot = await openruntime.snapshot({ id: "target-1" });
      const browserValue = await openruntime.browser.eval("window.answer");
      output.ok({
        command: args.command,
        hasBridgeUrlOption: "bridgeUrl" in options,
        hasRuntimeSelectorOption: "runtimeSelector" in options,
        hasEnsureBridgeApi: "ensureBridge" in openruntime,
        hasRuntimesApi: "runtimes" in openruntime,
        hasSelectRuntimeApi: "selectRuntime" in openruntime,
        page,
        snapshot: snapshot.result,
        browserValue
      });
      return 0;
    }
  };
  const cli = createOpenRuntimeCli({ extensions: [extension] });

  assert.match(cli.createHelpText(), /openruntime demo ping/);
  assert.deepEqual(cli.getCommandReferences().at(-1), extension.commandReferences?.[0]);
  assert.deepEqual(cli.getExampleReferences().at(-1), extension.exampleReferences?.[0]);

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
      hasBridgeUrlOption: false,
      hasRuntimeSelectorOption: false,
      hasEnsureBridgeApi: false,
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

test("commands can wait for targets in the opened page context", async () => {
  const extension: OpenRuntimeCliExtension = {
    name: "demo",
    commandReferences: [
      {
        category: "Commands",
        usage: "openruntime demo wait",
        description: "Waits for a demo target."
      }
    ],
    run: async ({ openruntime, output }) => {
      const result = await openruntime.waitFor("business:demo", "ready", {
        timeout: 250
      });
      output.ok({
        result
      });
      return 0;
    }
  };
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

test("loads external commands from the configured directory", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-external-commands-"));
  const context = createOpenContextFixture();
  try {
    writeFileSync(join(tempDir, "foo.mjs"), [
      "export default {",
      "  schemaVersion: 1,",
      "  name: 'foo',",
      "  displayName: 'Foo',",
      "  description: 'Foo command',",
      "  commandReferences: [{",
      "    category: 'Commands',",
      "    usage: 'openruntime foo ping',",
      "    description: 'Runs Foo.'",
      "  }],",
      "  exampleReferences: [{",
      "    command: 'openruntime foo ping',",
      "    description: 'Runs Foo example.'",
      "  }],",
      "  async run({ args, stdout, openruntime }) {",
      "    const value = await openruntime.browser.eval('window.foo');",
      "    stdout.write(`${JSON.stringify({ command: args.command, value })}\\n`);",
      "    return 0;",
      "  }",
      "};",
      ""
    ].join("\n"));

    const loaded = await createOpenRuntimeCliWithExternalExtensions({}, {
      ...process.env,
      OPENRUNTIME_DISABLE_COMMANDS: "0",
      OPENRUNTIME_COMMANDS_DIR: tempDir
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
    assert.match(loaded.cli.createHelpText(), /External Commands/);
    assert.match(loaded.cli.createHelpText(), /openruntime foo ping \[external: foo\]/);
    assert.match(loaded.cli.createHelpText(), /Runs Foo\./);
    assert.match(loaded.cli.createHelpText(), /Runs Foo example\./);

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
    assert.deepEqual(JSON.parse(output.text()), {
      command: ["foo", "ping"],
      value: {
        ok: true
      }
    });

    const helpOutput = createOutput();
    const helpExitCode = await loaded.cli.run(["--help"], {
      stdout: helpOutput.stdout,
      stderr: helpOutput.stderr
    });

    assert.equal(helpExitCode, 0);
    assert.equal(helpOutput.errorText(), "");
    assert.match(helpOutput.text(), /External Commands:/);
    assert.match(helpOutput.text(), /openruntime foo ping \[external: foo\] - Runs Foo\./);
    assert.match(helpOutput.text(), /openruntime foo ping - Runs Foo example\./);
  } finally {
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
    context.cleanup();
  }
});

test("skips conflicting or invalid external commands without crashing", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-external-commands-conflict-"));
  try {
    writeFileSync(join(tempDir, "snapshot.mjs"), [
      "export default {",
      "  schemaVersion: 1,",
      "  name: 'snapshot',",
      "  async run() { return 0; }",
      "};",
      ""
    ].join("\n"));
    writeFileSync(join(tempDir, "broken.mjs"), "export default { schemaVersion: 1, name: 'broken' };\n");

    const loaded = await createOpenRuntimeCliWithExternalExtensions({}, {
      ...process.env,
      OPENRUNTIME_DISABLE_COMMANDS: "0",
      OPENRUNTIME_COMMANDS_DIR: tempDir
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
        name: "snapshot",
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

test("honors disabled external commands", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-external-commands-disabled-"));
  try {
    writeFileSync(join(tempDir, "foo.mjs"), [
      "export default {",
      "  schemaVersion: 1,",
      "  name: 'foo',",
      "  async run() { return 0; }",
      "};",
      ""
    ].join("\n"));

    const loaded = await createOpenRuntimeCliWithExternalExtensions({}, {
      ...process.env,
      OPENRUNTIME_DISABLE_COMMANDS: "1",
      OPENRUNTIME_COMMANDS_DIR: tempDir
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

test("warns when runCli skips an external command", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-external-commands-warning-"));
  const previousDisableCommands = process.env.OPENRUNTIME_DISABLE_COMMANDS;
  const previousCommandsDir = process.env.OPENRUNTIME_COMMANDS_DIR;
  try {
    writeFileSync(join(tempDir, "snapshot.mjs"), [
      "export default {",
      "  schemaVersion: 1,",
      "  name: 'snapshot',",
      "  async run() { return 0; }",
      "};",
      ""
    ].join("\n"));
    delete process.env.OPENRUNTIME_DISABLE_COMMANDS;
    process.env.OPENRUNTIME_COMMANDS_DIR = tempDir;

    const output = createOutput();
    const exitCode = await runCli(["--help"], {
      stdout: output.stdout,
      stderr: output.stderr
    });

    assert.equal(exitCode, 0);
    assert.match(output.errorText(), /Skipped external OpenRuntime command/);
    assert.match(output.errorText(), /conflicts with an existing command/);
  } finally {
    process.env.OPENRUNTIME_DISABLE_COMMANDS = previousDisableCommands ?? "1";
    if (previousCommandsDir === undefined) {
      delete process.env.OPENRUNTIME_COMMANDS_DIR;
    } else {
      process.env.OPENRUNTIME_COMMANDS_DIR = previousCommandsDir;
    }
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
        {
          name: "snapshot",
          run: async () => 0
        }
      ]
    }),
    /conflicts with a built-in command/
  );
});

test("rejects duplicate command names", () => {
  assert.throws(
    () => createOpenRuntimeCli({
      extensions: [
        {
          name: "demo",
          run: async () => 0
        },
        {
          name: "demo",
          run: async () => 0
        }
      ]
    }),
    /registered more than once/
  );
});

test("configures next-browser with a persistent OpenRuntime profile", () => {
  const env = createNextBrowserEnvironment({
    NODE_OPTIONS: "--enable-source-maps",
    OPENRUNTIME_BROWSER_PROFILE_DIR: "/tmp/custom-openruntime-profile"
  });

  assert.equal(env.OPENRUNTIME_NEXT_BROWSER_PROFILE_DIR, "/tmp/custom-openruntime-profile");
  assert.equal(env.NEXT_BROWSER_HEADLESS, "1");
  assert.match(env.NODE_OPTIONS ?? "", /--enable-source-maps/);
  assert.match(env.NODE_OPTIONS ?? "", /--import file:\/\//);
});

test("allows visible browser mode for next-browser", () => {
  const env = createNextBrowserEnvironment({
    NEXT_BROWSER_HEADLESS: "1"
  }, undefined, { ui: true });

  assert.equal(env.NEXT_BROWSER_HEADLESS, undefined);
});

test("uses the default OpenRuntime browser profile directory", () => {
  const env = createNextBrowserEnvironment({});

  assert.equal(env.OPENRUNTIME_NEXT_BROWSER_PROFILE_DIR, createDefaultBrowserProfileDirectory());
});

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

test("keeps the persistent profile when next-browser closes its temporary profile", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-cli-profile-"));
  const profileDirectory = join(tempDir, "profile");
  const temporaryProfileDirectory = join(tempDir, "next-browser-profile-test");
  const preloadUrl = pathToFileURL(join(process.cwd(), "dist", "next-browser-profile-preload.js")).href;
  const script = [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    `const tempProfile = ${JSON.stringify(temporaryProfileDirectory)};`,
    "fs.mkdirSync(tempProfile, { recursive: true });",
    "fs.writeFileSync(path.join(tempProfile, 'login-state'), 'kept');",
    "fs.rmSync(tempProfile, { recursive: true, force: true });"
  ].join("");

  try {
    const result = spawnSync(process.execPath, ["--import", preloadUrl, "-e", script], {
      encoding: "utf8",
      env: {
        ...process.env,
        OPENRUNTIME_NEXT_BROWSER_PROFILE_DIR: profileDirectory
      }
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(profileDirectory, "login-state")), true);
  } finally {
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});

test("imports, lists, and clears the current auth profile", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-profile-command-"));
  const profileDirectory = join(tempDir, "profile");
  const inputPath = join(tempDir, "auth.oprprofile");
  const previousProfileDirectory = process.env.OPENRUNTIME_BROWSER_PROFILE_DIR;
  try {
    process.env.OPENRUNTIME_BROWSER_PROFILE_DIR = profileDirectory;
    const exported = await exportAuthStateProfile({
      outputPath: inputPath,
      storageState: {
        cookies: [
          {
            name: "sid",
            value: "1",
            domain: ".example.com",
            path: "/",
            expires: -1,
            httpOnly: true,
            secure: true
          },
          {
            name: "other",
            value: "2",
            domain: "other.example",
            path: "/",
            expires: -1,
            httpOnly: false,
            secure: true
          }
        ],
        origins: [
          {
            origin: "https://app.example.com",
            localStorage: []
          },
          {
            origin: "https://other.example",
            localStorage: []
          }
        ]
      }
    });
    assert.equal(exported.path, inputPath);

    let closeArgs: string[] | undefined;
    let appliedProfileDirectory: string | undefined;
    let appliedStorageState: unknown;
    const importOutput = createOutput();
    const importExitCode = await runCli(["auth", "import", "--input", inputPath], {
      stdout: importOutput.stdout,
      stderr: importOutput.stderr,
      authStateApplier: async (applierProfileDirectory, storageState) => {
        appliedProfileDirectory = applierProfileDirectory;
        appliedStorageState = storageState;
      },
      browserRunner: createBrowserRunner(async (args) => {
        closeArgs = args;
        return {
          exitCode: 0,
          stdout: "",
          stderr: ""
        };
      })
    });

    assert.equal(importExitCode, 0);
    assert.equal(importOutput.errorText(), "");
    assert.deepEqual(closeArgs, ["close"]);
    assert.deepEqual(JSON.parse(importOutput.text()), {
      kind: "auth",
      profileDirectory
    });
    const importedStorageState = JSON.parse(readFileSync(join(profileDirectory, AUTH_STATE_FILE_NAME), "utf8"));
    assert.equal(appliedProfileDirectory, profileDirectory);
    assert.deepEqual(appliedStorageState, importedStorageState);
    assert.deepEqual(importedStorageState, {
      cookies: [
        {
          name: "sid",
          value: "1",
          domain: ".example.com",
          path: "/",
          expires: -1,
          httpOnly: true,
          secure: true
        },
        {
          name: "other",
          value: "2",
          domain: "other.example",
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: true
        }
      ],
      origins: [
        {
          origin: "https://app.example.com",
          localStorage: []
        },
        {
          origin: "https://other.example",
          localStorage: []
        }
      ]
    });

    const listOutput = createOutput();
    const listExitCode = await runCli(["auth", "list"], {
      stdout: listOutput.stdout,
      stderr: listOutput.stderr
    });
    assert.equal(listExitCode, 0);
    assert.equal(listOutput.errorText(), "");
    assert.deepEqual(JSON.parse(listOutput.text()), {
      kind: "auth",
      profileDirectory,
      authStatePath: join(profileDirectory, AUTH_STATE_FILE_NAME),
      imported: true,
      sites: [
        {
          site: "app.example.com",
          cookies: 0,
          origins: ["https://app.example.com"]
        },
        {
          site: "example.com",
          cookies: 1,
          origins: []
        },
        {
          site: "other.example",
          cookies: 1,
          origins: ["https://other.example"]
        }
      ]
    });

    const clearUrlOutput = createOutput();
    const clearUrlExitCode = await runCli(["auth", "clear", "--url", "https://app.example.com/dashboard"], {
      stdout: clearUrlOutput.stdout,
      stderr: clearUrlOutput.stderr,
      browserRunner: createBrowserRunner(async (args) => {
        closeArgs = args;
        return {
          exitCode: 1,
          stdout: "",
          stderr: "daemon failed to start (/tmp/next-browser.sock)"
        };
      })
    });

    assert.equal(clearUrlExitCode, 0);
    assert.equal(clearUrlOutput.errorText(), "");
    assert.deepEqual(closeArgs, ["close"]);
    assert.deepEqual(JSON.parse(clearUrlOutput.text()), {
      kind: "auth",
      profileDirectory,
      removed: true,
      url: "https://app.example.com/dashboard",
      removedCookies: 1,
      removedOrigins: ["https://app.example.com"]
    });
    assert.deepEqual(JSON.parse(readFileSync(join(profileDirectory, AUTH_STATE_FILE_NAME), "utf8")), {
      cookies: [
        {
          name: "other",
          value: "2",
          domain: "other.example",
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: true
        }
      ],
      origins: [
        {
          origin: "https://other.example",
          localStorage: []
        }
      ]
    });

    const clearOutput = createOutput();
    const clearExitCode = await runCli(["auth", "clear"], {
      stdout: clearOutput.stdout,
      stderr: clearOutput.stderr,
      browserRunner: createBrowserRunner(async (args) => {
        closeArgs = args;
        return {
          exitCode: 1,
          stdout: "",
          stderr: "daemon failed to start (/tmp/next-browser.sock)"
        };
      })
    });

    assert.equal(clearExitCode, 0);
    assert.equal(clearOutput.errorText(), "");
    assert.deepEqual(closeArgs, ["close"]);
    assert.deepEqual(JSON.parse(clearOutput.text()), {
      kind: "auth",
      profileDirectory,
      removed: true
    });
    assert.equal(existsSync(profileDirectory), false);
  } finally {
    if (previousProfileDirectory === undefined) {
      delete process.env.OPENRUNTIME_BROWSER_PROFILE_DIR;
    } else {
      process.env.OPENRUNTIME_BROWSER_PROFILE_DIR = previousProfileDirectory;
    }
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});

test("exports auth profile through the Chrome auth connector", async () => {
  const output = createOutput();
  let authOptions: unknown;
  const exitCode = await runCli([
    "auth",
    "export",
    "--url",
    "www.douyin.com",
    "--timeout",
    "120000",
    "--extension-dir",
    "/tmp/openruntime-auth-extension",
    "--extension-install-url",
    "https://chromewebstore.google.com/detail/openruntime-auth/test",
    "--extension-icon",
    "/tmp/openruntime-logo.png",
    "--output",
    "/tmp/app-auth.oprprofile"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    authConnectorExporter: async (options) => {
      authOptions = options;
      return {
        kind: "auth",
        path: "/tmp/app-auth.oprprofile"
      };
    }
  });

  assert.equal(exitCode, 0);
  assert.equal(output.errorText(), "");
  assert.equal(output.text(), "/tmp/app-auth.oprprofile\n");
  assert.deepEqual(authOptions, {
    requestedUrl: "https://www.douyin.com/",
    outputPath: "/tmp/app-auth.oprprofile",
    timeout: 120000,
    extensionDirectory: "/tmp/openruntime-auth-extension",
    extensionInstallUrl: "https://chromewebstore.google.com/detail/openruntime-auth/test",
    extensionIconPath: "/tmp/openruntime-logo.png"
  });
});

test("rejects unsupported auth export URLs before opening Chrome", async () => {
  const output = createOutput();
  let didOpenChrome = false;
  const exitCode = await runCli([
    "auth",
    "export",
    "--url",
    "ftp://example.com"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    authConnectorExporter: async () => {
      didOpenChrome = true;
      return {
        kind: "auth",
        content: "unexpected"
      };
    }
  });

  assert.equal(exitCode, 1);
  assert.equal(output.errorText(), "");
  assert.equal(didOpenChrome, false);
  assert.deepEqual(JSON.parse(output.text()), errorOutput("auth export", {
    code: "AUTH_EXPORT_URL_UNSUPPORTED",
    kind: "validation",
    message: "Auth export URL must use http or https.",
    retryable: false,
    hint: "Pass an http or https URL, or a plain domain."
  }));
});

test("converts Chrome auth connector payload to storage state", () => {
  assert.deepEqual(convertAuthConnectorPayloadToStorageState({
    requestedUrl: "https://app.example.com/dashboard",
    cookies: [
      {
        name: "session",
        value: "secret",
        domain: ".example.com",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "no_restriction",
        expirationDate: 1800000000,
        partitionKey: {
          topLevelSite: "https://app.example.com"
        }
      },
      {
        name: "draft",
        value: "1",
        domain: "app.example.com",
        session: true
      }
    ],
    origins: [
      {
        origin: "https://app.example.com",
        localStorage: [
          {
            name: "theme",
            value: "dark"
          }
        ],
        sessionStorage: [
          {
            name: "wizard",
            value: "1"
          }
        ]
      }
    ]
  }), {
    cookies: [
      {
        name: "session",
        value: "secret",
        domain: ".example.com",
        path: "/",
        expires: 1800000000,
        httpOnly: true,
        secure: true,
        sameSite: "None",
        partitionKey: "https://app.example.com"
      },
      {
        name: "draft",
        value: "1",
        domain: "app.example.com",
        path: "/",
        expires: -1,
        httpOnly: false,
        secure: false
      }
    ],
    origins: [
      {
        origin: "https://app.example.com",
        localStorage: [
          {
            name: "theme",
            value: "dark"
          }
        ]
      }
    ]
  });
});

test("writes an auth connector extension that can be started from the setup page", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-auth-connector-extension-"));
  try {
    await writeAuthConnectorExtension(tempDir);

    const manifest = JSON.parse(readFileSync(join(tempDir, "manifest.json"), "utf8"));
    const setupScript = readFileSync(join(tempDir, "setup-content.js"), "utf8");

    assert.equal(manifest.name, "OpenRuntime Auth Connector");
    assert.deepEqual(manifest.permissions, ["cookies", "scripting", "tabs"]);
    assert.deepEqual(manifest.icons, {
      "16": "icon-16.png",
      "32": "icon-32.png",
      "48": "icon-48.png",
      "128": "icon-128.png"
    });
    assert.deepEqual(manifest.action.default_icon, {
      "16": "icon-16.png",
      "32": "icon-32.png"
    });
    for (const size of [16, 32, 48, 128]) {
      assert.deepEqual(
        readFileSync(join(tempDir, `icon-${size}.png`)),
        readFileSync(join(process.cwd(), "assets", "auth-connector", `icon-${size}.png`))
      );
    }
    assert.match(setupScript, /openruntime\.auth\.connectorReady/);
    assert.match(setupScript, /openruntime\.auth\.exportComplete/);
    assert.match(setupScript, /openruntime\.auth\.startFromPage/);
  } finally {
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});

test("writes auth connector extension icons from a custom PNG", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-auth-connector-custom-icon-"));
  const iconPath = join(tempDir, "logo.png");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/luzQ9wAAAABJRU5ErkJggg==", "base64");
  try {
    writeFileSync(iconPath, png);
    await writeAuthConnectorExtension(join(tempDir, "extension"), {
      iconPath
    });

    for (const size of [16, 32, 48, 128]) {
      assert.deepEqual(readFileSync(join(tempDir, "extension", `icon-${size}.png`)), png);
    }
  } finally {
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});

test("opens the auth connector setup page in automatic export mode", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-auth-connector-auto-"));
  const outputPath = join(tempDir, "auth.oprprofile");
  let openedUrl: string | undefined;

  try {
    const result = await exportAuthProfileWithConnector({
      requestedUrl: "https://app.example.com/",
      outputPath,
      extensionDirectory: tempDir,
      browserOpener: async (url) => {
        openedUrl = url;
        const setupUrl = new URL(url);
        assert.equal(setupUrl.searchParams.get("openruntimeAuthConnector"), "1");
        assert.equal(setupUrl.searchParams.get("auto"), "1");
        const setupHtml = await (await fetch(url)).text();
        assert.match(setupHtml, /复制扩展目录/);
        assert.match(setupHtml, /安装扩展/);
        assert.match(setupHtml, /highlightInstallStep/);
        assert.match(setupHtml, /reloadToDetectInstalledExtension/);
        assert.match(setupHtml, /rel="icon" type="image\/png" sizes="32x32" href="\/icon-32\.png"/);
        assert.match(setupHtml, /class="brand-icon" src="\/icon-128\.png"/);
        const iconResponse = await fetch(`${setupUrl.origin}/icon-32.png`);
        assert.equal(iconResponse.ok, true);
        assert.equal(iconResponse.headers.get("content-type"), "image/png");
        assert.deepEqual(
          Buffer.from(await iconResponse.arrayBuffer()),
          readFileSync(join(process.cwd(), "assets", "auth-connector", "icon-32.png"))
        );
        const faviconResponse = await fetch(`${setupUrl.origin}/favicon.ico`);
        assert.equal(faviconResponse.ok, true);
        assert.equal(faviconResponse.headers.get("content-type"), "image/png");
        assert.deepEqual(
          Buffer.from(await faviconResponse.arrayBuffer()),
          readFileSync(join(process.cwd(), "assets", "auth-connector", "icon-32.png"))
        );
        const token = setupUrl.searchParams.get("token");
        assert.equal(typeof token, "string");
        const response = await fetch(`${setupUrl.origin}/export?token=${encodeURIComponent(token ?? "")}`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            requestedUrl: "https://app.example.com/",
            cookies: [],
            origins: []
          })
        });
        assert.equal(response.ok, true);
      }
    });

    assert.equal(result.path, outputPath);
    assert.match(openedUrl ?? "", /auto=1/);
    assert.equal(existsSync(outputPath), true);
  } finally {
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});

test("writes oversized profile export content to a temporary file", async () => {
  const output = createOutput();
  const content = `openruntime-profile:v1:auth:${"a".repeat(40_000)}`;
  const exitCode = await runCli(["auth", "export", "--url", "example.com"], {
    stdout: output.stdout,
    stderr: output.stderr,
    authConnectorExporter: async () => ({
      kind: "auth",
      content
    })
  });
  const path = output.text().trim();

  try {
    assert.equal(exitCode, 0);
    assert.equal(output.errorText(), "");
    assert.match(path, /openruntime-profile-export-.+\/openruntime-profile\.oprprofile$/);
    assert.equal(readFileSync(path, "utf8"), `${content}\n`);
  } finally {
    if (path.includes("openruntime-profile-export-") && existsSync(path)) {
      rmSync(dirname(path), {
        recursive: true,
        force: true
      });
    }
  }
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

test("auto-starts a local bridge before listing runtimes", async () => {
  const output = createOutput();
  const stateDirectory = mkdtempSync(join(tmpdir(), "openruntime-cli-state-"));
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
  const stateDirectory = mkdtempSync(join(tmpdir(), "openruntime-cli-state-"));
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

test("matches runtime url when the runtime only adds the OpenRuntime session query", async () => {
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
              url: "http://app.test/?openruntimeSessionId=session-orders",
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
              url: "http://app.test/orders?openruntimeSessionId=session-orders",
              sessionId: "session-orders",
              status: "disconnected",
              connectedAt: 1,
              lastSeenAt: 2,
              disconnectedAt: 3
            },
            {
              runtimeId: "runtime-after-refresh",
              url: "http://app.test/orders?openruntimeSessionId=session-orders",
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
              url: "http://app.test/orders?openruntimeSessionId=session-other",
              status: "connected",
              connectedAt: 1,
              lastSeenAt: 20
            },
            {
              runtimeId: "runtime-orders",
              url: "http://app.test/orders?openruntimeSessionId=session-orders",
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

test("verify passes only when a business target reaches the expected status", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  const exitCode = await runCli([
    "verify",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://app.test/orders",
    "business:orders:risk-panel",
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

      if (String(url) === "http://bridge.test/runtimes/runtime-1/wait-for") {
        return jsonResponse({
          success: true,
          condition: {
            id: "business:orders:risk-panel",
            status: "ready"
          },
          target: {
            id: "business:orders:risk-panel",
            type: "business.component",
            status: "ready",
            source: "orders",
            updatedAt: 10
          },
          snapshot: {
            targets: {
              "business:orders:risk-panel": {
                id: "business:orders:risk-panel",
                type: "business.component",
                status: "ready",
                source: "orders",
                updatedAt: 10
              }
            },
            latestEventId: 1,
            capturedAt: 10
          }
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-1/targets");
      return jsonResponse([
        {
          id: "business:orders:risk-panel",
          type: "business.component",
          source: "orders",
          statuses: ["pending", "ready", "error"],
          registeredAt: 1,
          updatedAt: 10
        }
      ]);
    },
    browserRunner: createBrowserRunner(async (args) => {
      browserCalls.push(args);
      throw new Error("verify should not run a page visibility check when business evidence exists");
    })
  });

  const parsed = JSON.parse(output.text());
  assert.equal(exitCode, 0);
  assert.equal(parsed.result.success, true);
  assert.equal(parsed.result.evidence.level, "business");
  assert.equal(parsed.result.evidence.businessVerified, true);
  assert.equal(parsed.result.visibility.checked, false);
  assert.deepEqual(browserCalls, []);
});

test("verify matches localhost and IPv4 loopback runtime URLs", async () => {
  const output = createOutput();
  const exitCode = await runCli([
    "verify",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://localhost:3000/orders",
    "business:orders:risk-panel",
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
              runtimeId: "runtime-loopback",
              url: "http://127.0.0.1:3000/orders",
              status: "connected",
              connectedAt: 1,
              lastSeenAt: 2
            }
          ]
        });
      }

      if (String(url) === "http://bridge.test/runtimes/runtime-loopback/wait-for") {
        return jsonResponse({
          success: true,
          condition: {
            id: "business:orders:risk-panel",
            status: "ready"
          },
          target: {
            id: "business:orders:risk-panel",
            type: "business.component",
            status: "ready",
            source: "orders",
            updatedAt: 10
          },
          snapshot: {
            targets: {
              "business:orders:risk-panel": {
                id: "business:orders:risk-panel",
                type: "business.component",
                status: "ready",
                source: "orders",
                updatedAt: 10
              }
            },
            latestEventId: 1,
            capturedAt: 10
          }
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-loopback/targets");
      return jsonResponse([
        {
          id: "business:orders:risk-panel",
          type: "business.component",
          source: "orders",
          statuses: ["pending", "ready", "error"],
          registeredAt: 1,
          updatedAt: 10
        }
      ]);
    }
  });

  const parsed = JSON.parse(output.text());
  assert.equal(exitCode, 0);
  assert.equal(parsed.runtime.runtimeId, "runtime-loopback");
  assert.equal(parsed.result.evidence.businessVerified, true);
});

test("verify does not treat a ready Modern route as business success when the page is blank", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  const exitCode = await runCli([
    "verify",
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

      if (String(url) === "http://bridge.test/runtimes/runtime-1/wait-for") {
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
            source: "modern",
            updatedAt: 10
          },
          snapshot: {
            targets: {
              "modern:route": {
                id: "modern:route",
                type: "modern.route",
                status: "ready",
                source: "modern",
                updatedAt: 10
              }
            },
            latestEventId: 1,
            capturedAt: 10
          }
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-1/targets");
      return jsonResponse([
        {
          id: "modern:route",
          type: "modern.route",
          source: "modern",
          statuses: ["loading", "ready", "error"],
          registeredAt: 1,
          updatedAt: 10
        }
      ]);
    },
    browserRunner: createBrowserRunner(async (args) => {
      browserCalls.push(args);
      assert.equal(args[0], "eval");
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          blank: true,
          url: "http://app.test/orders",
          title: "",
          textLength: 0,
          visibleElementCount: 0,
          bodyChildElementCount: 0,
          rootChildElementCount: 0
        }),
        stderr: ""
      };
    })
  });

  const parsed = JSON.parse(output.text());
  assert.equal(exitCode, 1);
  assert.equal(parsed.result.success, false);
  assert.equal(parsed.result.evidence.level, "runtime");
  assert.equal(parsed.result.evidence.targetClass, "modern");
  assert.equal(parsed.result.evidence.businessVerified, false);
  assert.equal(parsed.result.visibility.status, "blank");
  assert.match(parsed.result.evidence.nextStep, /blank page/);
  assert.equal(browserCalls.length, 1);
});

test("verify reports MF readiness as runtime-layer evidence when no business target exists", async () => {
  const output = createOutput();
  const exitCode = await runCli([
    "verify",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://app.test/orders",
    "mf:remote:orders:expose:RiskPanel",
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

      if (String(url) === "http://bridge.test/runtimes/runtime-1/wait-for") {
        return jsonResponse({
          success: true,
          condition: {
            id: "mf:remote:orders:expose:RiskPanel",
            status: "ready"
          },
          target: {
            id: "mf:remote:orders:expose:RiskPanel",
            type: "mf.remote.expose",
            status: "ready",
            source: "module-federation",
            updatedAt: 10
          },
          snapshot: {
            targets: {
              "mf:remote:orders:expose:RiskPanel": {
                id: "mf:remote:orders:expose:RiskPanel",
                type: "mf.remote.expose",
                status: "ready",
                source: "module-federation",
                updatedAt: 10
              }
            },
            latestEventId: 1,
            capturedAt: 10
          }
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-1/targets");
      return jsonResponse([
        {
          id: "mf:remote:orders:expose:RiskPanel",
          type: "mf.remote.expose",
          source: "module-federation",
          statuses: ["pending", "ready", "error"],
          registeredAt: 1,
          updatedAt: 10
        }
      ]);
    },
    browserRunner: createBrowserRunner(async () => ({
      exitCode: 0,
      stdout: JSON.stringify({
        blank: false,
        url: "http://app.test/orders",
        title: "Orders",
        textLength: 24,
        visibleElementCount: 4,
        bodyChildElementCount: 1,
        rootChildElementCount: 1
      }),
      stderr: ""
    }))
  });

  const parsed = JSON.parse(output.text());
  assert.equal(exitCode, 1);
  assert.equal(parsed.result.success, false);
  assert.equal(parsed.result.evidence.level, "runtime");
  assert.equal(parsed.result.evidence.targetClass, "module-federation");
  assert.equal(parsed.result.evidence.businessVerified, false);
  assert.equal(parsed.result.visibility.status, "visible");
  assert.match(parsed.result.evidence.nextStep, /business target/);
});

test("verify suggests an existing business target instead of running a blank-page fallback", async () => {
  const output = createOutput();
  const browserCalls: string[][] = [];
  const exitCode = await runCli([
    "verify",
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

      if (String(url) === "http://bridge.test/runtimes/runtime-1/wait-for") {
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
            source: "modern",
            updatedAt: 10
          },
          snapshot: {
            targets: {
              "modern:route": {
                id: "modern:route",
                type: "modern.route",
                status: "ready",
                source: "modern",
                updatedAt: 10
              },
              "business:orders:risk-panel": {
                id: "business:orders:risk-panel",
                type: "business.component",
                status: "ready",
                source: "orders",
                updatedAt: 11
              }
            },
            latestEventId: 2,
            capturedAt: 11
          }
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-1/targets");
      return jsonResponse([]);
    },
    browserRunner: createBrowserRunner(async (args) => {
      browserCalls.push(args);
      throw new Error("verify should not run visibility when business target hints exist");
    })
  });

  const parsed = JSON.parse(output.text());
  assert.equal(exitCode, 1);
  assert.equal(parsed.result.success, false);
  assert.deepEqual(parsed.result.evidence.businessTargetHints, ["business:orders:risk-panel"]);
  assert.match(parsed.result.evidence.nextStep, /business:orders:risk-panel/);
  assert.equal(parsed.result.visibility.checked, false);
  assert.deepEqual(browserCalls, []);
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

test("recognizes a bin symlink as the cli entrypoint", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-cli-"));
  try {
    const entry = join(process.cwd(), "dist", "index.js");
    const bin = join(tempDir, "openruntime");
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

function commandOutput(command: string, data: unknown, message: string | undefined = undefined): unknown {
  return {
    status: "ok",
    ...(message === undefined ? {} : { message }),
    data,
    meta: {
      version: 1,
      command
    }
  };
}

function assertOpenOutput(
  text: string,
  expected: {
    command: string;
    url: string;
    openedUrl: string;
    normalizedUrl: string;
    bridgeUrl: string | null;
    sessionId: string;
  }
): void {
  const parsed = JSON.parse(text);
  assert.equal(parsed.status, "ok");
  assert.equal(parsed.message, "Page opened.");
  assert.deepEqual(parsed.meta, {
    version: 1,
    command: expected.command
  });
  assert.equal(parsed.data.url, expected.url);
  assert.equal(parsed.data.openedUrl, expected.openedUrl);
  assert.equal(parsed.data.normalizedUrl, expected.normalizedUrl);
  assert.equal(parsed.data.bridgeUrl, expected.bridgeUrl);
  assert.equal(parsed.data.sessionId, expected.sessionId);
  assert.equal(typeof parsed.data.openedAt, "number");
}

function errorOutput(
  command: string,
  error: {
    code: string;
    kind: string;
    message: string;
    retryable: boolean;
    hint?: string;
    details?: Record<string, unknown>;
  }
): unknown {
  return {
    status: "error",
    message: error.message,
    error: {
      code: error.code,
      kind: error.kind,
      retryable: error.retryable,
      ...(error.hint === undefined ? {} : { hint: error.hint }),
      ...(error.details === undefined ? {} : { details: error.details })
    },
    meta: {
      version: 1,
      command
    }
  };
}

function createOpenContextFixture(overrides: Partial<{
  url: string;
  normalizedUrl: string;
  bridgeUrl: string | null;
  sessionId: string | null;
}> = {}): { operationLogDirectory: string; cleanup(): void } {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "openruntime-cli-operations-"));
  const key = createOperationLogKey(process.cwd());
  const entry = {
    schemaVersion: 1,
    command: "open",
    key,
    cwd: process.cwd(),
    url: overrides.url ?? "http://app.test/",
    normalizedUrl: overrides.normalizedUrl ?? "http://app.test/",
    bridgeUrl: overrides.bridgeUrl ?? "http://bridge.test",
    sessionId: overrides.sessionId ?? "session-open",
    openedAt: 1,
    exitCode: 0
  };
  writeFileSync(join(operationLogDirectory, `${key}.json`), `${JSON.stringify(entry, null, 2)}\n`, "utf8");
  return {
    operationLogDirectory,
    cleanup: () => {
      rmSync(operationLogDirectory, {
        recursive: true,
        force: true
      });
    }
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
  run: (args: string[], options?: BrowserRunOptions) => Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>
): BrowserRunner {
  return {
    run
  };
}
