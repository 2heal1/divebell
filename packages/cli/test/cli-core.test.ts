import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "@rstest/core";

import { cliPackageInfo, createDivebellCli, defineExtension, getCliCommandName, runCli, validateExtension } from "../dist/index.js";
import { isEntryPoint } from "../dist/utils/entry.js";
import { createCliReferenceMarkdown } from "../dist/commands/help.js";

import { createBrowserRunner, createOutput } from "./helpers.js";

test("exposes the cli package marker", () => {
  assert.equal(getCliCommandName(), "divebell");
  assert.deepEqual(cliPackageInfo, {
    name: "@divebell/cli",
    phase: "phase-0",
    role: "agent command line"
  });
});

test("exposes only canonical cli binaries", () => {
  const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));

  assert.deepEqual(Object.keys(packageJson.bin), ["divebell"]);
});

test("defines and validates extension exports", () => {
  const extension = defineExtension({
    schemaVersion: 1,
    name: "demo",
    commands: [{
      name: "demo",
      commandReferences: [{
        category: "Extensions",
        usage: "divebell demo ping",
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
        skill: { path: join(tmpdir(), "divebell-missing-skill", "SKILL.md") },
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
  assert.match(output.text(), /^Usage: divebell <command> \[options\]/);
  assert.match(output.text(), /\nCLI:\n/);
  assert.match(output.text(), /\nBrowser:\n/);
  assert.doesNotMatch(output.text(), /Bridge and Browser:/);
  assert.match(output.text(), /divebell snapshot - Read the current snapshot state/);
  assert.match(output.text(), /divebell open - Open a directory-scoped page/);
  assert.match(output.text(), /divebell profiles - List Chrome profiles/);
  assert.match(output.text(), /divebell state - Inspect and manage/);
  assert.match(output.text(), /divebell auth - Inspect or delete/);
  assert.match(output.text(), /divebell extensions - Install, list, update, or remove/);
  assert.match(output.text(), /Run `divebell <command> --help` \(or `-h`\) for detailed usage\./);
  assert.match(output.text(), /Run `divebell skill` to print the bundled Divebell CLI Skill path\./);
  assert.match(
    output.text(),
    /For an Extension command Skill, first run `divebell --help`, then run `divebell <command> --skill`\./
  );
  assert.doesNotMatch(output.text(), /divebell extensions (add|list|update|remove)/);
  assert.doesNotMatch(output.text(), /divebell state (save|load)/);
  assert.doesNotMatch(output.text(), /divebell auth (save|login)/);
  assert.doesNotMatch(output.text(), /--id <id>/);
  assert.doesNotMatch(output.text(), /--target-id <id>/);
  assert.doesNotMatch(output.text(), /--ui/);
  assert.doesNotMatch(output.text(), /divebell auth export/);
  assert.doesNotMatch(output.text(), /divebell auth import/);
  assert.doesNotMatch(output.text(), /divebell export-profile /);
  assert.doesNotMatch(output.text(), /divebell import-profile /);
  assert.doesNotMatch(output.text(), /divebell profile /);
  assert.match(output.text(), /divebell stack/);
  assert.match(output.text(), /divebell goto /);
  assert.match(output.text(), /divebell wait /);
  assert.match(output.text(), /divebell hover /);
  assert.match(output.text(), /divebell tab /);
  assert.match(output.text(), /divebell a11y /);
  assert.match(output.text(), /divebell video /);
  assert.doesNotMatch(output.text(), /divebell record /);
  assert.doesNotMatch(output.text(), /divebell close/);
  assert.doesNotMatch(output.text(), /\[--open\]/);
  assert.doesNotMatch(output.text(), /open[-]runtime/);
  assert.doesNotMatch(output.text(), /Examples:/);
  assert.doesNotMatch(output.text(), /Skill: available/);
  assert.doesNotMatch(output.text(), /\p{Script=Han}/u);
});

test("prints the bundled Divebell CLI Skill path without resolving Extension Skills", async () => {
  const output = createOutput();
  const exitCode = await runCli(["skill"], {
    stdout: output.stdout,
    stderr: output.stderr
  });
  assert.equal(exitCode, 0, output.text());

  const skillPath = output.text().trim();
  assert.match(skillPath, /SKILL(?:\.[a-f0-9]+)?\.md$/);
  assert.equal(output.errorText(), "");
});

test("rejects arguments and options for the bundled Divebell CLI Skill", async () => {
  const output = createOutput();
  assert.equal(await runCli(["skill", "extension"], {
    stdout: output.stdout,
    stderr: output.stderr
  }), 1);
  assert.match(output.text(), /The Divebell CLI skill command does not accept arguments or options\./);
  assert.match(output.text(), /Run `divebell skill` to print the bundled Divebell CLI Skill path\./);
});

test("accepts the short help flag", async () => {
  const topLevelOutput = createOutput();
  assert.equal(await runCli(["-h"], {
    stdout: topLevelOutput.stdout,
    stderr: topLevelOutput.stderr
  }), 0);
  assert.match(topLevelOutput.text(), /^Usage: divebell <command> \[options\]/);

  const commandOutput = createOutput();
  assert.equal(await runCli(["extensions", "-h"], {
    stdout: commandOutput.stdout,
    stderr: commandOutput.stderr
  }), 0);
  assert.match(commandOutput.text(), /divebell extensions add <package-or-path>/);
});

test("prints the installed package version with long and short flags", async () => {
  const packageJson = JSON.parse(
    readFileSync(join(process.cwd(), "package.json"), "utf8")
  ) as { version: string };

  for (const flag of ["--version", "-v"]) {
    const output = createOutput();
    assert.equal(await runCli([flag], {
      stdout: output.stdout,
      stderr: output.stderr
    }), 0);
    assert.equal(output.text(), `${packageJson.version}\n`);
    assert.equal(output.errorText(), "");
  }

  const programmaticOutput = createOutput();
  assert.equal(await createDivebellCli().run(["--version"], {
    stdout: programmaticOutput.stdout,
    stderr: programmaticOutput.stderr
  }), 0);
  assert.equal(programmaticOutput.text(), `${packageJson.version}\n`);
  assert.equal(programmaticOutput.errorText(), "");
});

test("prints progressively scoped command help", async () => {
  const extensionsOutput = createOutput();
  assert.equal(await runCli(["extensions", "--help"], {
    stdout: extensionsOutput.stdout,
    stderr: extensionsOutput.stderr
  }), 0);
  assert.equal(extensionsOutput.errorText(), "");
  assert.match(extensionsOutput.text(), /divebell extensions add <package-or-path>/);
  assert.doesNotMatch(extensionsOutput.text(), /<npm-package>/);
  assert.match(extensionsOutput.text(), /divebell extensions list/);
  assert.match(extensionsOutput.text(), /divebell extensions update <package>/);
  assert.match(extensionsOutput.text(), /divebell extensions remove <package>/);
  assert.doesNotMatch(extensionsOutput.text(), /divebell snapshot/);

  const addOutput = createOutput();
  assert.equal(await runCli(["extensions", "add", "--help"], {
    stdout: addOutput.stdout,
    stderr: addOutput.stderr
  }), 0);
  assert.equal(addOutput.errorText(), "");
  assert.match(addOutput.text(), /divebell extensions add <package-or-path>/);
  assert.doesNotMatch(addOutput.text(), /<npm-package>/);
  assert.doesNotMatch(addOutput.text(), /divebell extensions (list|update|remove)/);

  const stateOutput = createOutput();
  assert.equal(await runCli(["state", "list", "--help"], {
    stdout: stateOutput.stdout,
    stderr: stateOutput.stderr
  }), 0);
  assert.match(stateOutput.text(), /divebell state <list\|show\|rename\|clear\|clean>/);
  assert.doesNotMatch(stateOutput.text(), /divebell state (save|load)/);
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
    assert.match(output.text(), new RegExp(`divebell ${command}(?: |$)`));
    assert.doesNotMatch(output.text(), /divebell extensions/);
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
  assert.doesNotMatch(output.text(), /Browser:/);
});

test("generates CLI reference markdown from the help table", () => {
  const markdown = createCliReferenceMarkdown();

  assert.match(markdown, /### Browser/);
  assert.match(markdown, /divebell --version.*divebell -v.*installed CLI version/);
  assert.doesNotMatch(markdown, /### Bridge and Browser/);
  assert.match(markdown, /divebell open <url>/);
  assert.match(markdown, /divebell open <url> \[--timeout <ms>\] \[--headers <json>\]/);
  assert.match(markdown, /divebell profiles/);
  assert.match(markdown, /divebell state save <path> \[--url <url>\] \[--include-url <url>\.\.\.\]/);
  assert.match(markdown, /divebell state load <path>/);
  assert.match(markdown, /divebell auth save <name>/);
  assert.match(markdown, /divebell auth login <name>/);
  assert.doesNotMatch(markdown, /divebell auth export/);
  assert.doesNotMatch(markdown, /divebell auth import/);
  assert.doesNotMatch(markdown, /divebell export-profile /);
  assert.doesNotMatch(markdown, /divebell import-profile /);
  assert.doesNotMatch(markdown, /divebell profile /);
  assert.match(markdown, /divebell get-window <path>/);
  assert.match(markdown, /divebell network \[--url <query>\]/);
  assert.doesNotMatch(markdown, /divebell memory /);
  assert.doesNotMatch(markdown, /divebell code-usage /);
  assert.doesNotMatch(markdown, /divebell record /);
  assert.match(markdown, /divebell coverage <status\|start\|take\|stop\|cancel>/);
  assert.match(markdown, /divebell wait-for .*<target-id> <status>.*--next/);
  assert.match(markdown, /divebell extensions add <package-or-path>/);
  assert.doesNotMatch(markdown, /<npm-package>/);
  assert.match(markdown, /divebell extensions list/);
  assert.match(markdown, /divebell stack/);
  assert.match(markdown, /divebell goto <url>/);
  assert.match(markdown, /divebell wait <ref\|selector\|milliseconds>/);
  assert.match(markdown, /divebell check-element <ref\|selector>/);
  assert.match(markdown, /divebell network <route\|unroute\|requests\|request\|har>/);
  assert.match(markdown, /divebell video <start\|stop\|restart>/);
  assert.doesNotMatch(markdown, /divebell record /);
  assert.doesNotMatch(markdown, /divebell close/);
  assert.doesNotMatch(markdown, /\[--open\]/);
  assert.doesNotMatch(markdown, /\p{Script=Han}/u);
  assert.doesNotMatch(markdown, /open[-]runtime/);
  assert.doesNotMatch(markdown, /## Examples/);
});

test("recognizes a bin symlink as the cli entrypoint", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "divebell-cli-"));
  try {
    const entry = join(process.cwd(), "dist", "index.js");
    const bin = join(tempDir, "divebell");
    symlinkSync(entry, bin);

    assert.equal(isEntryPoint(bin, pathToFileURL(entry).href), true);
  } finally {
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});
