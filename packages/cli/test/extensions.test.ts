import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "@rstest/core";

import { createOpenRuntimeCliWithExternalExtensions, createOpenRuntimeCli, runCli, type OpenRuntimeCliExtension } from "../dist/index.js";

import { commandOutput, createBrowserRunner, createOpenContextFixture, createOutput, jsonResponse } from "./helpers.js";

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

test("shows and resolves command skills without running commands", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-command-skill-"));
  const skillPath = join(tempDir, "SKILL.md");
  writeFileSync(skillPath, "# Demo skill\n", "utf8");
  let runCount = 0;

  try {
    const cli = createOpenRuntimeCli({
      extensions: [
        {
          name: "demo",
          skill: { path: skillPath },
          commandReferences: [
            {
              category: "Commands",
              usage: "openruntime demo ping",
              description: "Runs demo."
            }
          ],
          run: async () => {
            runCount += 1;
            return 0;
          }
        },
        {
          name: "plain",
          commandReferences: [
            {
              category: "Commands",
              usage: "openruntime plain ping",
              description: "Runs without a skill."
            }
          ],
          run: async () => {
            runCount += 1;
            return 0;
          }
        }
      ]
    });

    const help = cli.createHelpText();
    assert.match(help, /openruntime demo ping - Runs demo\./);
    assert.match(help, /openruntime plain ping - Runs without a skill\./);
    assert.match(help, /Skill: available for demo\./);
    assert.match(help, /Skill usage: `openruntime <command> --skill`/);
    assert.doesNotMatch(help, /Examples:/);

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
  const skillPath = join(tempDir, "SKILL.md");
  try {
    writeFileSync(skillPath, "# Foo skill\n", "utf8");
    writeFileSync(join(tempDir, "foo.mjs"), [
      "export default {",
      "  schemaVersion: 1,",
      "  name: 'foo',",
      "  displayName: 'Foo',",
      "  description: 'Foo command',",
      `  skill: { path: ${JSON.stringify(skillPath)} },`,
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
    assert.match(loaded.cli.createHelpText(), /openruntime foo ping - Runs Foo\./);
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
    assert.deepEqual(JSON.parse(output.text()), {
      command: ["foo", "ping"],
      value: {
        ok: true
      }
    });

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
    assert.match(helpOutput.text(), /External Commands:/);
    assert.match(helpOutput.text(), /openruntime foo ping - Runs Foo\./);
    assert.match(helpOutput.text(), /Skill: available for foo\./);
    assert.doesNotMatch(helpOutput.text(), /Examples:/);
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

test("warns when runCli skips an external command", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-external-commands-warning-"));
  try {
    writeFileSync(join(tempDir, "snapshot.mjs"), [
      "export default {",
      "  schemaVersion: 1,",
      "  name: 'snapshot',",
      "  async run() { return 0; }",
      "};",
      ""
    ].join("\n"));

    const result = spawnSync(process.execPath, [join(process.cwd(), "dist", "index.js"), "--help"], {
      encoding: "utf8",
      env: {
        ...process.env,
        OPENRUNTIME_DISABLE_COMMANDS: "0",
        OPENRUNTIME_COMMANDS_DIR: tempDir
      }
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /Skipped external OpenRuntime command/);
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
