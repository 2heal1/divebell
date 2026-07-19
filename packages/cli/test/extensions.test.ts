import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "@rstest/core";

import { createOpenRuntimeCliWithExternalExtensions, createOpenRuntimeCli, runCli, type OpenRuntimeCliExtension } from "../dist/index.js";

import { commandOutput, createBrowserRunner, createOpenContextFixture, createOutput, jsonResponse } from "./helpers.js";

test("installs, loads, lists, and removes a self-contained npm command package", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-command-package-test-"));
  const commandsDirectory = join(tempDir, "commands");
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
      commands: ["./index.mjs"]
    }
  }, null, 2)}\n`, "utf8");
  writeFileSync(join(packageRoot, "index.mjs"), `export default {
  schemaVersion: 1,
  name: "hello-installed",
  commandReferences: [{ category: "Commands", usage: "openruntime hello-installed", description: "Runs installed command." }],
  async run({ output }) { output.ok({ installed: true }); return 0; }
};\n`, "utf8");
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
      commands: ["./index.mjs"]
    }
  }, null, 2)}\n`, "utf8");
  writeFileSync(join(updatedPackageRoot, "index.mjs"), `export default {
  schemaVersion: 1,
  name: "hello-installed",
  commandReferences: [{ category: "Commands", usage: "openruntime hello-installed", description: "Runs updated command." }],
  async run({ output }) { output.ok({ installed: true, updated: true }); return 0; }
};\n`, "utf8");
  const updatedTarResult = spawnSync("tar", ["-czf", updatedArchivePath, "-C", join(tempDir, "fixture-updated"), "package"], {
    encoding: "utf8"
  });
  assert.equal(updatedTarResult.status, 0, updatedTarResult.stderr);

  try {
    const cli = createOpenRuntimeCli();
    const addOutput = createOutput();
    const addExitCode = await cli.run([
      "commands",
      "add",
      "@demo/command-hello"
    ], {
      stdout: addOutput.stdout,
      stderr: addOutput.stderr,
      commandsDirectory,
      commandPackageDownloader: {
        download: async () => archivePath
      }
    });
    assert.equal(addExitCode, 0);
    assert.equal(JSON.parse(addOutput.text()).package.name, "@demo/command-hello");

    const loaded = await createOpenRuntimeCliWithExternalExtensions({}, {
      ...process.env,
      OPENRUNTIME_COMMANDS_DIR: commandsDirectory,
      OPENRUNTIME_DISABLE_COMMANDS: "0"
    });
    assert.deepEqual(loaded.cli.extensions.map((item) => item.name), ["hello-installed"]);
    const commandOutputBuffer = createOutput();
    assert.equal(await loaded.cli.run(["hello-installed"], {
      stdout: commandOutputBuffer.stdout,
      stderr: commandOutputBuffer.stderr
    }), 0);
    assert.deepEqual(JSON.parse(commandOutputBuffer.text()), commandOutput("hello-installed", {
      installed: true
    }));

    const listOutput = createOutput();
    assert.equal(await cli.run(["commands", "list"], {
      stdout: listOutput.stdout,
      stderr: listOutput.stderr,
      commandsDirectory
    }), 0);
    assert.deepEqual(JSON.parse(listOutput.text()).packages[0].commands, ["hello-installed"]);

    const failedUpdateOutput = createOutput();
    assert.equal(await cli.run(["commands", "update", "@demo/command-hello"], {
      stdout: failedUpdateOutput.stdout,
      stderr: failedUpdateOutput.stderr,
      commandsDirectory,
      commandPackageDownloader: {
        download: async () => {
          throw new Error("simulated download failure");
        }
      }
    }), 1);
    const afterFailedUpdateOutput = createOutput();
    assert.equal(await cli.run(["commands", "list"], {
      stdout: afterFailedUpdateOutput.stdout,
      stderr: afterFailedUpdateOutput.stderr,
      commandsDirectory
    }), 0);
    assert.equal(JSON.parse(afterFailedUpdateOutput.text()).packages[0].version, "1.0.0");

    const updateOutput = createOutput();
    assert.equal(await cli.run(["commands", "update", "@demo/command-hello"], {
      stdout: updateOutput.stdout,
      stderr: updateOutput.stderr,
      commandsDirectory,
      commandPackageDownloader: {
        download: async () => updatedArchivePath
      }
    }), 0);
    assert.equal(JSON.parse(updateOutput.text()).package.version, "1.1.0");

    const updated = await createOpenRuntimeCliWithExternalExtensions({}, {
      ...process.env,
      OPENRUNTIME_COMMANDS_DIR: commandsDirectory,
      OPENRUNTIME_DISABLE_COMMANDS: "0"
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
    assert.equal(await cli.run(["commands", "remove", "@demo/command-hello"], {
      stdout: removeOutput.stdout,
      stderr: removeOutput.stderr,
      commandsDirectory
    }), 0);
    assert.equal(JSON.parse(removeOutput.text()).status, "removed");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("rejects npm command packages that declare runtime dependencies", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-command-package-dependency-test-"));
  const commandsDirectory = join(tempDir, "commands");
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
      commands: ["./index.mjs"]
    }
  }, null, 2)}\n`, "utf8");
  writeFileSync(join(packageRoot, "index.mjs"), `export default {
  schemaVersion: 1,
  name: "dependent",
  async run() { return 0; }
};\n`, "utf8");
  const tarResult = spawnSync("tar", ["-czf", archivePath, "-C", join(tempDir, "fixture"), "package"], {
    encoding: "utf8"
  });
  assert.equal(tarResult.status, 0, tarResult.stderr);

  try {
    const output = createOutput();
    const exitCode = await createOpenRuntimeCli().run([
      "commands",
      "add",
      "@demo/command-dependent"
    ], {
      stdout: output.stdout,
      stderr: output.stderr,
      commandsDirectory,
      commandPackageDownloader: {
        download: async () => archivePath
      }
    });
    assert.equal(exitCode, 1);
    assert.match(output.text(), /must not declare dependencies/);
    assert.equal(output.errorText(), "");

    const listOutput = createOutput();
    assert.equal(await createOpenRuntimeCli().run(["commands", "list"], {
      stdout: listOutput.stdout,
      stderr: listOutput.stderr,
      commandsDirectory
    }), 0);
    assert.deepEqual(JSON.parse(listOutput.text()).packages, []);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
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
      hasEnsureBridgeApi: true,
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

test("exposes memory capture commands to CLI extensions", async () => {
  const extension: OpenRuntimeCliExtension = {
    name: "memory-demo",
    run: async ({ openruntime, output }) => {
      output.ok({
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
      });
      return 0;
    }
  };
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
  const extension: OpenRuntimeCliExtension = {
    name: "coverage-demo",
    run: async ({ openruntime, output }) => {
      output.ok({
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
      });
      return 0;
    }
  };
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
