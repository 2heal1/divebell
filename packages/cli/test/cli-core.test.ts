import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "@rstest/core";

import { cliPackageInfo, defineCommand, getCliCommandName, runCli, validateCommand } from "../dist/index.js";
import { isEntryPoint } from "../dist/entry.js";
import { createCliReferenceMarkdown } from "../dist/help.js";

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
