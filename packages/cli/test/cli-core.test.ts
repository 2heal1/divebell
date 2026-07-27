import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "@rstest/core";

import { cliPackageInfo, defineExtension, getCliCommandName, runCli, validateExtension } from "../dist/index.js";
import { isEntryPoint } from "../dist/utils/entry.js";
import { createCliReferenceMarkdown } from "../dist/commands/help.js";

import { createBrowserRunner, createOutput } from "./helpers.js";

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

test("defines and validates extension exports", () => {
  const extension = defineExtension({
    schemaVersion: 1,
    name: "demo",
    commands: [{
      name: "demo",
      commandReferences: [{
        category: "Extensions",
        usage: "openruntime demo ping",
        description: "Runs demo."
      }],
      async run() { return 0; }
    }]
  });

  assert.equal(extension.name, "demo");
  assert.equal(validateExtension(extension).name, "demo");
  assert.throws(
    () => validateExtension({
      schemaVersion: 1,
      name: "broken"
    }),
    /must provide at least one command or hook/
  );
  assert.throws(
    () => defineExtension({
      schemaVersion: 1,
      name: "broken-skill",
      commands: [{ name: "broken-skill", skill: { path: "SKILL.md" }, async run() { return 0; } }]
    }),
    /skill\.path must be an absolute path to SKILL\.md/
  );
  assert.throws(
    () => defineExtension({
      schemaVersion: 1,
      name: "missing-skill",
      commands: [{
        name: "missing-skill",
        skill: { path: join(tmpdir(), "openruntime-missing-skill", "SKILL.md") },
        async run() { return 0; }
      }]
    }),
    /skill does not exist/
  );
});

test("prints compact top-level help", async () => {
  const output = createOutput();
  const exitCode = await runCli(["--help"], {
    stdout: output.stdout,
    stderr: output.stderr
  });

  assert.equal(exitCode, 0);
  assert.equal(output.errorText(), "");
  assert.match(output.text(), /^Usage: openruntime <command> \[options\]/);
  assert.match(output.text(), /openruntime snapshot - Read the current snapshot state/);
  assert.match(output.text(), /openruntime open - Open a directory-scoped page/);
  assert.match(output.text(), /openruntime profiles - List Chrome profiles/);
  assert.match(output.text(), /openruntime state - Inspect and manage/);
  assert.match(output.text(), /openruntime auth - Inspect or delete/);
  assert.match(output.text(), /openruntime extensions - Install, list, update, or remove/);
  assert.match(output.text(), /Run `openruntime <command> --help` for detailed usage\./);
  assert.doesNotMatch(output.text(), /openruntime extensions (add|list|update|remove)/);
  assert.doesNotMatch(output.text(), /openruntime state (save|load)/);
  assert.doesNotMatch(output.text(), /openruntime auth (save|login)/);
  assert.doesNotMatch(output.text(), /--id <id>/);
  assert.doesNotMatch(output.text(), /--target-id <id>/);
  assert.doesNotMatch(output.text(), /--ui/);
  assert.doesNotMatch(output.text(), /openruntime auth export/);
  assert.doesNotMatch(output.text(), /openruntime auth import/);
  assert.doesNotMatch(output.text(), /openruntime export-profile /);
  assert.doesNotMatch(output.text(), /openruntime import-profile /);
  assert.doesNotMatch(output.text(), /openruntime profile /);
  assert.doesNotMatch(output.text(), /openruntime verify /);
  assert.match(output.text(), /openruntime stack/);
  assert.doesNotMatch(output.text(), /openruntime goto /);
  assert.doesNotMatch(output.text(), /openruntime close/);
  assert.doesNotMatch(output.text(), /\[--open\]/);
  assert.doesNotMatch(output.text(), /open[-]runtime/);
  assert.doesNotMatch(output.text(), /Examples:/);
  assert.doesNotMatch(output.text(), /Skill: available/);
  assert.doesNotMatch(output.text(), /\p{Script=Han}/u);
});

test("prints progressively scoped command help", async () => {
  const extensionsOutput = createOutput();
  assert.equal(await runCli(["extensions", "--help"], {
    stdout: extensionsOutput.stdout,
    stderr: extensionsOutput.stderr
  }), 0);
  assert.equal(extensionsOutput.errorText(), "");
  assert.match(extensionsOutput.text(), /openruntime extensions add <package-or-path>/);
  assert.doesNotMatch(extensionsOutput.text(), /<npm-package>/);
  assert.match(extensionsOutput.text(), /openruntime extensions list/);
  assert.match(extensionsOutput.text(), /openruntime extensions update <package>/);
  assert.match(extensionsOutput.text(), /openruntime extensions remove <package>/);
  assert.doesNotMatch(extensionsOutput.text(), /openruntime snapshot/);

  const addOutput = createOutput();
  assert.equal(await runCli(["extensions", "add", "--help"], {
    stdout: addOutput.stdout,
    stderr: addOutput.stderr
  }), 0);
  assert.equal(addOutput.errorText(), "");
  assert.match(addOutput.text(), /openruntime extensions add <package-or-path>/);
  assert.doesNotMatch(addOutput.text(), /<npm-package>/);
  assert.doesNotMatch(addOutput.text(), /openruntime extensions (list|update|remove)/);

  const stateOutput = createOutput();
  assert.equal(await runCli(["state", "list", "--help"], {
    stdout: stateOutput.stdout,
    stderr: stateOutput.stderr
  }), 0);
  assert.match(stateOutput.text(), /openruntime state <list\|show\|rename\|clear\|clean>/);
  assert.doesNotMatch(stateOutput.text(), /openruntime state (save|load)/);
});

test("rejects the removed close command", async () => {
  const output = createOutput();
  const exitCode = await runCli(["close"], {
    stdout: output.stdout,
    stderr: output.stderr
  });

  assert.equal(exitCode, 1);
  assert.equal(output.errorText(), "");
  const error = JSON.parse(output.text());
  assert.equal(error.error.code, "CLI_UNKNOWN_COMMAND");
  assert.match(error.message, /Unknown command "close"/);
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
    assert.match(output.text(), new RegExp(`openruntime ${command}(?: |$)`));
    assert.doesNotMatch(output.text(), /openruntime extensions/);
    assert.equal(touchedSideEffect, false);
  }
});

test("rejects unknown scoped help", async () => {
  const output = createOutput();
  const exitCode = await runCli(["unknown", "--help"], {
    stdout: output.stdout,
    stderr: output.stderr
  });

  assert.equal(exitCode, 1);
  assert.equal(output.errorText(), "");
  assert.equal(JSON.parse(output.text()).error.code, "CLI_UNKNOWN_COMMAND");
  assert.doesNotMatch(output.text(), /Bridge and Browser:/);
});

test("generates CLI reference markdown from the help table", () => {
  const markdown = createCliReferenceMarkdown();

  assert.match(markdown, /openruntime open <url>/);
  assert.match(markdown, /openruntime open <url> \[--headers <json>\]/);
  assert.match(markdown, /openruntime profiles/);
  assert.match(markdown, /openruntime state save <path> \[--url <url>\]/);
  assert.match(markdown, /openruntime state load <path>/);
  assert.match(markdown, /openruntime auth save <name>/);
  assert.match(markdown, /openruntime auth login <name>/);
  assert.doesNotMatch(markdown, /openruntime auth export/);
  assert.doesNotMatch(markdown, /openruntime auth import/);
  assert.doesNotMatch(markdown, /openruntime export-profile /);
  assert.doesNotMatch(markdown, /openruntime import-profile /);
  assert.doesNotMatch(markdown, /openruntime profile /);
  assert.match(markdown, /openruntime get-window <path>/);
  assert.match(markdown, /openruntime network \[--url <query>\]/);
  assert.doesNotMatch(markdown, /openruntime memory /);
  assert.doesNotMatch(markdown, /openruntime code-usage /);
  assert.doesNotMatch(markdown, /openruntime record /);
  assert.match(markdown, /openruntime coverage <status\|start\|take\|stop\|cancel>/);
  assert.doesNotMatch(markdown, /openruntime verify /);
  assert.match(markdown, /openruntime wait-for .*<target-id> <status>.*--next/);
  assert.match(markdown, /openruntime extensions add <package-or-path>/);
  assert.doesNotMatch(markdown, /<npm-package>/);
  assert.match(markdown, /openruntime extensions list/);
  assert.match(markdown, /openruntime stack/);
  assert.doesNotMatch(markdown, /openruntime goto /);
  assert.doesNotMatch(markdown, /openruntime close/);
  assert.doesNotMatch(markdown, /\[--open\]/);
  assert.doesNotMatch(markdown, /\p{Script=Han}/u);
  assert.doesNotMatch(markdown, /open[-]runtime/);
  assert.doesNotMatch(markdown, /## Examples/);
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
