import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "@rstest/core";

import {
  cliPackageInfo,
  createDivebellCli,
  createNpmGlobalCliUpdater,
  type CliUpdateNotice,
  type DivebellCliUpdater
} from "../dist/index.js";
import {
  CLI_UPDATE_BACKGROUND_ENV,
  compareCliVersions,
  readCliUpdateCache,
  runCliUpdateBackgroundWorker,
  runCliUpdateWithLock,
  scheduleCliAutoUpdate
} from "../dist/features/update/manager.js";
import { commandData, createOutput } from "./helpers.js";

test("compares stable and prerelease CLI versions without permitting downgrades", () => {
  assert.equal(compareCliVersions("1.2.3", "1.2.2"), 1);
  assert.equal(compareCliVersions("1.2.3", "1.2.3"), 0);
  assert.equal(compareCliVersions("1.2.3-preview.2", "1.2.3-preview.10"), -1);
  assert.equal(compareCliVersions("1.2.3", "1.2.3-preview.10"), 1);
  assert.equal(compareCliVersions("not-a-version", "1.2.3"), null);
});

test("checks and updates through a configured top-level CLI updater", async () => {
  const fixture = createUpdateFixture();
  try {
    const installedVersions: string[] = [];
    const updater = createFakeUpdater({
      getLatestVersion: async () => "1.1.0",
      installVersion: async (version) => {
        installedVersions.push(version);
      }
    });
    const cli = createDivebellCli({ packageInfo: cliPackageInfo, updater });
    const env = { DIVEBELL_HOME: fixture.root };

    const checkOutput = createOutput();
    assert.equal(await cli.run(["update", "--check"], {
      stdout: checkOutput.stdout,
      stderr: checkOutput.stderr,
      env
    }), 0);
    assert.deepEqual(commandData(checkOutput.text()), {
      action: "update_available",
      automatic: false,
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      installedVersion: "1.0.0",
      updaterId: "test-cli",
      message: "Test CLI update available: 1.0.0 -> 1.1.0."
    });
    assert.deepEqual(installedVersions, []);

    const updateOutput = createOutput();
    assert.equal(await cli.run(["update"], {
      stdout: updateOutput.stdout,
      stderr: updateOutput.stderr,
      env
    }), 0);
    assert.equal(commandData<{ action: string }>(updateOutput.text()).action, "updated");
    assert.deepEqual(installedVersions, ["1.1.0"]);
  } finally {
    fixture.cleanup();
  }
});

test("validates update arguments before checking the registry", async () => {
  let checkCount = 0;
  const updater = createFakeUpdater({
    getLatestVersion: async () => {
      checkCount += 1;
      return "1.1.0";
    }
  });
  const cli = createDivebellCli({ packageInfo: cliPackageInfo, updater });

  for (const argv of [
    ["update", "now"],
    ["update", "--unknown"],
    ["update", "--check=false"]
  ]) {
    const output = createOutput();
    assert.equal(await cli.run(argv, {
      stdout: output.stdout,
      stderr: output.stderr
    }), 1);
    const result = JSON.parse(output.text()) as { error: { code: string } };
    assert.match(result.error.code, /^CLI_UPDATE_/u);
  }
  assert.equal(checkCount, 0);
});

test("does not inherit the Divebell updater when embedded in a branded CLI", () => {
  const brandedCli = createDivebellCli({ packageInfo: cliPackageInfo });

  assert.doesNotMatch(brandedCli.createHelpText(), /divebell update/u);
});

test("schedules one detached update check and throttles nearby invocations", () => {
  const fixture = createUpdateFixture();
  try {
    const calls: Array<{ entryScript: string; env: NodeJS.ProcessEnv }> = [];
    const updater = createFakeUpdater();
    const dependencies = {
      cachePath: fixture.cachePath,
      entryScript: "/example/divebell.js",
      now: () => 10_000,
      spawnBackground: (entryScript: string, env: NodeJS.ProcessEnv) => {
        calls.push({ entryScript, env });
      }
    };

    assert.equal(scheduleCliAutoUpdate(updater, ["--help"], {}, dependencies), true);
    assert.equal(scheduleCliAutoUpdate(updater, ["--help"], {}, dependencies), false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.entryScript, "/example/divebell.js");
    assert.equal(calls[0]?.env[CLI_UPDATE_BACKGROUND_ENV], updater.id);
    assert.equal(readCliUpdateCache(fixture.cachePath)?.lastAttemptAtMs, 10_000);

    const brokenUpdater = createFakeUpdater({
      canScheduleAutomaticUpdate: () => {
        throw new Error("broken installation probe");
      }
    });
    assert.equal(scheduleCliAutoUpdate(brokenUpdater, ["--help"], {}, dependencies), false);
  } finally {
    fixture.cleanup();
  }
});

test("runs the background worker before command dispatch and reports its notice once", async () => {
  const fixture = createUpdateFixture();
  try {
    const installedVersions: string[] = [];
    const formatUpdatedNotice = (notice: CliUpdateNotice): string =>
      `Test CLI changed ${notice.fromVersion} -> ${notice.toVersion}; reload its bundled Skill.`;
    const updater = createFakeUpdater({
      disableAutomaticUpdateEnvironmentVariable: "TEST_NO_AUTO_UPDATE",
      getLatestVersion: async () => "1.1.0",
      installVersion: async (version) => {
        installedVersions.push(version);
      },
      formatUpdatedNotice
    });
    const backgroundCli = createDivebellCli({ packageInfo: cliPackageInfo, updater });
    const backgroundOutput = createOutput();
    assert.equal(await backgroundCli.run([], {
      stdout: backgroundOutput.stdout,
      stderr: backgroundOutput.stderr,
      enableAutomaticUpdates: true,
      env: {
        DIVEBELL_HOME: fixture.root,
        [CLI_UPDATE_BACKGROUND_ENV]: updater.id
      }
    }), 0);
    assert.equal(backgroundOutput.text(), "");
    assert.equal(backgroundOutput.errorText(), "");
    assert.deepEqual(installedVersions, ["1.1.0"]);

    const upgradedUpdater = createFakeUpdater({
      currentVersion: "1.1.0",
      disableAutomaticUpdateEnvironmentVariable: "TEST_NO_AUTO_UPDATE",
      formatUpdatedNotice
    });
    const upgradedCli = createDivebellCli({
      packageInfo: cliPackageInfo,
      updater: upgradedUpdater
    });
    const firstOutput = createOutput();
    assert.equal(await upgradedCli.run(["--help"], {
      stdout: firstOutput.stdout,
      stderr: firstOutput.stderr,
      enableAutomaticUpdates: true,
      env: {
        DIVEBELL_HOME: fixture.root,
        TEST_NO_AUTO_UPDATE: "1"
      }
    }), 0);
    assert.match(firstOutput.errorText(), /reload its bundled Skill/u);

    const secondOutput = createOutput();
    assert.equal(await upgradedCli.run(["--help"], {
      stdout: secondOutput.stdout,
      stderr: secondOutput.stderr,
      enableAutomaticUpdates: true,
      env: {
        DIVEBELL_HOME: fixture.root,
        TEST_NO_AUTO_UPDATE: "1"
      }
    }), 0);
    assert.equal(secondOutput.errorText(), "");
  } finally {
    fixture.cleanup();
  }
});

test("marks unmanaged automatic installations fresh without registry access", async () => {
  const fixture = createUpdateFixture();
  try {
    const updater = createFakeUpdater({
      isManagedInstallation: async () => false,
      getLatestVersion: async () => {
        throw new Error("The registry must not be queried.");
      }
    });
    assert.equal(await runCliUpdateBackgroundWorker(updater, {}, {
      cachePath: fixture.cachePath,
      now: () => 20_000
    }), 0);
    assert.equal(readCliUpdateCache(fixture.cachePath)?.checkedAtMs, 20_000);
  } finally {
    fixture.cleanup();
  }
});

test("the npm updater verifies the global package path and installs an exact version", async () => {
  const fixture = createUpdateFixture();
  try {
    const globalRoot = join(fixture.root, "global-node-modules");
    const packageRoot = join(globalRoot, "@scope", "tool");
    mkdirSync(packageRoot, { recursive: true });
    const commands: string[][] = [];
    const updater = createNpmGlobalCliUpdater({
      packageName: "@scope/tool",
      currentVersion: "1.0.0",
      packageRoot,
      displayName: "Example CLI",
      registry: "https://registry.example.test",
      commandRunner: async (command, args) => {
        commands.push([command, ...args]);
        if (args[0] === "view") return commandResult({ stdout: "1.1.0\n" });
        if (args[0] === "root") return commandResult({ stdout: `${globalRoot}\n` });
        if (args[0] === "install") return commandResult();
        throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
      }
    });

    const result = await runCliUpdateWithLock(updater, {}, {}, {
      cachePath: fixture.cachePath,
      now: () => 30_000
    });
    assert.equal(result.action, "updated");
    assert.deepEqual(commands.map((command) => command.slice(0, 2)), [
      ["npm", "view"],
      ["npm", "root"],
      ["npm", "install"]
    ]);
    assert.match(commands.at(-1)?.join(" ") ?? "", /@scope\/tool@1\.1\.0/u);
    assert.match(commands.at(-1)?.join(" ") ?? "", /--registry=https:\/\/registry\.example\.test/u);
    assert.equal(readCliUpdateCache(fixture.cachePath)?.notice, undefined);
  } finally {
    fixture.cleanup();
  }
});

function createFakeUpdater(
  overrides: Partial<DivebellCliUpdater> = {}
): DivebellCliUpdater {
  return {
    id: "test-cli",
    displayName: "Test CLI",
    currentVersion: "1.0.0",
    installationId: "/example/test-cli",
    canScheduleAutomaticUpdate: () => true,
    isManagedInstallation: async () => true,
    getLatestVersion: async () => "1.0.0",
    installVersion: async () => undefined,
    ...overrides
  };
}

function commandResult(overrides: Partial<{
  status: number | null;
  stdout: string;
  stderr: string;
  error: Error;
}> = {}): {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
} {
  return {
    status: 0,
    stdout: "",
    stderr: "",
    ...overrides
  };
}

function createUpdateFixture(): {
  root: string;
  cachePath: string;
  cleanup(): void;
} {
  const root = mkdtempSync(join(tmpdir(), "divebell-cli-update-"));
  return {
    root,
    cachePath: join(root, "update.json"),
    cleanup: () => rmSync(root, { recursive: true, force: true })
  };
}
