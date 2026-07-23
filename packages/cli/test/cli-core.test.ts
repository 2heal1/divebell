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
  assert.match(output.text(), /openruntime profiles/);
  assert.match(output.text(), /openruntime state save <path> \[--url <url>\]/);
  assert.match(output.text(), /openruntime state load <path>/);
  assert.match(output.text(), /openruntime auth save <name>/);
  assert.match(output.text(), /openruntime auth login <name>/);
  assert.doesNotMatch(output.text(), /openruntime auth export/);
  assert.doesNotMatch(output.text(), /openruntime auth import/);
  assert.doesNotMatch(output.text(), /openruntime export-profile /);
  assert.doesNotMatch(output.text(), /openruntime import-profile /);
  assert.doesNotMatch(output.text(), /openruntime profile /);
  assert.match(output.text(), /openruntime network \[--url <query>\]/);
  assert.match(output.text(), /openruntime console \[--level <level>\] \[--query <keyword>\] \[--limit <n>\]/);
  assert.doesNotMatch(output.text(), /openruntime verify /);
  assert.match(output.text(), /openruntime wait-for .*--next/);
  assert.match(output.text(), /openruntime snapshot .* - Read the current snapshot state from the selected runtime\./);
  assert.match(output.text(), /openruntime wait-for .* - Wait for a target to reach a status/);
  assert.match(output.text(), /openruntime extensions list/);
  assert.match(output.text(), /openruntime stack/);
  assert.doesNotMatch(output.text(), /openruntime goto /);
  assert.doesNotMatch(output.text(), /openruntime close/);
  assert.doesNotMatch(output.text(), /\[--open\]/);
  assert.doesNotMatch(output.text(), /openruntime vmok /);
  assert.doesNotMatch(output.text(), /open[-]runtime/);
  assert.doesNotMatch(output.text(), /Examples:/);
  assert.doesNotMatch(output.text(), /Skill: available/);
  assert.doesNotMatch(output.text(), /\p{Script=Han}/u);
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
  assert.match(markdown, /openruntime extensions list/);
  assert.match(markdown, /openruntime stack/);
  assert.doesNotMatch(markdown, /openruntime goto /);
  assert.doesNotMatch(markdown, /openruntime close/);
  assert.doesNotMatch(markdown, /\[--open\]/);
  assert.doesNotMatch(markdown, /\p{Script=Han}/u);
  assert.doesNotMatch(markdown, /openruntime vmok /);
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
